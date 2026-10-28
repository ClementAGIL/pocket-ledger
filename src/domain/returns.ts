import { dayNumber } from './dates';
import { cashFlow } from './performance';
import type { Portfolio } from './portfolio';
import type { ISODate, Transaction, Valuation } from './types';

/*
 * Real annualized return (XIRR, money-weighted): the yearly rate that turns every euro put in,
 * on its date, into what came back out plus what the investment is worth today.
 * Comparable across investments held for different lengths of time, unlike a plain gain %.
 */

export interface DatedFlow {
  date: ISODate;
  /** From the investor's point of view: money put in < 0, money received (or final value) > 0. */
  amount: number;
}

/** Annualizing less than this would be misleading (a +2% month is not "+27%/yr"). */
export const MIN_YEARS = 1;

/**
 * Solves Σ amountᵢ / (1 + r)^(daysᵢ / 365) = 0 for r (Excel's XIRR convention).
 * Newton's method, with a bisection fallback when it doesn't converge. Null when there is no
 * solution: no money in, no money out, or no sign change.
 */
export function xirr(flows: DatedFlow[]): number | null {
  const points = flows.filter((f) => Math.abs(f.amount) > 1e-9).map((f) => ({ day: dayNumber(f.date), amount: f.amount }));
  if (!points.some((p) => p.amount < 0) || !points.some((p) => p.amount > 0)) return null;
  const first = Math.min(...points.map((p) => p.day));
  const years = points.map((p) => (p.day - first) / 365);

  // Value and derivative in one pass, sharing the exponential: this runs on thousands of flows.
  const evaluate = (r: number) => {
    const k = Math.log1p(r);
    let f = 0;
    let d = 0;
    for (let i = 0; i < points.length; i++) {
      const term = points[i].amount * Math.exp(-years[i] * k);
      f += term;
      d -= years[i] * term;
    }
    return { f, d: d / (1 + r) };
  };
  const npv = (r: number) => evaluate(r).f;

  // Newton's method, started from the simple yearly return (usually a few steps from the answer).
  const paidIn = -points.reduce((s, p) => s + Math.min(p.amount, 0), 0);
  const gotBack = points.reduce((s, p) => s + Math.max(p.amount, 0), 0);
  const span = Math.max(years[years.length - 1] ?? 0, 1 / 365);
  let r = Math.min(Math.max((gotBack / paidIn) ** (1 / Math.max(span / 2, 1 / 365)) - 1, -0.9), 10);
  for (let i = 0; i < 50; i++) {
    const { f, d } = evaluate(r);
    if (!Number.isFinite(d) || d === 0) break;
    const next = r - f / d;
    if (!Number.isFinite(next) || next <= -0.999999) break;
    // 1e-8 = a millionth of a percent: far below the 0.1% shown.
    if (Math.abs(next - r) < 1e-8) return next;
    r = next;
  }

  // Bisection fallback on [-99.99%, +1 000 000%].
  let lo = -0.9999;
  let hi = 10_000;
  let fLo = npv(lo);
  if (Math.sign(fLo) === Math.sign(npv(hi))) return null;
  // 60 halvings bring the [−99.99%, 1 000 000%] range below 1e-10.
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (hi - lo < 1e-10) return mid;
    if (Math.sign(fMid) === Math.sign(fLo)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/** The investor's cash flows of one investment, plus its current value as a final inflow. */
export function investmentFlows(valuation: Valuation, txs: Transaction[], value: number, today: ISODate): DatedFlow[] {
  const flows: DatedFlow[] = [];
  for (const tx of txs) {
    if (tx.date > today) continue;
    // Dividends are received; interest stays inside a balance (it is part of `value`).
    if (tx.type === 'INCOME') {
      if (valuation === 'units') flows.push({ date: tx.date, amount: tx.amount - tx.fees });
      continue;
    }
    const put = cashFlow(valuation, tx);
    if (put !== 0) flows.push({ date: tx.date, amount: -put });
  }
  if (value > 0) flows.push({ date: today, amount: value });
  return flows;
}

export interface AnnualizedReturn {
  /** Yearly rate (0.074 = +7.4%/yr), or null when it can't be computed. */
  rate: number | null;
  /** Years since the first flow. */
  years: number;
  /** False when held less than MIN_YEARS: show the plain gain instead. */
  meaningful: boolean;
}

function annualized(flows: DatedFlow[], today: ISODate): AnnualizedReturn {
  if (flows.length === 0) return { rate: null, years: 0, meaningful: false };
  const first = flows.reduce((min, f) => (f.date < min ? f.date : min), flows[0].date);
  const years = (dayNumber(today) - dayNumber(first)) / 365;
  const meaningful = years >= MIN_YEARS;
  return { rate: meaningful ? xirr(flows) : null, years, meaningful };
}

export interface PortfolioReturns {
  /** All assets together (debts excluded), since the first operation. */
  total: AnnualizedReturn;
  /**
   * One investment (undefined for debts and unknown ids). Computed on first request and cached:
   * only the investment page shown needs it, not all of them after every change.
   */
  forAsset: (assetId: number) => AnnualizedReturn | undefined;
  /** Several investments together (one holding in several accounts), flows summed per day. Not cached. */
  forAssets: (assetIds: number[]) => AnnualizedReturn | undefined;
}

export function buildReturns(portfolio: Portfolio, today: ISODate): PortfolioReturns {
  const flowsOf = (id: number) => {
    const v = portfolio.byAssetId.get(id);
    if (!v || v.isLiability) return null;
    return investmentFlows(v.asset.valuation, portfolio.txByAsset.get(id) ?? [], v.position.value, today);
  };

  // Flows are summed per day: same result, far fewer terms for the solver.
  const summed = (ids: Iterable<number>) => {
    const byDate = new Map<ISODate, number>();
    for (const id of ids) {
      for (const f of flowsOf(id) ?? []) byDate.set(f.date, (byDate.get(f.date) ?? 0) + f.amount);
    }
    return [...byDate].map(([date, amount]) => ({ date, amount }));
  };
  const total = annualized(summed(portfolio.byAssetId.keys()), today);

  const cache = new Map<number, AnnualizedReturn | undefined>();
  const forAsset = (id: number) => {
    if (!cache.has(id)) {
      const flows = flowsOf(id);
      cache.set(id, flows ? annualized(flows, today) : undefined);
    }
    return cache.get(id);
  };
  const forAssets = (ids: number[]) => {
    const assets = ids.filter((id) => {
      const v = portfolio.byAssetId.get(id);
      return v && !v.isLiability;
    });
    return assets.length ? annualized(summed(assets), today) : undefined;
  };
  return { total, forAsset, forAssets };
}
