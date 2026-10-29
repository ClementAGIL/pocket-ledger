import type { SQLiteDatabase } from 'expo-sqlite';

import type { CategoryKind, UpdateFrequency, Valuation } from '@/domain/types';

/** Default categories whose values aren't updated monthly. */
const DEFAULT_UPDATE_REMINDERS: Record<string, UpdateFrequency> = { 'Real estate': 'never' };

export const DEFAULT_CATEGORIES: { name: string; kind: CategoryKind; valuation: Valuation; color: string }[] = [
  { name: 'Cash', kind: 'asset', valuation: 'balance', color: '#2E90FA' },
  { name: 'Stock', kind: 'asset', valuation: 'units', color: '#7A5AF8' },
  { name: 'ETF', kind: 'asset', valuation: 'units', color: '#12B76A' },
  { name: 'Crypto', kind: 'asset', valuation: 'units', color: '#F79009' },
  { name: 'Real estate', kind: 'asset', valuation: 'balance', color: '#EE46BC' },
  { name: 'Bonds', kind: 'asset', valuation: 'units', color: '#0BA5EC' },
  { name: 'Funds', kind: 'asset', valuation: 'units', color: '#15B79E' },
  { name: 'Retirement (PER)', kind: 'asset', valuation: 'balance', color: '#6172F3' },
  { name: 'Precious metals', kind: 'asset', valuation: 'units', color: '#CA8504' },
  { name: 'Other', kind: 'asset', valuation: 'balance', color: '#667085' },
  { name: 'Loan', kind: 'liability', valuation: 'balance', color: '#F04438' },
];

/** Each entry migrates from version `index` to `index + 1`. Never edit a shipped migration: append a new one. */
const MIGRATIONS: ((db: SQLiteDatabase) => Promise<void>)[] = [
  async (db) => {
    await db.execAsync(`
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        kind TEXT NOT NULL CHECK (kind IN ('asset', 'liability')),
        valuation TEXT NOT NULL CHECK (valuation IN ('units', 'balance')),
        color TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0,
        -- Share of the rebalanced assets (0–1); NULL = left out of the target allocation.
        target_weight REAL,
        update_reminder TEXT NOT NULL DEFAULT 'monthly' CHECK (update_reminder IN ('monthly', 'yearly', 'never'))
      );
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        institution TEXT,
        note TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        name TEXT NOT NULL,
        identifier TEXT,
        valuation TEXT NOT NULL CHECK (valuation IN ('units', 'balance')),
        note TEXT,
        review_date TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL', 'DEPOSIT', 'WITHDRAW', 'INCOME')),
        date TEXT NOT NULL,
        quantity REAL,
        unit_price REAL,
        amount_cents INTEGER NOT NULL,
        fees_cents INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        -- Other half of a cash transfer (a buy and the withdrawal that paid it); both rows point to each other.
        linked_id INTEGER,
        -- Save time (UTC): orders the entries of one day.
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_transactions_asset_date ON transactions(asset_id, date);
      CREATE TABLE prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        price REAL NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'online')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (asset_id, date)
      );
      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    await seedDefaultCategories(db);
  },
  // 2: scheduled operations (monthly buys, deposits, loan payments), confirmed by the user when due.
  async (db) => {
    await db.execAsync(`
      CREATE TABLE schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('BUY', 'DEPOSIT', 'WITHDRAW')),
        amount_cents INTEGER NOT NULL,
        day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
        start_date TEXT NOT NULL,
        -- Occurrences up to this date are confirmed or skipped.
        done_until TEXT,
        cash_asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
        -- Loans: yearly interest rate (0.035 = 3.5%).
        rate REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_schedules_asset ON schedules(asset_id);
    `);
  },
];

/** The default categories, with their reminder frequency (e.g. Real estate → never). */
export async function seedDefaultCategories(db: SQLiteDatabase) {
  for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
    await db.runAsync(
      'INSERT INTO categories (name, kind, valuation, color, sort_order, is_default, update_reminder) VALUES (?, ?, ?, ?, ?, 1, ?)',
      [c.name, c.kind, c.valuation, c.color, i, DEFAULT_UPDATE_REMINDERS[c.name] ?? 'monthly'],
    );
  }
}

export const SCHEMA_VERSION = MIGRATIONS.length;

const TABLES = ['schedules', 'prices', 'transactions', 'assets', 'accounts', 'categories', 'settings'];

export async function migrate(db: SQLiteDatabase, { isDev = __DEV__ }: { isDev?: boolean } = {}) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  // A database newer than this app: recreated in development (demo data), refused in a release
  // build, where it would lose data.
  if (version > SCHEMA_VERSION) {
    if (!isDev) throw new Error(`Database version ${version} is newer than this app (${SCHEMA_VERSION}). Update the app.`);
    await db.execAsync('PRAGMA foreign_keys = OFF;');
    for (const table of TABLES) await db.execAsync(`DROP TABLE IF EXISTS ${table};`);
    await db.execAsync('PRAGMA user_version = 0; PRAGMA foreign_keys = ON;');
    version = 0;
  }

  while (version < SCHEMA_VERSION) {
    await db.withTransactionAsync(async () => {
      await MIGRATIONS[version](db);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
    version++;
  }
}
