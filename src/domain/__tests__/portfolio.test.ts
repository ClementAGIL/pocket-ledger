import { buildHistory, downsample, sliceHistory } from '../history';
import { buildPortfolio } from '../portfolio';
import type { Snapshot } from '../types';

const base = (): Snapshot => ({
  categories: [
    { id: 1, name: 'ETF', kind: 'asset', valuation: 'units', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    { id: 2, name: 'Cash', kind: 'asset', valuation: 'balance', color: '#000', sortOrder: 1, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    { id: 3, name: 'Loan', kind: 'liability', valuation: 'balance', color: '#000', sortOrder: 2, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
  ],
  accounts: [{ id: 1, name: 'Broker', institution: null, note: null, archived: false, createdAt: '' }],
  assets: [
    { id: 1, accountId: 1, categoryId: 1, name: 'World', identifier: 'CW8', valuation: 'units', note: null, reviewDate: null, archived: false, createdAt: '' },
    { id: 2, accountId: 1, categoryId: 2, name: 'Savings', identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' },
    { id: 3, accountId: 1, categoryId: 3, name: 'Mortgage', identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' },
  ],
  transactions: [
    { id: 1, assetId: 1, type: 'BUY', date: '2024-01-01', quantity: 10, unitPrice: 100, amount: 1000, fees: 0, note: null },
    { id: 2, assetId: 2, type: 'DEPOSIT', date: '2024-02-01', quantity: null, unitPrice: null, amount: 500, fees: 0, note: null },
  ],
  prices: [
    { id: 1, assetId: 1, date: '2024-03-01', price: 150, source: 'manual' },
    { id: 2, assetId: 3, date: '2024-01-15', price: 300, source: 'manual' },
  ],
});

describe('buildPortfolio', () => {
  it('computes totals, net worth and weights; liabilities are excluded from invested', () => {
    const { summary, groups } = buildPortfolio(base());
    expect(summary.assetsValue).toBe(2000);
    expect(summary.liabilitiesValue).toBe(300);
    expect(summary.netWorth).toBe(1700);
    expect(summary.invested).toBe(1500);
    expect(summary.unrealized).toBe(500);
    expect(summary.lastUpdate).toBe('2024-03-01');

    expect(groups.map((g) => g.category.name)).toEqual(['ETF', 'Cash', 'Loan']);
    expect(groups[0].weight).toBe(0.75);
    expect(groups[2].weight).toBe(0);
  });
});

describe('buildHistory', () => {
  it('sums the latest known state of each asset at each date', () => {
    const { byAssetId } = buildPortfolio(base());
    const series = [...byAssetId.values()].map((v) => ({ steps: v.steps, isLiability: v.isLiability }));
    const points = buildHistory(series, '2024-06-01');
    expect(points.map((p) => [p.date, p.value, p.invested, p.liabilities])).toEqual([
      ['2024-01-01', 1000, 1000, 0],
      ['2024-01-15', 1000, 1000, 300],
      ['2024-02-01', 1500, 1500, 300],
      ['2024-03-01', 2000, 1500, 300],
      ['2024-06-01', 2000, 1500, 300],
    ]);
  });

  it('a back-dated entry changes past points', () => {
    const data = base();
    data.transactions.push({ id: 9, assetId: 1, type: 'BUY', date: '2023-06-01', quantity: 1, unitPrice: 80, amount: 80, fees: 0, note: null });
    const { byAssetId } = buildPortfolio(data);
    const points = buildHistory([...byAssetId.values()].map((v) => ({ steps: v.steps, isLiability: v.isLiability })));
    expect(points[0]).toEqual({ date: '2023-06-01', value: 80, invested: 80, liabilities: 0 });
    expect(points[1].value).toBe(11 * 100);
  });

  it('sliceHistory carries the previous state to the start of the range', () => {
    const points = [
      { date: '2024-01-01', value: 1, invested: 1, liabilities: 0 },
      { date: '2024-05-01', value: 2, invested: 1, liabilities: 0 },
    ];
    expect(sliceHistory(points, '2024-03-01')).toEqual([
      { date: '2024-03-01', value: 1, invested: 1, liabilities: 0 },
      { date: '2024-05-01', value: 2, invested: 1, liabilities: 0 },
    ]);
  });

  it('downsample keeps both ends', () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const out = downsample(items, 10);
    expect(out).toHaveLength(10);
    expect(out[0]).toBe(0);
    expect(out[9]).toBe(999);
  });
});
