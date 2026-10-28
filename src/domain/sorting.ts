import { holdingPerformance, type ListRow } from './holdings';
import type { PortfolioPerformance } from './performance';
import type { AccountGroup, AssetView, CategoryGroup } from './portfolio';

export type SortKey = 'value' | 'invested' | 'gain' | 'gainPct';
export type SortDirection = 'desc' | 'asc';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'value', label: 'Value' },
  { value: 'invested', label: 'Invested' },
  { value: 'gain', label: 'Gain €' },
  { value: 'gainPct', label: 'Gain %' },
];

/** Missing values (e.g. a % with nothing invested) always sort last, whatever the direction. */
function compare(a: number | null, b: number | null, direction: SortDirection) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'desc' ? b - a : a - b;
}

/**
 * Sorts categories and the investments inside them. Gains are the period gains shown in the list.
 * Liabilities stay at the bottom and closed positions at the end of their category; ties keep the
 * name order so the list doesn't jump around.
 */
export function sortGroups(
  groups: CategoryGroup[],
  key: SortKey,
  direction: SortDirection,
  performance: PortfolioPerformance,
): CategoryGroup[] {
  const assetMetric = (v: AssetView): number | null => {
    const perf = performance.byAsset.get(v.asset.id);
    if (key === 'value') return v.position.value;
    if (key === 'invested') return v.position.invested;
    if (key === 'gain') return perf?.gain ?? null;
    return perf?.pct ?? null;
  };
  const groupMetric = (g: CategoryGroup): number | null => {
    const perf = performance.byCategory.get(g.category.id);
    if (key === 'value') return g.value;
    if (key === 'invested') return g.invested;
    if (key === 'gain') return perf?.gain ?? null;
    return perf?.pct ?? null;
  };
  const isLiability = (g: CategoryGroup) => g.category.kind === 'liability';

  return groups
    .map((g) => ({
      ...g,
      items: [...g.items].sort(
        (a, b) =>
          Number(a.isClosed) - Number(b.isClosed) ||
          compare(assetMetric(a), assetMetric(b), direction) ||
          a.asset.name.localeCompare(b.asset.name),
      ),
    }))
    .sort(
      (a, b) =>
        Number(isLiability(a)) - Number(isLiability(b)) ||
        compare(groupMetric(a), groupMetric(b), direction) ||
        a.category.name.localeCompare(b.category.name),
    );
}

/** Accounts, by the same key: value is the net value (assets − debts), gains are the period's. */
export function sortAccounts(
  accounts: AccountGroup[],
  key: SortKey,
  direction: SortDirection,
  performance: PortfolioPerformance,
): AccountGroup[] {
  const metric = (a: AccountGroup): number | null => {
    const perf = performance.byAccount.get(a.account.id);
    if (key === 'value') return a.value - a.debts;
    if (key === 'invested') return a.invested;
    if (key === 'gain') return perf?.gain ?? null;
    return perf?.pct ?? null;
  };
  return [...accounts].sort((a, b) => compare(metric(a), metric(b), direction) || a.account.name.localeCompare(b.account.name));
}

/** A category's rows (merged holdings and single investments), by the same key as `sortGroups`. */
export function sortRows(rows: ListRow[], key: SortKey, direction: SortDirection, performance: PortfolioPerformance): ListRow[] {
  const info = (row: ListRow) => {
    const position = row.kind === 'asset' ? row.view.position : row.holding.position;
    const perf = row.kind === 'asset' ? performance.byAsset.get(row.view.asset.id) : holdingPerformance(row.holding, performance);
    const metric =
      key === 'value' ? position.value : key === 'invested' ? position.invested : key === 'gain' ? (perf?.gain ?? null) : (perf?.pct ?? null);
    return {
      metric,
      closed: row.kind === 'asset' ? row.view.isClosed : row.holding.isClosed,
      name: row.kind === 'asset' ? row.view.asset.name : row.holding.name,
    };
  };
  return rows
    .map((row) => ({ row, ...info(row) }))
    .sort((a, b) => Number(a.closed) - Number(b.closed) || compare(a.metric, b.metric, direction) || a.name.localeCompare(b.name))
    .map((r) => r.row);
}
