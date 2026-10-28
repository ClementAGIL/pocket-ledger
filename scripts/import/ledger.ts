import { DEFAULT_CATEGORIES } from '@/db/migrations';
import { addMonths, fromISODate, toISODate } from '@/domain/dates';
import type { Asset, Category, ISODate, PricePoint, Snapshot, Transaction, TxType, Valuation } from '@/domain/types';

/*
 * What every broker/bank converter produces: one account, its investments and their operations,
 * in euros. `mergeAccount` turns it into backup data ("Restore from a file" in the app).
 */

export interface ImportedAsset {
  /** Unique within the import (ISIN, IBAN…), used by the operations. */
  key: string;
  name: string;
  /** Category name ("Stock", "ETF", "Cash"…): created if the backup doesn't have it. */
  category: string;
  valuation: Valuation;
  identifier: string | null;
}

export interface ImportedOperation {
  asset: string;
  type: TxType;
  date: ISODate;
  /** 'HH:MM' from the statement: orders the operations of a day. */
  time: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
  fees: number;
  note: string | null;
  /**
   * Paid from / into the account's cash asset: a BUY gets a linked WITHDRAW (amount + fees), a
   * SELL or INCOME a linked DEPOSIT (amount − fees), as the app's "Paid from / Paid into" does.
   */
  cash?: string;
}

/** A market price (e.g. a month-end close fetched by the import), saved as an online price. */
export interface ImportedPrice {
  asset: string;
  date: ISODate;
  price: number;
}

export interface ImportedAccount {
  name: string;
  institution: string | null;
  assets: ImportedAsset[];
  operations: ImportedOperation[];
  prices?: ImportedPrice[];
}

export interface MergeResult {
  snapshot: Snapshot;
  /** What the account held before it was replaced (re-import of the same account), else null. */
  replaced: { assets: number; transactions: number } | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const OTHER_COLOR = '#667085';

export function emptySnapshot(): Snapshot {
  const categories: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({
    id: i + 1,
    name: c.name,
    kind: c.kind,
    valuation: c.valuation,
    color: c.color,
    sortOrder: i,
    isDefault: true,
    targetWeight: null,
    updateReminder: c.name === 'Real estate' ? 'never' : 'monthly',
  }));
  return { categories, accounts: [], assets: [], transactions: [], prices: [] };
}

const nextId = (rows: { id: number }[]) => rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Adds an imported account to a backup without touching anything else. An account with the same
 * name is replaced (its investments, operations and prices), so importing the same statement
 * again, or a newer one, updates it instead of duplicating it.
 */
export function mergeAccount(base: Snapshot | null, imported: ImportedAccount, now = new Date()): MergeResult {
  const source = base ?? emptySnapshot();
  const snapshot: Snapshot = {
    categories: [...source.categories],
    accounts: [...source.accounts],
    assets: [...source.assets],
    transactions: [...source.transactions],
    prices: [...source.prices],
  };
  const stamp = now.toISOString().slice(0, 19).replace('T', ' ');

  // Replace the previous import of this account, keep everything else.
  let account = snapshot.accounts.find((a) => sameName(a.name, imported.name));
  let replaced: MergeResult['replaced'] = null;
  if (account) {
    const accountId = account.id;
    const oldAssets = new Set(snapshot.assets.filter((a) => a.accountId === accountId).map((a) => a.id));
    const oldTx = new Set(snapshot.transactions.filter((t) => oldAssets.has(t.assetId)).map((t) => t.id));
    replaced = { assets: oldAssets.size, transactions: oldTx.size };
    snapshot.assets = snapshot.assets.filter((a) => !oldAssets.has(a.id));
    snapshot.prices = snapshot.prices.filter((p) => !oldAssets.has(p.assetId));
    // A transfer from another account to a replaced one loses its link, not its entry.
    snapshot.transactions = snapshot.transactions
      .filter((t) => !oldTx.has(t.id))
      .map((t) => (t.linkedId != null && oldTx.has(t.linkedId) ? { ...t, linkedId: null } : t));
  } else {
    account = { id: nextId(snapshot.accounts), name: imported.name, institution: imported.institution, note: null, archived: false, createdAt: stamp };
    snapshot.accounts.push(account);
  }

  const categoryId = (name: string, valuation: Valuation) => {
    let category = snapshot.categories.find((c) => sameName(c.name, name));
    if (!category) {
      category = {
        id: nextId(snapshot.categories),
        name,
        kind: 'asset',
        valuation,
        color: OTHER_COLOR,
        sortOrder: snapshot.categories.length,
        isDefault: false,
        targetWeight: null,
        updateReminder: 'monthly',
      };
      snapshot.categories.push(category);
    }
    return category.id;
  };

  const operations = [...imported.operations].sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : a.date + a.time > b.date + b.time ? 1 : 0));
  const firstSeen = new Map<string, string>();
  for (const op of operations) if (!firstSeen.has(op.asset)) firstSeen.set(op.asset, `${op.date} ${op.time}:00`);

  const assetIds = new Map<string, number>();
  for (const a of imported.assets) {
    if (!firstSeen.has(a.key)) continue;
    const asset: Asset = {
      id: nextId(snapshot.assets),
      accountId: account.id,
      categoryId: categoryId(a.category, a.valuation),
      name: a.name,
      identifier: a.identifier,
      valuation: a.valuation,
      note: null,
      reviewDate: null,
      archived: false,
      createdAt: firstSeen.get(a.key)!,
    };
    snapshot.assets.push(asset);
    assetIds.set(a.key, asset.id);
  }

  // Save times keep the statement's order inside a day (see compareEntries): one second apart.
  const perMinute = new Map<string, number>();
  const createdAt = (op: ImportedOperation) => {
    const minute = `${op.date} ${op.time}`;
    const n = perMinute.get(minute) ?? 0;
    perMinute.set(minute, n + 1);
    return `${minute}:${String(Math.min(n, 59)).padStart(2, '0')}`;
  };

  let id = nextId(snapshot.transactions);
  for (const op of operations) {
    const assetId = assetIds.get(op.asset);
    if (assetId === undefined) throw new Error(`Operation on an unknown investment "${op.asset}"`);
    const at = createdAt(op);
    const main: Transaction = {
      id: id++,
      assetId,
      type: op.type,
      date: op.date,
      quantity: op.quantity,
      unitPrice: op.unitPrice,
      amount: round2(op.amount),
      fees: round2(op.fees),
      note: op.note,
      linkedId: null,
      createdAt: at,
    };
    snapshot.transactions.push(main);
    if (!op.cash) continue;
    const cashId = assetIds.get(op.cash);
    if (cashId === undefined) throw new Error(`Unknown cash account "${op.cash}"`);
    const isBuy = op.type === 'BUY';
    const name = imported.assets.find((a) => a.key === op.asset)!.name;
    const qty = op.quantity !== null ? `${op.quantity} × ` : '';
    const side: Transaction = {
      id: id++,
      assetId: cashId,
      type: isBuy ? 'WITHDRAW' : 'DEPOSIT',
      date: op.date,
      quantity: null,
      unitPrice: null,
      amount: round2(isBuy ? main.amount + main.fees : main.amount - main.fees),
      fees: 0,
      note: isBuy ? `Buy ${qty}${name}` : op.type === 'SELL' ? `Sale of ${qty}${name}` : `Dividend from ${name}`,
      linkedId: main.id,
      createdAt: at,
    };
    main.linkedId = side.id;
    snapshot.transactions.push(side);
  }

  // After the operations of their day (latest save time), so a month-end close sets the value.
  let priceId = nextId(snapshot.prices);
  for (const p of imported.prices ?? []) {
    const assetId = assetIds.get(p.asset);
    if (assetId === undefined) continue;
    const point: PricePoint = { id: priceId++, assetId, date: p.date, price: p.price, source: 'online', createdAt: `${p.date} 23:59:59` };
    snapshot.prices.push(point);
  }

  return { snapshot, replaced };
}

/**
 * The month-ends (capped at `today`) at which each `units` investment with an identifier was
 * held, from its first operation: where a market price makes the chart follow the market between
 * operations. 'YYYY-MM' → date of the price.
 */
export function heldMonthEnds(imported: ImportedAccount, today: ISODate): Map<string, Map<string, ISODate>> {
  const result = new Map<string, Map<string, ISODate>>();
  for (const asset of imported.assets) {
    if (asset.valuation !== 'units' || !asset.identifier) continue;
    const ops = imported.operations
      .filter((o) => o.asset === asset.key && o.quantity !== null && (o.type === 'BUY' || o.type === 'SELL'))
      .sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
    if (!ops.length) continue;
    const months = new Map<string, ISODate>();
    let quantity = 0;
    let i = 0;
    for (let first = `${ops[0].date.slice(0, 7)}-01`; first <= today; first = addMonths(first, 1)) {
      const end = addMonths(first, 1) > today ? today : toMonthEnd(first);
      while (i < ops.length && ops[i].date <= end) {
        quantity += ops[i].type === 'BUY' ? ops[i].quantity! : -ops[i].quantity!;
        i++;
      }
      if (quantity > 1e-9) months.set(first.slice(0, 7), end);
    }
    if (months.size) result.set(asset.key, months);
  }
  return result;
}

/** Last day of the month of `first` ('YYYY-MM-01'). */
function toMonthEnd(first: ISODate): ISODate {
  const d = fromISODate(addMonths(first, 1));
  d.setDate(0);
  return toISODate(d);
}

/**
 * Does a fetched monthly history look like the imported investment? The median ratio between each
 * trade's unit price and that month's close must stay within ×3: otherwise the identifier found
 * another product (a crypto symbol shared by two coins, another share class…). True without trades
 * to compare with.
 */
export function historyMatchesTrades(imported: ImportedAccount, assetKey: string, months: Map<string, number>): boolean {
  const ratios = imported.operations
    .filter((o) => o.asset === assetKey && (o.type === 'BUY' || o.type === 'SELL') && (o.unitPrice ?? 0) > 0)
    .flatMap((o) => {
      const close = months.get(o.date.slice(0, 7));
      return close && close > 0 ? [o.unitPrice! / close] : [];
    })
    .sort((a, b) => a - b);
  if (!ratios.length) return true;
  const median = ratios[Math.floor(ratios.length / 2)];
  return median >= 1 / 3 && median <= 3;
}

/**
 * For statements that leave splits out (Revolut): restates the operations before each split in new
 * shares, like the DEGIRO converter does with the split lines: same money, quantity × ratio, unit
 * price ÷ ratio. Only splits after the first operation count. Returns the splits applied.
 */
export function applySplits(imported: ImportedAccount, assetKey: string, splits: { date: ISODate; ratio: number }[]): { date: ISODate; ratio: number }[] {
  const ops = imported.operations.filter((o) => o.asset === assetKey && o.quantity !== null);
  const applied = splits.filter((s) => s.ratio !== 1 && ops.some((o) => o.date < s.date));
  for (const split of applied) {
    for (const op of ops) {
      if (op.date >= split.date) continue;
      op.quantity! *= split.ratio;
      if (op.unitPrice !== null) op.unitPrice /= split.ratio;
      op.note = `${op.note ?? ''} (before the ${split.date} split: ×${+split.ratio.toFixed(6)})`.trim();
    }
  }
  return applied;
}
