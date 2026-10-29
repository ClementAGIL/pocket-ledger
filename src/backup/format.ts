import { isISODate } from '@/domain/dates';
import type { Snapshot } from '@/domain/types';

const APP_ID = 'pocket-ledger';
/** When the format changes, bump it and keep the older versions importable. */
const FORMAT_VERSION = 9;
/** 9: scheduled operations (`schedules`); 8 has none. */
const SUPPORTED_VERSIONS = [8, 9];

export interface BackupFile {
  app: typeof APP_ID;
  formatVersion: number;
  exportedAt: string;
  data: Snapshot;
}

export function serializeBackup(data: Snapshot, now = new Date()): string {
  const file: BackupFile = { app: APP_ID, formatVersion: FORMAT_VERSION, exportedAt: now.toISOString(), data };
  return JSON.stringify(file, null, 2);
}

class BackupError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown) => Number.isInteger(v) && (v as number) > 0;
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);
const isStr = (v: unknown) => typeof v === 'string' && v.length > 0;
const isStrOrNull = (v: unknown) => v === null || typeof v === 'string';

function check(cond: boolean, what: string): asserts cond {
  if (!cond) throw new BackupError(`Invalid backup: ${what}`);
}

function list(data: Record<string, unknown>, key: keyof Snapshot) {
  const value = data[key];
  check(Array.isArray(value) && value.every(isObj), `"${key}" must be a list`);
  return value as Record<string, any>[];
}

/** Parses and validates a backup file. Throws an Error with a readable message when invalid. */
export function parseBackup(text: string): Snapshot {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError('This file is not valid JSON.');
  }
  check(isObj(json) && json.app === APP_ID, 'not a Pocket Ledger backup');
  check(
    SUPPORTED_VERSIONS.includes(json.formatVersion as number),
    `unsupported format version ${String(json.formatVersion)}`,
  );
  check(isObj(json.data), 'missing data');
  const data = json.data;

  const categories = list(data, 'categories');
  const accounts = list(data, 'accounts');
  const assets = list(data, 'assets');
  const transactions = list(data, 'transactions');
  const prices = list(data, 'prices');
  const schedules = json.formatVersion === 8 ? [] : list(data, 'schedules');

  const categoryIds = new Set<number>();
  for (const c of categories) {
    check(isId(c.id) && isStr(c.name) && isStr(c.color) && isNum(c.sortOrder), 'category fields');
    check(c.kind === 'asset' || c.kind === 'liability', `category kind "${c.kind}"`);
    check(c.valuation === 'units' || c.valuation === 'balance', `category valuation "${c.valuation}"`);
    check(c.targetWeight === null || (isNum(c.targetWeight) && c.targetWeight >= 0 && c.targetWeight <= 1), 'category target');
    check(['monthly', 'yearly', 'never'].includes(c.updateReminder), 'category update reminder');
    categoryIds.add(c.id);
  }
  const accountIds = new Set<number>();
  for (const a of accounts) {
    check(isId(a.id) && isStr(a.name) && isStrOrNull(a.institution) && isStrOrNull(a.note), 'account fields');
    accountIds.add(a.id);
  }
  const assetIds = new Set<number>();
  for (const a of assets) {
    check(isId(a.id) && isStr(a.name) && isStrOrNull(a.identifier) && isStrOrNull(a.note), 'asset fields');
    check(a.valuation === 'units' || a.valuation === 'balance', `asset valuation "${a.valuation}"`);
    check(a.reviewDate === null || isISODate(a.reviewDate), `asset review date "${a.reviewDate}"`);
    check(accountIds.has(a.accountId), `asset "${a.name}" references an unknown account`);
    check(categoryIds.has(a.categoryId), `asset "${a.name}" references an unknown category`);
    assetIds.add(a.id);
  }
  for (const t of transactions) {
    check(isId(t.id) && assetIds.has(t.assetId), 'transaction references an unknown asset');
    check(['BUY', 'SELL', 'DEPOSIT', 'WITHDRAW', 'INCOME'].includes(t.type), `transaction type "${t.type}"`);
    check(isISODate(t.date), `transaction date "${t.date}"`);
    check(isNumOrNull(t.quantity) && isNumOrNull(t.unitPrice) && isNum(t.amount) && isNum(t.fees), 'transaction amounts');
    check(isStrOrNull(t.note), 'transaction note');
    check(t.linkedId === null || isId(t.linkedId), 'transaction link');
    check(isStr(t.createdAt), 'transaction time');
  }
  const txIds = new Set(transactions.map((t) => t.id));
  for (const p of prices) {
    check(isId(p.id) && assetIds.has(p.assetId), 'price references an unknown asset');
    check(isISODate(p.date) && isNum(p.price), 'price fields');
    check(p.source === 'manual' || p.source === 'online', `price source "${String(p.source)}"`);
    check(isStr(p.createdAt), 'price time');
  }
  for (const x of schedules) {
    check(isId(x.id) && assetIds.has(x.assetId), 'scheduled operation references an unknown asset');
    check(['BUY', 'DEPOSIT', 'WITHDRAW'].includes(x.type), `scheduled operation type "${x.type}"`);
    check(isNum(x.amount) && Number.isInteger(x.day) && x.day >= 1 && x.day <= 31, 'scheduled operation amount and day');
    check(isISODate(x.startDate) && (x.doneUntil === null || isISODate(x.doneUntil)), 'scheduled operation dates');
    check(isNumOrNull(x.rate), 'scheduled operation rate');
  }

  return {
    categories: categories.map((c) => ({ ...c, isDefault: !!c.isDefault })) as Snapshot['categories'],
    accounts: accounts.map((a) => ({ ...a, archived: !!a.archived, createdAt: String(a.createdAt ?? '') })) as Snapshot['accounts'],
    assets: assets.map((a) => ({ ...a, archived: !!a.archived, createdAt: String(a.createdAt ?? '') })) as Snapshot['assets'],
    // A link to a missing transaction is dropped rather than refusing the file.
    transactions: transactions.map((t) => ({
      ...t,
      linkedId: t.linkedId !== null && txIds.has(t.linkedId) ? t.linkedId : null,
    })) as Snapshot['transactions'],
    prices: prices as Snapshot['prices'],
    // Paid from a cash asset that isn't in the file: not tracked.
    schedules: schedules.map((x) => ({
      ...x,
      cashAssetId: isId(x.cashAssetId) && assetIds.has(x.cashAssetId) ? x.cashAssetId : null,
    })) as Snapshot['schedules'],
  };
}
