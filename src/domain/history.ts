import { cashFlow, isIncomeTransfer } from './performance';
import type { Portfolio } from './portfolio';
import type { PositionState } from './positions';
import type { ISODate } from './types';

export interface HistoryPoint {
  date: ISODate;
  /** Total value of assets (liabilities excluded). */
  value: number;
  /** Cost of what is held (sum of the states), or the money put in so far when `flows` are given. */
  invested: number;
  liabilities: number;
}

export interface HistorySeries {
  steps: PositionState[];
  isLiability: boolean;
}

/**
 * Portfolio value over time: at every date where something happened, each asset contributes its
 * latest known state. `end` (usually today) adds a final point so the line reaches the present.
 */
export function buildHistory(series: HistorySeries[], end?: ISODate, flows?: MoneyFlow[]): HistoryPoint[] {
  const dates = new Set<ISODate>();
  for (const s of series) for (const step of s.steps) if (step.lastDate) dates.add(step.lastDate);
  if (dates.size === 0) return [];
  if (end) dates.add(end);
  const sortedDates = [...dates].sort();

  const cursors = series.map(() => -1);
  const points: HistoryPoint[] = [];
  let flowIndex = 0;
  let putIn = 0;
  for (const date of sortedDates) {
    let value = 0;
    let invested = 0;
    let liabilities = 0;
    series.forEach((s, i) => {
      while (cursors[i] + 1 < s.steps.length && s.steps[cursors[i] + 1].lastDate! <= date) cursors[i]++;
      const state = cursors[i] >= 0 ? s.steps[cursors[i]] : null;
      if (!state) return;
      if (s.isLiability) liabilities += state.value;
      else {
        value += state.value;
        invested += state.invested;
      }
    });
    if (flows) {
      while (flowIndex < flows.length && flows[flowIndex].date <= date) putIn += flows[flowIndex++].amount;
      invested = putIn;
    }
    points.push({ date, value, invested, liabilities });
  }
  return points;
}

export interface MoneyFlow {
  date: ISODate;
  amount: number;
}

/**
 * Money put into the assets (+) or taken out (−), by date: the same rule as performance's "money
 * added" (`cashFlow`), debts left out. Buys paid from a tracked cash account net to 0, and
 * dividends paid into one are not money put in (`isIncomeTransfer`), so the line only moves when
 * money really comes in or goes out.
 */
export function moneyFlows(portfolio: Portfolio): MoneyFlow[] {
  const byDate = new Map<ISODate, number>();
  for (const v of portfolio.byAssetId.values()) {
    if (v.isLiability) continue;
    for (const tx of portfolio.txByAsset.get(v.asset.id) ?? []) {
      if (isIncomeTransfer(tx, portfolio.txById)) continue;
      const flow = cashFlow(v.asset.valuation, tx);
      if (flow !== 0) byDate.set(tx.date, (byDate.get(tx.date) ?? 0) + flow);
    }
  }
  return [...byDate].map(([date, amount]) => ({ date, amount })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Keeps the first point at or after `from`, preceded by the state carried into the range. */
export function sliceHistory<T extends { date: ISODate }>(points: T[], from: ISODate | null): T[] {
  if (!from) return points;
  const idx = points.findIndex((p) => p.date >= from);
  if (idx === -1) return points.slice(-1);
  if (idx === 0 || points[idx].date === from) return points.slice(idx);
  // Carry the last known state into the start of the range so the line doesn't start mid-air.
  return [{ ...points[idx - 1], date: from }, ...points.slice(idx)];
}

/** Reduces a long series to at most `max` points, always keeping the first and last ones. */
export function downsample<T>(points: T[], max = 200): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}
