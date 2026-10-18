/*
 * Performance benchmark on a large synthetic portfolio (~10 years of daily entries).
 * Not part of `npm test`: run `npm run bench` (JIT) or `npm run bench:jitless` (closer to a phone).
 */
import { migrate } from '@/db/migrations';
import { openTestDatabase } from '@/db/nodeTestDatabase';
import * as repo from '@/db/repo';
import { benchmarkSeries } from '@/domain/benchmark';
import { addMonths } from '@/domain/dates';
import { buildHistory, downsample } from '@/domain/history';
import { buildPerformance } from '@/domain/performance';
import { buildPortfolio } from '@/domain/portfolio';
import { planRebalance } from '@/domain/rebalance';
import { buildReturns } from '@/domain/returns';
import { monthlySavings, monthOf } from '@/domain/savings';
import { summarizeStaleness } from '@/domain/staleness';
import { syntheticSnapshot, TODAY, YEARS } from './synthetic';

function time<T>(fn: () => T, runs = 3): { ms: number; result: T } {
  let result!: T;
  const start = performance.now();
  for (let i = 0; i < runs; i++) result = fn();
  return { ms: (performance.now() - start) / runs, result };
}

async function timeAsync<T>(fn: () => Promise<T>): Promise<{ ms: number; result: T }> {
  const start = performance.now();
  const result = await fn();
  return { ms: performance.now() - start, result };
}

it('benchmark', async () => {
  const snapshot = syntheticSnapshot();
  const rows: [string, number][] = [];

  // SQLite: insert then reload everything (what write() does after each change).
  const db = openTestDatabase();
  await migrate(db);
  await db.withExclusiveTransactionAsync((txn) => repo.replaceAll(txn, snapshot));
  rows.push(['loadSnapshot (SQLite read + mapping)', (await timeAsync(() => repo.loadSnapshot(db))).ms]);

  const portfolio = time(() => buildPortfolio(snapshot));
  rows.push(['buildPortfolio (replay every investment)', portfolio.ms]);
  rows.push(['buildPerformance ALL', time(() => buildPerformance(portfolio.result, 'ALL', TODAY)).ms]);
  rows.push(['buildPerformance MTD', time(() => buildPerformance(portfolio.result, 'MTD', TODAY)).ms]);

  const series = [...portfolio.result.byAssetId.values()].map((v) => ({ steps: v.steps, isLiability: v.isLiability }));
  const history = time(() => buildHistory(series, TODAY));
  rows.push(['buildHistory (home chart)', history.ms]);
  const dates = history.result.map((p) => p.date);
  rows.push(['benchmarkSeries on every date', time(() => benchmarkSeries(snapshot, dates, 0.04)).ms]);
  rows.push(['benchmarkSeries on 200 plotted dates', time(() => benchmarkSeries(snapshot, downsample(dates), 0.04)).ms]);

  rows.push(['monthlySavings (All)', time(() => monthlySavings(snapshot, monthOf('2016-10-10'), monthOf(TODAY))).ms]);
  rows.push(['buildReturns (XIRR overall, after each change)', time(() => buildReturns(portfolio.result, TODAY)).ms]);
  const returns = buildReturns(portfolio.result, TODAY);
  rows.push(['XIRR of 1 daily investment (page opened)', time(() => returns.forAsset(1), 1).ms]);
  rows.push(['summarizeStaleness', time(() => summarizeStaleness(portfolio.result.byAssetId.values(), TODAY)).ms]);
  rows.push([
    'planRebalance',
    time(() =>
      planRebalance(
        portfolio.result.groups.map((g) => ({ categoryId: g.category.id, name: g.category.name, color: '', value: g.value, target: g.category.targetWeight })),
        1000,
        'buy-only',
      ),
    ).ms,
  ]);

  // One investment's operations, as the investment page and the Add form get them on each render.
  const assetId = 1;
  rows.push(['filter all operations for 1 investment', time(() => snapshot.transactions.filter((t) => t.assetId === assetId)).ms]);
  rows.push(['index lookup for 1 investment', time(() => portfolio.result.txByAsset.get(assetId)).ms]);

  const total = snapshot.transactions.length + snapshot.prices.length;
  const lines = [
    '',
    `Dataset: ${snapshot.assets.length} investments, ${snapshot.transactions.length} operations, ${snapshot.prices.length} prices (${total} rows), ${YEARS} years`,
    `Engine: ${process.execArgv.includes('--jitless') ? 'no JIT (≈ phone)' : 'JIT'}`,
    ...rows.map(([label, ms]) => `  ${label.padEnd(44)} ${ms.toFixed(1).padStart(8)} ms`),
    '',
  ];
  process.stdout.write(lines.join('\n'));
  expect(addMonths(TODAY, 0)).toBe(TODAY);
}, 600_000);
