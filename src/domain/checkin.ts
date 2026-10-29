import { addMonths } from './dates';
import { periodValues, type MilestoneValues } from './milestones';
import { performanceBetween, type Performance } from './performance';
import type { AssetView, Portfolio } from './portfolio';
import { firstMonth, monthlySavings, monthOf, type Month, type MonthSavings } from './savings';
import type { ISODate, Snapshot } from './types';

/*
 * Monthly check-in: one month at a glance (gain, money saved, biggest movers). Opened on the last
 * complete month; the current month is shown "so far". What needs doing (prices, reviews, big
 * losses) is the current state, computed by the screen with staleness / reviews.
 */

/** Movers listed on each side. */
export const MAX_MOVERS = 3;
/** Gains below this (€) are noise, not a move. */
const MIN_MOVE = 0.5;

export interface Mover {
  view: AssetView;
  perf: Performance;
}

export interface CheckIn {
  month: Month;
  start: ISODate;
  /** Last day of the month, or today for the current month. */
  end: ISODate;
  /** The current month, not over yet. */
  partial: boolean;
  /** Assets only (debts left out), like the Home gain. */
  total: Performance;
  /** Money saved: assets and debts, as in Insights › Savings. */
  savings: MonthSavings;
  /** Largest gains in €, largest first. */
  gainers: Mover[];
  /** Largest losses in €, largest first. */
  losers: Mover[];
  /** Assets and cash at the start and end of the month: was a goal reached during it? */
  values: { start: MilestoneValues; end: MilestoneValues };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Last calendar day of a month ('2026-02' → '2026-02-28'). */
export function monthEnd(month: Month): ISODate {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${pad(new Date(y, m, 0).getDate())}`;
}

export const shiftMonth = (month: Month, by: number): Month => monthOf(addMonths(`${month}-01`, by));

/** The month a check-in opens on: the last complete one. */
export const lastCompleteMonth = (today: ISODate): Month => shiftMonth(monthOf(today), -1);

/** Months that can be shown: from the first operation to the current month. Null when there's no data. */
export function checkInRange(data: Snapshot, today: ISODate): { first: Month; last: Month } | null {
  const first = firstMonth(data);
  return first ? { first, last: monthOf(today) } : null;
}

export function buildCheckIn(portfolio: Portfolio, data: Snapshot, month: Month, today: ISODate): CheckIn {
  const start: ISODate = `${month}-01`;
  const last = monthEnd(month);
  const partial = last > today;
  const end = partial ? today : last;
  const perf = performanceBetween(portfolio, start, end);

  const moves: Mover[] = [];
  for (const v of portfolio.byAssetId.values()) {
    if (v.isLiability) continue;
    const p = perf.byAsset.get(v.asset.id);
    if (p && Math.abs(p.gain) >= MIN_MOVE) moves.push({ view: v, perf: p });
  }
  const gainers = moves.filter((m) => m.perf.gain > 0).sort((a, b) => b.perf.gain - a.perf.gain);
  const losers = moves.filter((m) => m.perf.gain < 0).sort((a, b) => a.perf.gain - b.perf.gain);

  return {
    month,
    start,
    end,
    partial,
    total: perf.total,
    savings: monthlySavings(data, month, month).months[0],
    gainers: gainers.slice(0, MAX_MOVERS),
    losers: losers.slice(0, MAX_MOVERS),
    values: periodValues(portfolio, perf),
  };
}

/** The Home card shows during the first days of a month. */
export const CHECK_IN_DAYS = 10;

/**
 * Whether Home offers last month's check-in: in the first CHECK_IN_DAYS days of a month, when last
 * month had data and its check-in hasn't been opened (`seen` = settings.checkInSeen).
 */
export function checkInDue(range: { first: Month } | null, seen: string, today: ISODate): Month | null {
  const month = lastCompleteMonth(today);
  if (!range || range.first > month || seen === month) return null;
  return Number(today.slice(8, 10)) <= CHECK_IN_DAYS ? month : null;
}
