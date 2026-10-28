import { addMonths } from './dates';
import { cashFlow } from './performance';
import { replay } from './positions';
import type { Snapshot } from './types';

/** 'YYYY-MM' */
export type Month = string;

export interface MonthSavings {
  month: Month;
  /** Buys (incl. fees) and deposits into assets; a buy paid from a cash account isn't counted (nor its withdrawal). */
  added: number;
  /** Sells and withdrawals from assets (net of fees), as a positive number. */
  withdrawn: number;
  /** Increase of debt balances, as a positive number. */
  borrowed: number;
  /** Decrease of debt balances (principal repaid). */
  repaid: number;
  /** added − withdrawn − borrowed + repaid: what really increased net worth. The bar's value. */
  net: number;
}

export interface SavingsSummary {
  months: MonthSavings[];
  total: number;
  average: number;
  /** Months with a positive net amount. */
  positiveMonths: number;
  best: MonthSavings | null;
}

export const monthOf = (date: string): Month => date.slice(0, 7);

/**
 * Real saving effort each month, from `from` to `to` (inclusive, 'YYYY-MM'), with empty months
 * included so gaps in regularity are visible:
 * - assets: money put in minus money taken out (same rule as "money added" in performance);
 * - debts: every change of the balance is money, borrowing counts negative and repaying positive
 *   (a home bought 245k with a 196k loan is a 49k saving; each principal payment is a saving).
 * Dividends and interest are returns, not savings: they are not counted. Linked cash transfers (a buy
 * paid from a cash account and its withdrawal, a dividend paid into one) move money inside the
 * portfolio: left out of both "added" and "withdrawn".
 */
export function monthlySavings(data: Snapshot, from: Month, to: Month): SavingsSummary {
  const liabilityCategories = new Set(data.categories.filter((c) => c.kind === 'liability').map((c) => c.id));

  const byMonth = new Map<Month, MonthSavings>();
  for (let m = from; m <= to; m = monthOf(addMonths(`${m}-01`, 1))) {
    byMonth.set(m, { month: m, added: 0, withdrawn: 0, borrowed: 0, repaid: 0, net: 0 });
  }

  const assets = new Map(data.assets.map((a) => [a.id, a]));
  const txById = new Map(data.transactions.map((t) => [t.id, t]));
  for (const tx of data.transactions) {
    const asset = assets.get(tx.assetId);
    const bucket = asset && byMonth.get(monthOf(tx.date));
    if (!asset || !bucket || liabilityCategories.has(asset.categoryId)) continue;
    // Both sides of a cash link are a move inside the portfolio (a buy paid from cash, a dividend
    // paid into it): no money added or taken out, so neither line counts them (the net is the same).
    if (tx.linkedId != null && txById.has(tx.linkedId)) continue;
    const flow = cashFlow(asset.valuation, tx);
    if (flow > 0) bucket.added += flow;
    else bucket.withdrawn -= flow;
    bucket.net += flow;
  }

  // Debts: replay each balance and turn its changes into flows. Rows are grouped once (not filtered per debt).
  const debts = data.assets.filter((a) => liabilityCategories.has(a.categoryId));
  const debtIds = new Set(debts.map((d) => d.id));
  const debtTxs = groupByAsset(data.transactions.filter((t) => debtIds.has(t.assetId)));
  const debtPrices = groupByAsset(data.prices.filter((p) => debtIds.has(p.assetId)));
  for (const debt of debts) {
    const steps = replay('balance', debtTxs.get(debt.id) ?? [], debtPrices.get(debt.id) ?? []);
    let previous = 0;
    for (const step of steps) {
      const change = step.value - previous;
      previous = step.value;
      const bucket = byMonth.get(monthOf(step.lastDate!));
      if (!bucket || Math.abs(change) < 0.005) continue;
      if (change > 0) bucket.borrowed += change;
      else bucket.repaid -= change;
      bucket.net -= change;
    }
  }

  const months = [...byMonth.values()];
  const total = months.reduce((s, m) => s + m.net, 0);
  let best: MonthSavings | null = null;
  for (const m of months) if (m.net > 0 && (!best || m.net > best.net)) best = m;
  return {
    months,
    total,
    average: months.length ? total / months.length : 0,
    positiveMonths: months.filter((m) => m.net > 0.005).length,
    best,
  };
}

function groupByAsset<T extends { assetId: number }>(rows: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const row of rows) {
    const list = map.get(row.assetId);
    if (list) list.push(row);
    else map.set(row.assetId, [row]);
  }
  return map;
}

/** First month with any transaction, or null when there is none. */
export function firstMonth(data: Snapshot): Month | null {
  let first: string | null = null;
  for (const tx of data.transactions) if (!first || tx.date < first) first = tx.date;
  return first ? monthOf(first) : null;
}

/**
 * Magnitude above which a month is exceptional: 3× the 75th percentile of the non-zero
 * magnitudes. Null with fewer than 4 non-zero months (too few to tell what is normal).
 */
export function exceptionalLimit(values: number[]): number | null {
  const magnitudes = values.map(Math.abs).filter((v) => v > 0.005).sort((a, b) => a - b);
  if (magnitudes.length < 4) return null;
  return magnitudes[Math.floor((magnitudes.length - 1) * 0.75)] * 3;
}

/**
 * Vertical bounds for a bar chart that stays readable with a few exceptional months (a home
 * purchase, an inheritance…): bounds follow the "normal" months, and bars beyond them are drawn cut.
 * A value is exceptional when it exceeds 3× the 75th percentile of the non-zero magnitudes.
 * With fewer than 4 non-zero months nothing is treated as exceptional.
 */
export function chartBounds(values: number[]): { top: number; bottom: number } {
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  const limit = exceptionalLimit(values);
  if (limit === null) return { top, bottom };
  const normal = values.filter((v) => Math.abs(v) <= limit);
  return { top: Math.max(0, ...normal), bottom: Math.min(0, ...normal) };
}
