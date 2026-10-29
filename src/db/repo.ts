import type { SQLiteDatabase } from 'expo-sqlite';

import type { ScheduleInput } from '@/domain/schedules';
import type {
  Account,
  Asset,
  Category,
  CategoryKind,
  ISODate,
  NewTransaction,
  PricePoint,
  PriceSource,
  Schedule,
  Snapshot,
  Transaction,
  UpdateFrequency,
  Valuation,
} from '@/domain/types';

/*
 * Every function takes the database as first argument, so it can also be called with the `txn`
 * handed out by `withExclusiveTransactionAsync`.
 * Money amounts are stored as integer cents; quantities and unit prices as REAL (crypto needs decimals).
 */

const toCents = (euros: number) => Math.round(euros * 100);
const fromCents = (cents: number) => cents / 100;

type Row = Record<string, any>;

const mapCategory = (r: Row): Category => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  valuation: r.valuation,
  color: r.color,
  sortOrder: r.sort_order,
  isDefault: !!r.is_default,
  targetWeight: r.target_weight ?? null,
  updateReminder: r.update_reminder ?? 'monthly',
});
const mapAccount = (r: Row): Account => ({
  id: r.id,
  name: r.name,
  institution: r.institution,
  note: r.note,
  archived: !!r.archived,
  createdAt: r.created_at,
});
const mapAsset = (r: Row): Asset => ({
  id: r.id,
  accountId: r.account_id,
  categoryId: r.category_id,
  name: r.name,
  identifier: r.identifier,
  valuation: r.valuation,
  note: r.note,
  reviewDate: r.review_date ?? null,
  archived: !!r.archived,
  createdAt: r.created_at,
});
const mapTransaction = (r: Row): Transaction => ({
  id: r.id,
  assetId: r.asset_id,
  type: r.type,
  date: r.date,
  quantity: r.quantity,
  unitPrice: r.unit_price,
  amount: fromCents(r.amount_cents),
  fees: fromCents(r.fees_cents),
  note: r.note,
  linkedId: r.linked_id ?? null,
  createdAt: r.created_at,
});
const mapPrice = (r: Row): PricePoint => ({
  id: r.id,
  assetId: r.asset_id,
  date: r.date,
  price: r.price,
  source: r.source === 'online' ? 'online' : 'manual',
  createdAt: r.created_at ?? null,
});

const mapSchedule = (r: Row): Schedule => ({
  id: r.id,
  assetId: r.asset_id,
  type: r.type,
  amount: fromCents(r.amount_cents),
  day: r.day,
  startDate: r.start_date,
  doneUntil: r.done_until ?? null,
  cashAssetId: r.cash_asset_id ?? null,
  rate: r.rate ?? null,
  createdAt: r.created_at ?? null,
});

export async function loadSnapshot(db: SQLiteDatabase): Promise<Snapshot> {
  const [categories, accounts, assets, transactions, prices, schedules] = await Promise.all([
    db.getAllAsync<Row>('SELECT * FROM categories ORDER BY sort_order, id'),
    db.getAllAsync<Row>('SELECT * FROM accounts ORDER BY name'),
    db.getAllAsync<Row>('SELECT * FROM assets ORDER BY name'),
    db.getAllAsync<Row>('SELECT * FROM transactions ORDER BY date, id'),
    db.getAllAsync<Row>('SELECT * FROM prices ORDER BY date, id'),
    db.getAllAsync<Row>('SELECT * FROM schedules ORDER BY id'),
  ]);
  return {
    categories: categories.map(mapCategory),
    accounts: accounts.map(mapAccount),
    assets: assets.map(mapAsset),
    transactions: transactions.map(mapTransaction),
    prices: prices.map(mapPrice),
    schedules: schedules.map(mapSchedule),
  };
}

// --- Accounts ---------------------------------------------------------------

export async function insertAccount(db: SQLiteDatabase, a: { name: string; institution?: string | null }) {
  const res = await db.runAsync('INSERT INTO accounts (name, institution) VALUES (?, ?)', [
    a.name.trim(),
    a.institution?.trim() || null,
  ]);
  return res.lastInsertRowId;
}

export async function updateAccount(
  db: SQLiteDatabase,
  id: number,
  a: { name: string; institution: string | null; archived: boolean },
) {
  await db.runAsync('UPDATE accounts SET name = ?, institution = ?, archived = ? WHERE id = ?', [
    a.name.trim(),
    a.institution?.trim() || null,
    a.archived ? 1 : 0,
    id,
  ]);
}

// --- Categories -------------------------------------------------------------

export async function insertCategory(
  db: SQLiteDatabase,
  c: { name: string; kind: CategoryKind; valuation: Valuation; color: string },
) {
  const res = await db.runAsync(
    `INSERT INTO categories (name, kind, valuation, color, sort_order)
     VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories))`,
    [c.name.trim(), c.kind, c.valuation, c.color],
  );
  return res.lastInsertRowId;
}

export async function updateCategory(
  db: SQLiteDatabase,
  id: number,
  c: { name: string; color: string; updateReminder: UpdateFrequency },
) {
  await db.runAsync('UPDATE categories SET name = ?, color = ?, update_reminder = ? WHERE id = ?', [
    c.name.trim(),
    c.color,
    c.updateReminder,
    id,
  ]);
}

/** Replaces the whole target allocation: categories not in `targets` are excluded (null). */
export async function setCategoryTargets(db: SQLiteDatabase, targets: Map<number, number>) {
  await db.runAsync('UPDATE categories SET target_weight = NULL');
  for (const [id, weight] of targets) {
    await db.runAsync('UPDATE categories SET target_weight = ? WHERE id = ?', [weight, id]);
  }
}

/** Fails (foreign key) if assets still use the category. */
export async function deleteCategory(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM categories WHERE id = ?', [id]);
}

// --- Assets -----------------------------------------------------------------

export interface AssetInput {
  accountId: number;
  categoryId: number;
  name: string;
  identifier: string | null;
  valuation: Valuation;
  note?: string | null;
  reviewDate?: ISODate | null;
}

export async function insertAsset(db: SQLiteDatabase, a: AssetInput) {
  const res = await db.runAsync(
    'INSERT INTO assets (account_id, category_id, name, identifier, valuation, note, review_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [a.accountId, a.categoryId, a.name.trim(), a.identifier?.trim() || null, a.valuation, a.note?.trim() || null, a.reviewDate ?? null],
  );
  return res.lastInsertRowId;
}

export async function updateAsset(
  db: SQLiteDatabase,
  id: number,
  // note and reviewDate are required here so an edit can't silently erase them.
  a: Omit<AssetInput, 'valuation' | 'note' | 'reviewDate'> & {
    note: string | null;
    reviewDate: ISODate | null;
    archived: boolean;
  },
) {
  await db.runAsync(
    'UPDATE assets SET account_id = ?, category_id = ?, name = ?, identifier = ?, note = ?, review_date = ?, archived = ? WHERE id = ?',
    [
      a.accountId,
      a.categoryId,
      a.name.trim(),
      a.identifier?.trim() || null,
      a.note?.trim() || null,
      a.reviewDate ?? null,
      a.archived ? 1 : 0,
      id,
    ],
  );
}

/** Updates only the note and review date. */
export async function updateAssetNotes(db: SQLiteDatabase, id: number, n: { note: string | null; reviewDate: ISODate | null }) {
  await db.runAsync('UPDATE assets SET note = ?, review_date = ? WHERE id = ?', [n.note?.trim() || null, n.reviewDate, id]);
}

/** Also deletes the asset's transactions and prices. */
export async function deleteAsset(db: SQLiteDatabase, id: number) {
  // Cash movements of other investments stay (the money did move) but lose their link.
  await db.runAsync(
    'UPDATE transactions SET linked_id = NULL WHERE linked_id IN (SELECT id FROM transactions WHERE asset_id = ?)',
    [id],
  );
  await db.runAsync('DELETE FROM assets WHERE id = ?', [id]);
}

// --- Transactions & prices --------------------------------------------------

export type TransactionInput = NewTransaction;

export async function insertTransaction(db: SQLiteDatabase, t: TransactionInput) {
  const res = await db.runAsync(
    `INSERT INTO transactions (asset_id, type, date, quantity, unit_price, amount_cents, fees_cents, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [t.assetId, t.type, t.date, t.quantity, t.unitPrice, toCents(t.amount), toCents(t.fees), t.note?.trim() || null],
  );
  return res.lastInsertRowId;
}

export async function updateTransaction(db: SQLiteDatabase, id: number, t: TransactionInput) {
  await db.runAsync(
    `UPDATE transactions SET asset_id = ?, type = ?, date = ?, quantity = ?, unit_price = ?, amount_cents = ?,
     fees_cents = ?, note = ? WHERE id = ?`,
    [t.assetId, t.type, t.date, t.quantity, t.unitPrice, toCents(t.amount), toCents(t.fees), t.note?.trim() || null, id],
  );
}

export async function deleteTransaction(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
}

/** Links two transactions to each other (a buy and the cash withdrawal that paid it…). */
export async function linkTransactions(db: SQLiteDatabase, a: number, b: number | null) {
  await db.runAsync('UPDATE transactions SET linked_id = ? WHERE id = ?', [b, a]);
  if (b !== null) await db.runAsync('UPDATE transactions SET linked_id = ? WHERE id = ?', [a, b]);
}

/**
 * Makes the cash side of `mainId` match `cash`: creates it, updates it (even moved to another cash
 * account), or deletes it when `cash` is null. `linkedId` is the current cash side, if any.
 */
export async function syncLinkedCash(db: SQLiteDatabase, mainId: number, linkedId: number | null, cash: TransactionInput | null) {
  if (linkedId !== null && cash) {
    await updateTransaction(db, linkedId, cash);
  } else if (linkedId !== null) {
    await deleteTransaction(db, linkedId);
    await linkTransactions(db, mainId, null);
  } else if (cash) {
    await linkTransactions(db, mainId, await insertTransaction(db, cash));
  }
}

/** One price per asset per day: a second update on the same day replaces the first (and its source). */
export async function upsertPrice(
  db: SQLiteDatabase,
  /** `createdAt`: keep the original save time (editing); otherwise now. */
  p: { assetId: number; date: ISODate; price: number; source?: PriceSource; createdAt?: string | null },
) {
  await db.runAsync(
    `INSERT INTO prices (asset_id, date, price, source, created_at) VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))
     ON CONFLICT (asset_id, date) DO UPDATE SET price = excluded.price, source = excluded.source, created_at = excluded.created_at`,
    [p.assetId, p.date, p.price, p.source ?? 'manual', p.createdAt ?? null],
  );
}

export async function deletePrice(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM prices WHERE id = ?', [id]);
}

/** Removes an asset's price of one day (undo of a new upsertPrice). */
export async function deletePriceOn(db: SQLiteDatabase, assetId: number, date: ISODate) {
  await db.runAsync('DELETE FROM prices WHERE asset_id = ? AND date = ?', [assetId, date]);
}

// --- Add / edit operation form ---------------------------------------------

/** An investment created by the Add form, with its new account / category if needed. */
export interface NewAssetSave {
  account: number | { name: string };
  category: number | { name: string; kind: CategoryKind; valuation: Valuation; color: string };
  name: string;
  identifier: string | null;
  valuation: Valuation;
  note: string | null;
}

/** What the operation form saves (see `evaluateOperation` / `evaluateCashLink` in domain/operations). */
export interface OperationSave {
  /** Existing investment id, or the investment to create. */
  asset: number | NewAssetSave;
  /** A price / value update; when set, `transactions` is ignored. */
  price: { date: ISODate; price: number } | null;
  /** Their `assetId` is replaced by the investment's. */
  transactions: NewTransaction[];
  /** Cash side paid from / into (first transaction only); null: not tracked. */
  cash: NewTransaction | null;
  /** The entry being edited, if any. */
  edit?: { price: PricePoint } | { transaction: Transaction };
}

/**
 * Saves an operation of the Add / Edit form: creates the investment if needed, writes the price or
 * the transactions, and keeps the linked cash side in step. Returns the investment id.
 * Call it inside `write()` so it all happens in one transaction.
 */
export async function saveOperation(db: SQLiteDatabase, op: OperationSave): Promise<number> {
  const assetId = typeof op.asset === 'number' ? op.asset : await insertNewAsset(db, op.asset);
  const editPrice = op.edit && 'price' in op.edit ? op.edit.price : undefined;
  const editTx = op.edit && 'transaction' in op.edit ? op.edit.transaction : undefined;

  if (op.price) {
    if (editPrice) await deletePrice(db, editPrice.id);
    // An edited price keeps its place in its day (its original save time).
    await upsertPrice(db, { assetId, ...op.price, createdAt: editPrice?.createdAt });
  } else if (editTx) {
    await updateTransaction(db, editTx.id, { ...op.transactions[0], assetId });
    // The cash side follows: updated, moved to another account, created or removed.
    if (op.cash || editTx.linkedId != null) await syncLinkedCash(db, editTx.id, editTx.linkedId ?? null, op.cash);
  } else {
    for (const [i, tx] of op.transactions.entries()) {
      const id = await insertTransaction(db, { ...tx, assetId });
      if (i === 0 && op.cash) await syncLinkedCash(db, id, null, op.cash);
    }
  }
  return assetId;
}

async function insertNewAsset(db: SQLiteDatabase, a: NewAssetSave) {
  const accountId = typeof a.account === 'number' ? a.account : await insertAccount(db, a.account);
  const categoryId = typeof a.category === 'number' ? a.category : await insertCategory(db, a.category);
  return insertAsset(db, { accountId, categoryId, name: a.name, identifier: a.identifier, valuation: a.valuation, note: a.note });
}

// --- Scheduled operations ---------------------------------------------------

export async function insertSchedule(db: SQLiteDatabase, s: ScheduleInput) {
  const res = await db.runAsync(
    'INSERT INTO schedules (asset_id, type, amount_cents, day, start_date, cash_asset_id, rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [s.assetId, s.type, toCents(s.amount), s.day, s.startDate, s.cashAssetId, s.rate],
  );
  return res.lastInsertRowId;
}

/** A new start date restarts the schedule from there (nothing before it is proposed any more). */
export async function updateSchedule(db: SQLiteDatabase, id: number, s: ScheduleInput, restart: boolean) {
  await db.runAsync(
    `UPDATE schedules SET type = ?, amount_cents = ?, day = ?, start_date = ?, cash_asset_id = ?, rate = ?${restart ? ', done_until = NULL' : ''}
     WHERE id = ?`,
    [s.type, toCents(s.amount), s.day, s.startDate, s.cashAssetId, s.rate, id],
  );
}

export async function deleteSchedule(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM schedules WHERE id = ?', [id]);
}

export async function restoreSchedule(db: SQLiteDatabase, s: Schedule) {
  await db.runAsync(
    `INSERT INTO schedules (id, asset_id, type, amount_cents, day, start_date, done_until, cash_asset_id, rate, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
    [s.id, s.assetId, s.type, toCents(s.amount), s.day, s.startDate, s.doneUntil, s.cashAssetId, s.rate, s.createdAt ?? null],
  );
}

/** One reviewed occurrence: saved (`records`) or skipped (null). See `occurrenceRecords` in domain/schedules. */
export interface ScheduledSave {
  scheduleId: number;
  date: ISODate;
  records: { main: NewTransaction; cash: NewTransaction | null; linked: boolean } | null;
}

/**
 * Saves the reviewed occurrences and marks them done (a skipped one too). Returns the ids of the
 * transactions created, for an undo.
 */
export async function saveScheduled(db: SQLiteDatabase, items: ScheduledSave[]): Promise<number[]> {
  const created: number[] = [];
  for (const item of items) {
    if (item.records) {
      const { main, cash, linked } = item.records;
      const id = await insertTransaction(db, main);
      created.push(id);
      if (cash) {
        const cashId = await insertTransaction(db, cash);
        created.push(cashId);
        if (linked) await linkTransactions(db, id, cashId);
      }
    }
    await db.runAsync(
      'UPDATE schedules SET done_until = ? WHERE id = ? AND (done_until IS NULL OR done_until < ?)',
      [item.date, item.scheduleId, item.date],
    );
  }
  return created;
}

/** Undoes `saveScheduled`: the transactions go, and the occurrences are due again. */
export async function undoScheduled(db: SQLiteDatabase, transactionIds: number[], doneUntil: Map<number, ISODate | null>) {
  for (const id of transactionIds) await deleteTransaction(db, id);
  for (const [id, date] of doneUntil) await db.runAsync('UPDATE schedules SET done_until = ? WHERE id = ?', [date, id]);
}

// --- Settings ---------------------------------------------------------------

export async function loadSettings(db: SQLiteDatabase): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

// --- Whole database (backup / demo) -----------------------------------------

export async function clearData(db: SQLiteDatabase) {
  await db.execAsync(
    'DELETE FROM schedules; DELETE FROM transactions; DELETE FROM prices; DELETE FROM assets; DELETE FROM accounts; DELETE FROM categories;',
  );
}

/** Replaces all financial data with `s`, keeping ids so references stay valid. Settings are kept. */
export async function replaceAll(db: SQLiteDatabase, s: Snapshot) {
  await clearData(db);
  for (const c of s.categories) {
    await db.runAsync(
      `INSERT INTO categories (id, name, kind, valuation, color, sort_order, is_default, target_weight, update_reminder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.id, c.name, c.kind, c.valuation, c.color, c.sortOrder, c.isDefault ? 1 : 0, c.targetWeight, c.updateReminder],
    );
  }
  for (const a of s.accounts) {
    await db.runAsync('INSERT INTO accounts (id, name, institution, note, archived, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
      a.id,
      a.name,
      a.institution,
      a.note,
      a.archived ? 1 : 0,
      a.createdAt,
    ]);
  }
  for (const a of s.assets) await restoreAssetRow(db, a);
  for (const t of s.transactions) await restoreTransaction(db, t);
  for (const p of s.prices) await restorePrice(db, p);
  for (const x of s.schedules) await restoreSchedule(db, x);
}

// --- Re-inserting deleted rows with their original id (undo, backup restore) ---

async function restoreAssetRow(db: SQLiteDatabase, a: Asset) {
  await db.runAsync(
    `INSERT INTO assets (id, account_id, category_id, name, identifier, valuation, note, review_date, archived, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [a.id, a.accountId, a.categoryId, a.name, a.identifier, a.valuation, a.note, a.reviewDate, a.archived ? 1 : 0, a.createdAt],
  );
}

export async function restoreTransaction(db: SQLiteDatabase, t: Transaction) {
  await db.runAsync(
    `INSERT INTO transactions (id, asset_id, type, date, quantity, unit_price, amount_cents, fees_cents, note, linked_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
    [t.id, t.assetId, t.type, t.date, t.quantity, t.unitPrice, toCents(t.amount), toCents(t.fees), t.note, t.linkedId ?? null, t.createdAt ?? null],
  );
}

export async function restorePrice(db: SQLiteDatabase, p: PricePoint) {
  await db.runAsync("INSERT INTO prices (id, asset_id, date, price, source, created_at) VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))", [
    p.id,
    p.assetId,
    p.date,
    p.price,
    p.source,
    p.createdAt ?? null,
  ]);
}

/** Undoes `deleteAsset`: the asset comes back with its whole history, under the same ids. */
export async function restoreAsset(
  db: SQLiteDatabase,
  a: Asset,
  transactions: Transaction[],
  prices: PricePoint[],
  schedules: { own: Schedule[]; paidFrom: number[] } = { own: [], paidFrom: [] },
) {
  await restoreAssetRow(db, a);
  for (const t of transactions) await restoreTransaction(db, t);
  for (const p of prices) await restorePrice(db, p);
  // Its scheduled operations, and the other schedules paid from it (`deleteAsset` cleared them).
  for (const x of schedules.own) await restoreSchedule(db, x);
  for (const id of schedules.paidFrom) await db.runAsync('UPDATE schedules SET cash_asset_id = ? WHERE id = ?', [a.id, id]);
  // Re-link the cash movements of other investments that `deleteAsset` unlinked.
  for (const t of transactions) {
    if (t.linkedId != null) await db.runAsync('UPDATE transactions SET linked_id = ? WHERE id = ?', [t.id, t.linkedId]);
  }
}
