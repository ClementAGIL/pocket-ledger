import { addMonths, dayNumber } from './dates';
import type { AssetView, Portfolio } from './portfolio';
import type { PositionState } from './positions';
import type { ISODate, Transaction, Valuation } from './types';

export type Period = 'MTD' | 'YTD' | '12M' | 'ALL';

export const PERIODS: { value: Period; label: string }[] = [
  { value: 'MTD', label: 'Month' },
  { value: 'YTD', label: 'Year' },
  { value: '12M', label: '12M' },
  { value: 'ALL', label: 'All' },
];

export const PERIOD_LABELS: Record<Period, string> = {
  MTD: 'This month',
  YTD: 'This year',
  '12M': 'Last 12 months',
  ALL: 'Since start',
};

export const isPeriod = (v: unknown): v is Period => PERIODS.some((p) => p.value === v);

/** First day of the period, or null for "since the start". */
export function periodStart(period: Period, today: ISODate): ISODate | null {
  switch (period) {
    case 'MTD':
      return `${today.slice(0, 7)}-01`;
    case 'YTD':
      return `${today.slice(0, 4)}-01-01`;
    case '12M':
      return addMonths(today, -12);
    case 'ALL':
      return null;
  }
}

/**
 * Performance over a period. Additive: components of several assets can be summed (see `combine`).
 * Money added is not a gain, money taken out is not a loss: realized gains, dividends and price
 * moves all count.
 */
export interface Performance {
  startValue: number;
  endValue: number;
  /** Money put in minus money taken out during the period (buys − sells, deposits − withdrawals). */
  netFlows: number;
  /** Money put in during the period (buys incl. fees, deposits). */
  inflows: number;
  /** Flows weighted by the share of the period they were invested (Modified Dietz). */
  weightedFlows: number;
  /** Dividends paid out (units assets) and interest (balance assets) received during the period. */
  income: number;
  /** Gain breakdown: dividends + interest + priceGain = gain. */
  dividends: number;
  interest: number;
  /** Everything else: price/value changes, gains locked in by sales, fees. */
  priceGain: number;
  gain: number;
  /** null when there is nothing to compare to (e.g. no money invested). */
  pct: number | null;
}

const zero = (): Omit<Performance, 'pct'> => ({
  startValue: 0,
  endValue: 0,
  netFlows: 0,
  inflows: 0,
  weightedFlows: 0,
  income: 0,
  dividends: 0,
  interest: 0,
  priceGain: 0,
  gain: 0,
});

/**
 * Return in %:
 * - over a period: Modified Dietz, gain / (start value + time-weighted flows);
 * - since the start: gain / net money invested (falls back to money put in when more was taken out
 *   than put in, e.g. a position sold with a profit).
 */
function withPct(p: Omit<Performance, 'pct'>, sinceStart: boolean): Performance {
  const base = sinceStart ? (p.netFlows > 0 ? p.netFlows : p.inflows) : p.startValue + p.weightedFlows;
  return { ...p, pct: base > 0.005 ? p.gain / base : null };
}

/** Sums several performances over the same period. */
export function combine(items: Performance[], sinceStart: boolean): Performance {
  const total = zero();
  for (const p of items) {
    total.startValue += p.startValue;
    total.endValue += p.endValue;
    total.netFlows += p.netFlows;
    total.inflows += p.inflows;
    total.weightedFlows += p.weightedFlows;
    total.income += p.income;
    total.dividends += p.dividends;
    total.interest += p.interest;
    total.priceGain += p.priceGain;
    total.gain += p.gain;
  }
  return withPct(total, sinceStart);
}

/**
 * Performance of one asset between `start` (inclusive; null = since the first event) and `end`.
 * `steps` are the asset's chronological states (see `replay`).
 */
export function assetPerformance(
  valuation: Valuation,
  steps: PositionState[],
  txs: Transaction[],
  start: ISODate | null,
  end: ISODate,
): Performance {
  const p = zero();

  // Value at the end of the day before the period starts.
  if (start) {
    for (const s of steps) {
      if (s.lastDate! >= start) break;
      p.startValue = s.value;
    }
  }
  // Value at the end of `end` (the latest state when `end` is today).
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].lastDate! <= end) {
      p.endValue = steps[i].value;
      break;
    }
  }

  const startDay = start ? dayNumber(start) : 0;
  const endDay = dayNumber(end);
  const span = endDay - startDay;
  for (const tx of txs) {
    if ((start && tx.date < start) || tx.date > end) continue;
    if (tx.type === 'INCOME') {
      // Dividends leave the asset (external); interest is already part of the balance (endValue).
      if (valuation === 'units') p.dividends += tx.amount - tx.fees;
      else p.interest += tx.amount - tx.fees;
      continue;
    }
    const flow = cashFlow(valuation, tx);
    if (flow === 0) continue;
    p.netFlows += flow;
    if (flow > 0) p.inflows += flow;
    if (start) p.weightedFlows += flow * (span > 0 ? (endDay - dayNumber(tx.date)) / span : 0);
  }

  p.income = p.dividends + p.interest;
  p.gain = p.endValue - p.startValue - p.netFlows + p.dividends;
  p.priceGain = p.gain - p.dividends - p.interest;
  return withPct(p, start === null);
}

/**
 * The cash side of a dividend paid into a cash account ("Paid into"): money that moves inside the
 * portfolio, not money added. On its own asset it is still a deposit (the cash account's gain
 * stays 0, the dividend is the stock's gain); portfolio-wide it is left out of the money put in
 * (total performance, the Home "money put in" line, savings).
 */
export function isIncomeTransfer(tx: Transaction, txById: Map<number, Transaction>): boolean {
  return tx.type === 'DEPOSIT' && tx.linkedId != null && txById.get(tx.linkedId)?.type === 'INCOME';
}

/**
 * Money put into (+) or taken out of (−) an asset by a transaction. Income is not a flow.
 * Shared by period performance and monthly savings so both agree on "money added".
 */
export function cashFlow(valuation: Valuation, tx: Transaction): number {
  if (valuation === 'units') {
    if (tx.type === 'BUY') return tx.amount + tx.fees;
    if (tx.type === 'SELL') return -(tx.amount - tx.fees);
  } else {
    if (tx.type === 'DEPOSIT') return tx.amount;
    if (tx.type === 'WITHDRAW') return -(tx.amount - tx.fees);
  }
  return 0;
}

export interface PortfolioPerformance {
  period: Period;
  start: ISODate | null;
  /** Assets only: liabilities are not part of the gain. */
  total: Performance;
  byCategory: Map<number, Performance>;
  /** Each account's assets (its debts left out, like the total). */
  byAccount: Map<number, Performance>;
  byAsset: Map<number, Performance>;
}

export function buildPerformance(portfolio: Portfolio, period: Period, today: ISODate): PortfolioPerformance {
  return { period, ...performanceBetween(portfolio, periodStart(period, today), today) };
}

/** Performance from `start` (null = since the first event) to the end of `today`, which may be a past day (a past month). */
export function performanceBetween(
  portfolio: Portfolio,
  start: ISODate | null,
  today: ISODate,
): Omit<PortfolioPerformance, 'period'> {
  const sinceStart = start === null;

  const byAsset = new Map<number, Performance>();
  for (const [id, v] of portfolio.byAssetId) {
    byAsset.set(id, assetPerformance(v.asset.valuation, v.steps, portfolio.txByAsset.get(id) ?? [], start, today));
  }

  const byCategory = new Map<number, Performance>();
  for (const g of portfolio.groups) {
    byCategory.set(g.category.id, combine(g.items.map((v) => byAsset.get(v.asset.id)!), sinceStart));
  }

  // Dividends paid into a cash account of the same group stay in it: not money added for the group
  // (the gain is the same, the money added and the % base are not inflated by them).
  const startDay = start ? dayNumber(start) : 0;
  const span = dayNumber(today) - startDay;
  const groupPerformance = (views: AssetView[]) => {
    const sum = combine(views.map((v) => byAsset.get(v.asset.id)!), sinceStart);
    const ids = new Set(views.map((v) => v.asset.id));
    for (const v of views) {
      if (v.asset.valuation !== 'balance') continue;
      for (const tx of portfolio.txByAsset.get(v.asset.id) ?? []) {
        if ((start && tx.date < start) || tx.date > today || !isIncomeTransfer(tx, portfolio.txById)) continue;
        if (!ids.has(portfolio.txById.get(tx.linkedId!)!.assetId)) continue;
        const flow = cashFlow('balance', tx);
        sum.netFlows -= flow;
        sum.inflows -= flow;
        if (start) sum.weightedFlows -= flow * (span > 0 ? (dayNumber(today) - dayNumber(tx.date)) / span : 0);
      }
    }
    return withPct(sum, sinceStart);
  };

  const assets = [...portfolio.byAssetId.values()].filter((v) => !v.isLiability);
  const total = groupPerformance(assets);
  const perAccount = new Map<number, AssetView[]>();
  for (const v of assets) {
    if (!perAccount.has(v.account.id)) perAccount.set(v.account.id, []);
    perAccount.get(v.account.id)!.push(v);
  }
  const byAccount = new Map([...perAccount].map(([id, views]) => [id, groupPerformance(views)]));

  return { start, total, byCategory, byAccount, byAsset };
}
