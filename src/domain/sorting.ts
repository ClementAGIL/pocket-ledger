import type { PortfolioPerformance } from './performance';
import type { AssetView, CategoryGroup } from './portfolio';

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
