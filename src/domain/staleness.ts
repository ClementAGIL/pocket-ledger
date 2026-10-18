import { addMonths } from './dates';
import type { AssetView } from './portfolio';
import type { ISODate, UpdateFrequency } from './types';

/**
 * How long since an asset's value was last known, counted in the category's period
 * (months for "monthly", years for "yearly"; categories set to "never" are never late):
 * - fresh:    less than 1 period
 * - mild:     1 period             (gray)
 * - warning:  2–3 periods          (yellow)
 * - serious:  4–6 periods          (orange)
 * - critical: more than 6 periods  (red), or never valued
 */
export type Staleness = 'fresh' | 'mild' | 'warning' | 'serious' | 'critical';

/** From least to most urgent. */
export const STALENESS_LEVELS: Staleness[] = ['fresh', 'mild', 'warning', 'serious', 'critical'];

/** Level names that work for every frequency (the badge shows the exact age). */
export const STALENESS_RANGES: Record<Exclude<Staleness, 'fresh'>, string> = {
  mild: 'due',
  warning: 'late',
  serious: 'very late',
  critical: 'long overdue',
};

export const UPDATE_FREQUENCIES: { value: UpdateFrequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'never', label: 'Never' },
];

/** Full calendar months between `from` and `to` (0 if `to` is less than a month later). */
export function monthsBetween(from: ISODate, to: ISODate): number {
  let months = Math.max(0, (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)));
  while (months > 0 && addMonths(from, months) > to) months--;
  return months;
}

export function stalenessOf(priceDate: ISODate | null, today: ISODate, frequency: UpdateFrequency = 'monthly'): Staleness {
  if (frequency === 'never') return 'fresh';
  if (!priceDate) return 'critical';
  const months = monthsBetween(priceDate, today);
  const periods = frequency === 'yearly' ? Math.floor(months / 12) : months;
  if (periods < 1) return 'fresh';
  if (periods < 2) return 'mild';
  if (periods < 4) return 'warning';
  if (periods <= 6) return 'serious';
  return 'critical';
}

/** Short label for a badge: "1 mo", "5 mo", "2 yr"… */
export function ageLabel(priceDate: ISODate | null, today: ISODate): string {
  if (!priceDate) return 'never';
  const months = monthsBetween(priceDate, today);
  return months >= 24 ? `${Math.floor(months / 12)} yr` : `${months} mo`;
}

/** Only open, visible positions need updating: closed and archived ones are ignored. */
export const needsTracking = (v: AssetView) => !v.isClosed && !v.asset.archived;

export interface StalenessSummary {
  counts: Record<Staleness, number>;
  /** Number of tracked assets that are not fresh. */
  stale: number;
  worst: Staleness;
}

export function summarizeStaleness(views: Iterable<AssetView>, today: ISODate): StalenessSummary {
  const counts: Record<Staleness, number> = { fresh: 0, mild: 0, warning: 0, serious: 0, critical: 0 };
  let worst: Staleness = 'fresh';
  for (const v of views) {
    if (!needsTracking(v)) continue;
    const level = stalenessOf(v.position.priceDate, today, v.category.updateReminder);
    counts[level]++;
    if (STALENESS_LEVELS.indexOf(level) > STALENESS_LEVELS.indexOf(worst)) worst = level;
  }
  return { counts, stale: counts.mild + counts.warning + counts.serious + counts.critical, worst };
}
