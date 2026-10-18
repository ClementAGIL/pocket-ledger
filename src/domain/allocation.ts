import type { Portfolio } from './portfolio';

export type AllocationBy = 'category' | 'account' | 'asset';

export const ALLOCATION_VIEWS: { value: AllocationBy; label: string }[] = [
  { value: 'category', label: 'Category' },
  { value: 'account', label: 'Account' },
  { value: 'asset', label: 'Investment' },
];

export interface AllocationItem {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  /** Share of total assets, 0–1. */
  weight: number;
  /** The entity's own color when it has one (categories). */
  color: string | null;
}

export interface Allocation {
  total: number;
  /** Every entity with a positive value, largest first. */
  items: AllocationItem[];
}

/** How assets are split. Liabilities are excluded; empty and closed positions don't appear. */
export function buildAllocation(portfolio: Portfolio, by: AllocationBy): Allocation {
  const totals = new Map<string, Omit<AllocationItem, 'weight'>>();
  for (const v of portfolio.byAssetId.values()) {
    if (v.isLiability || v.position.value <= 0) continue;
    const entry =
      by === 'category'
        ? { key: `c${v.category.id}`, label: v.category.name, color: v.category.color }
        : by === 'account'
          ? { key: `a${v.account.id}`, label: v.account.name, color: null }
          : {
              key: `i${v.asset.id}`,
              label: v.asset.name,
              sublabel: `${v.account.name} · ${v.category.name}`,
              color: null,
            };
    const current = totals.get(entry.key);
    if (current) current.value += v.position.value;
    else totals.set(entry.key, { ...entry, value: v.position.value });
  }
  const total = [...totals.values()].reduce((sum, i) => sum + i.value, 0);
  const items = [...totals.values()]
    .map((i) => ({ ...i, weight: total > 0 ? i.value / total : 0 }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  return { total, items };
}

export const OTHER_KEY = 'other';

export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
  weight: number;
  /** Keys of the items this slice stands for (several for "Other"). */
  members: string[];
}

/**
 * A donut stays readable with few segments: keeps the `max - 1` largest items and folds the rest
 * into a single "Other" slice (only when that folds at least two items).
 */
export function foldSlices(items: AllocationItem[], max = 6): AllocationSlice[] {
  const toSlice = (i: AllocationItem): AllocationSlice => ({
    key: i.key,
    label: i.label,
    value: i.value,
    weight: i.weight,
    members: [i.key],
  });
  if (items.length <= max) return items.map(toSlice);
  const kept = items.slice(0, max - 1);
  const rest = items.slice(max - 1);
  return [
    ...kept.map(toSlice),
    {
      key: OTHER_KEY,
      label: `Other (${rest.length})`,
      value: rest.reduce((s, i) => s + i.value, 0),
      weight: rest.reduce((s, i) => s + i.weight, 0),
      members: rest.map((i) => i.key),
    },
  ];
}
