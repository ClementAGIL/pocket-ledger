import { holdingKey } from './holdings';
import type { AssetView, Portfolio } from './portfolio';

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

/**
 * How assets are split. Liabilities are excluded; empty and closed positions don't appear. By
 * investment, the same product in several accounts (`holdingKey`) is one item, named after its
 * largest line.
 */
export function buildAllocation(portfolio: Portfolio, by: AllocationBy): Allocation {
  const totals = new Map<string, Omit<AllocationItem, 'weight'>>();
  /** By investment: the lines of each item, to name it. */
  const lines = new Map<string, AssetView[]>();
  for (const v of portfolio.byAssetId.values()) {
    if (v.isLiability || v.position.value <= 0) continue;
    const holding = by === 'asset' ? holdingKey(v.asset) : null;
    const entry =
      by === 'category'
        ? { key: `c${v.category.id}`, label: v.category.name, color: v.category.color }
        : by === 'account'
          ? { key: `a${v.account.id}`, label: v.account.name, color: null }
          : { key: holding ? `h${holding}` : `i${v.asset.id}`, label: v.asset.name, color: null };
    const current = totals.get(entry.key);
    if (current) current.value += v.position.value;
    else totals.set(entry.key, { ...entry, value: v.position.value });
    if (by === 'asset') {
      const group = lines.get(entry.key);
      if (group) group.push(v);
      else lines.set(entry.key, [v]);
    }
  }
  for (const [key, views] of lines) {
    const item = totals.get(key)!;
    const main = views.reduce((a, b) => (b.position.value > a.position.value ? b : a));
    item.label = main.asset.name;
    const accounts = new Set(views.map((v) => v.account.id)).size;
    item.sublabel = `${accounts > 1 ? `${accounts} accounts` : main.account.name} · ${main.category.name}`;
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
 * Most segments of a donut: the 8 validated categorical colors + "Other". A 9th hue would be a
 * generated color that neighbours can't be told apart from.
 */
export const MAX_SLICES = 9;

/**
 * A donut stays readable with few segments: up to `max - 1` items keep their own hued slice; past
 * that, the `max - 2` largest are kept and the rest (at least two items) folds into "Other".
 */
export function foldSlices(items: AllocationItem[], max = MAX_SLICES): AllocationSlice[] {
  const toSlice = (i: AllocationItem): AllocationSlice => ({
    key: i.key,
    label: i.label,
    value: i.value,
    weight: i.weight,
    members: [i.key],
  });
  if (items.length < max) return items.map(toSlice);
  const kept = items.slice(0, max - 2);
  const rest = items.slice(max - 2);
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
