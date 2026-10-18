import { replay, toPosition, emptyState, type Position, type PositionState } from './positions';
import type { Account, Asset, Category, ISODate, PricePoint, Snapshot, Transaction } from './types';

export interface AssetView {
  asset: Asset;
  category: Category;
  account: Account;
  position: Position;
  /** Chronological states, reused for charts. */
  steps: PositionState[];
  /** Share of total asset value (0 for liabilities). */
  weight: number;
  isLiability: boolean;
  isClosed: boolean;
}

export interface CategoryGroup {
  category: Category;
  items: AssetView[];
  value: number;
  invested: number;
  unrealized: number;
  unrealizedPct: number | null;
  realized: number;
  weight: number;
}

export interface PortfolioSummary {
  /** Sum of asset values (liabilities excluded). */
  assetsValue: number;
  liabilitiesValue: number;
  netWorth: number;
  invested: number;
  unrealized: number;
  unrealizedPct: number | null;
  realized: number;
  income: number;
  lastUpdate: ISODate | null;
}

export interface Portfolio {
  summary: PortfolioSummary;
  /** Asset categories sorted by value, then liability categories. Empty categories are left out. */
  groups: CategoryGroup[];
  byAssetId: Map<number, AssetView>;
  /**
   * Each investment's operations and prices, in date order. Use these instead of filtering
   * all transactions: lookups are O(1), filters are O(all operations).
   */
  txByAsset: Map<number, Transaction[]>;
  pricesByAsset: Map<number, PricePoint[]>;
  /** Every operation by id (to show the other side of a cash transfer). */
  txById: Map<number, Transaction>;
}

function groupBy<T>(items: T[], key: (t: T) => number) {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

const isClosedState = (s: PositionState) => Math.abs(s.value) < 0.005 && s.quantity === 0;

export function buildPortfolio(data: Snapshot): Portfolio {
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  const txByAsset = groupBy<Transaction>(data.transactions, (t) => t.assetId);
  const pricesByAsset = groupBy<PricePoint>(data.prices, (p) => p.assetId);

  const views: AssetView[] = [];
  for (const asset of data.assets) {
    const category = categories.get(asset.categoryId);
    const account = accounts.get(asset.accountId);
    if (!category || !account) continue;
    const steps = replay(asset.valuation, txByAsset.get(asset.id) ?? [], pricesByAsset.get(asset.id) ?? []);
    const position = toPosition(steps[steps.length - 1] ?? emptyState());
    views.push({
      asset,
      category,
      account,
      position,
      steps,
      weight: 0,
      isLiability: category.kind === 'liability',
      isClosed: isClosedState(position),
    });
  }

  const summary: PortfolioSummary = {
    assetsValue: 0,
    liabilitiesValue: 0,
    netWorth: 0,
    invested: 0,
    unrealized: 0,
    unrealizedPct: null,
    realized: 0,
    income: 0,
    lastUpdate: null,
  };
  for (const v of views) {
    const p = v.position;
    if (v.isLiability) {
      summary.liabilitiesValue += p.value;
    } else {
      summary.assetsValue += p.value;
      summary.invested += p.invested;
      summary.realized += p.realized;
      summary.income += p.income;
    }
    if (p.lastDate && (!summary.lastUpdate || p.lastDate > summary.lastUpdate)) summary.lastUpdate = p.lastDate;
  }
  summary.netWorth = summary.assetsValue - summary.liabilitiesValue;
  summary.unrealized = summary.assetsValue - summary.invested;
  summary.unrealizedPct = summary.invested > 0 ? summary.unrealized / summary.invested : null;

  for (const v of views) {
    v.weight = !v.isLiability && summary.assetsValue > 0 ? v.position.value / summary.assetsValue : 0;
  }

  const groups: CategoryGroup[] = [];
  for (const [categoryId, items] of groupBy(views, (v) => v.category.id)) {
    const category = categories.get(categoryId)!;
    const value = items.reduce((sum, v) => sum + v.position.value, 0);
    const invested = items.reduce((sum, v) => sum + v.position.invested, 0);
    const realized = items.reduce((sum, v) => sum + v.position.realized, 0);
    items.sort((a, b) => Number(a.isClosed) - Number(b.isClosed) || b.position.value - a.position.value);
    const isLiability = category.kind === 'liability';
    groups.push({
      category,
      items,
      value,
      invested,
      unrealized: value - invested,
      unrealizedPct: !isLiability && invested > 0 ? (value - invested) / invested : null,
      realized,
      weight: !isLiability && summary.assetsValue > 0 ? value / summary.assetsValue : 0,
    });
  }
  groups.sort(
    (a, b) =>
      Number(a.category.kind === 'liability') - Number(b.category.kind === 'liability') || b.value - a.value,
  );

  const txById = new Map(data.transactions.map((t) => [t.id, t]));
  return { summary, groups, byAssetId: new Map(views.map((v) => [v.asset.id, v])), txByAsset, pricesByAsset, txById };
}
