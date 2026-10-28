import { combine, type Performance, type PortfolioPerformance } from './performance';
import type { AssetView, Portfolio } from './portfolio';
import { toPosition, type Position, type PositionState } from './positions';
import type { Asset, ISODate } from './types';

/**
 * One holding in several accounts (Intel at DEGIRO and at Revolut): `units` investments of the same
 * category with the same identifier, case and spaces ignored. Merged only for display (Investments ›
 * List › By category and the holding page): each investment keeps its own rows in the database.
 */
export function holdingKey(asset: Asset): string | null {
  const identifier = asset.identifier?.replace(/\s+/g, '').toLowerCase();
  return asset.valuation === 'units' && identifier ? `${asset.categoryId}:${identifier}` : null;
}

export interface Holding {
  key: string;
  /** The name and identifier of its largest investment. */
  name: string;
  identifier: string;
  /** Its investments, largest value first. */
  items: AssetView[];
  /** Distinct accounts (two lines of the same product can sit in one account). */
  accountCount: number;
  /** Quantities, values, costs and gains summed; average cost = invested / quantity. */
  position: Position;
  weight: number;
  /** Every investment closed / archived. */
  isClosed: boolean;
  archived: boolean;
}

const later = (a: ISODate | null, b: ISODate | null) => (a === null ? b : b === null || a > b ? a : b);

/** "3 accounts", or the account's name when every line is in the same one. */
export const accountsLabel = (holding: Pick<Holding, 'accountCount' | 'items'>) =>
  holding.accountCount > 1 ? `${holding.accountCount} accounts` : holding.items[0].account.name;

/** Sum of several states of the same product: the price is the most recently known one. */
export function sumStates(states: PositionState[]): PositionState {
  const total: PositionState = { quantity: 0, price: null, value: 0, invested: 0, realized: 0, income: 0, lastDate: null, priceDate: null };
  let priceDate: ISODate | null = null;
  for (const s of states) {
    total.quantity += s.quantity;
    total.value += s.value;
    total.invested += s.invested;
    total.realized += s.realized;
    total.income += s.income;
    total.lastDate = later(total.lastDate, s.lastDate);
    if (s.price !== null && (total.price === null || (s.priceDate ?? '') >= (priceDate ?? ''))) {
      total.price = s.price;
      priceDate = s.priceDate;
    }
    total.priceDate = later(total.priceDate, s.priceDate);
  }
  return total;
}

export function buildHolding(key: string, views: AssetView[]): Holding {
  const items = [...views].sort((a, b) => b.position.value - a.position.value || a.asset.name.localeCompare(b.asset.name));
  const main = items[0].asset;
  return {
    key,
    name: main.name,
    identifier: main.identifier ?? '',
    items,
    accountCount: new Set(items.map((v) => v.account.id)).size,
    position: toPosition(sumStates(items.map((v) => v.position))),
    weight: items.reduce((sum, v) => sum + v.weight, 0),
    isClosed: items.every((v) => v.isClosed),
    archived: items.every((v) => v.asset.archived),
  };
}

export type ListRow = { kind: 'asset'; view: AssetView } | { kind: 'holding'; holding: Holding };

/**
 * The rows of one category's list: investments sharing a holding key become one row, at the place
 * of the first one. A key found once stays a plain investment row.
 */
export function mergeRows(items: AssetView[]): ListRow[] {
  const byKey = new Map<string, AssetView[]>();
  for (const v of items) {
    const key = holdingKey(v.asset);
    if (!key) continue;
    const group = byKey.get(key);
    if (group) group.push(v);
    else byKey.set(key, [v]);
  }
  const rows: ListRow[] = [];
  const done = new Set<string>();
  for (const v of items) {
    const key = holdingKey(v.asset);
    const group = key ? byKey.get(key)! : null;
    if (!key || group!.length < 2) rows.push({ kind: 'asset', view: v });
    else if (!done.has(key)) {
      done.add(key);
      rows.push({ kind: 'holding', holding: buildHolding(key, group!) });
    }
  }
  return rows;
}

/** All the investments of a holding, closed and archived ones included (the holding page). */
export function findHolding(portfolio: Portfolio, key: string): Holding | null {
  const views = [...portfolio.byAssetId.values()].filter((v) => holdingKey(v.asset) === key);
  return views.length ? buildHolding(key, views) : null;
}

/** The period gain of a holding: its investments' performances summed. */
export function holdingPerformance(holding: Holding, performance: PortfolioPerformance): Performance {
  const items = holding.items.map((v) => performance.byAsset.get(v.asset.id)).filter((p): p is Performance => p !== undefined);
  return combine(items, performance.start === null);
}
