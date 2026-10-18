import { dayNumber } from './dates';
import { cashFlow } from './performance';
import type { ISODate, Snapshot } from './types';

/**
 * "What if every euro had earned a fixed rate instead?" Each flow of money into your assets
 * (buys, deposits) goes into an account earning `annualRate`, compounded daily; money taken out
 * (sells, withdrawals) and dividends paid out leave it, exactly as they left your real assets.
 * Debts are not part of it, like the "Assets" line it is compared with.
 *
 * Returns the simulated balance at the end of each of `dates` (sorted ascending).
 * Computed in one pass, so it is cheap enough to never be stored.
 */
export function benchmarkSeries(data: Snapshot, dates: ISODate[], annualRate: number): number[] {
  const liabilityCategories = new Set(data.categories.filter((c) => c.kind === 'liability').map((c) => c.id));
  const assets = new Map(data.assets.filter((a) => !liabilityCategories.has(a.categoryId)).map((a) => [a.id, a]));

  // Net flow per calendar day: only the daily total compounds, and there are far fewer days than
  // operations (one dayNumber / exp per day instead of per operation).
  const byDate = new Map<string, number>();
  for (const tx of data.transactions) {
    const asset = assets.get(tx.assetId);
    if (!asset) continue;
    // Dividends leave the real assets, so they leave the simulation too (interest stays inside).
    const amount =
      tx.type === 'INCOME' && asset.valuation === 'units' ? -(tx.amount - tx.fees) : cashFlow(asset.valuation, tx);
    if (amount !== 0) byDate.set(tx.date, (byDate.get(tx.date) ?? 0) + amount);
  }
  const flows = [...byDate].map(([date, amount]) => ({ day: dayNumber(date), amount })).sort((a, b) => a.day - b.day);

  const dailyGrowth = Math.log(1 + annualRate) / 365;
  const result: number[] = [];
  let balance = 0;
  let day = flows.length ? flows[0].day : 0;
  let next = 0;
  for (const date of dates) {
    const target = dayNumber(date);
    while (next < flows.length && flows[next].day <= target) {
      balance = balance * Math.exp(dailyGrowth * (flows[next].day - day)) + flows[next].amount;
      day = flows[next].day;
      next++;
    }
    result.push(target > day ? balance * Math.exp(dailyGrowth * (target - day)) : balance);
  }
  return result;
}
