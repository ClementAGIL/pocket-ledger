import { buildPortfolio } from '../portfolio';
import { ageLabel, monthsBetween, stalenessOf, summarizeStaleness } from '../staleness';
import type { Snapshot } from '../types';

describe('monthsBetween', () => {
  it('counts full calendar months', () => {
    expect(monthsBetween('2024-01-15', '2024-02-14')).toBe(0);
    expect(monthsBetween('2024-01-15', '2024-02-15')).toBe(1);
    expect(monthsBetween('2024-01-31', '2024-03-01')).toBe(1);
    expect(monthsBetween('2023-11-20', '2024-06-19')).toBe(6);
    expect(monthsBetween('2024-06-19', '2024-06-01')).toBe(0);
  });
});

describe('stalenessOf', () => {
  const today = '2024-12-15';
  it.each([
    ['2024-12-01', 'fresh'],
    ['2024-11-16', 'fresh'],
    ['2024-11-15', 'mild'],
    ['2024-10-16', 'mild'],
    ['2024-10-15', 'warning'],
    ['2024-08-16', 'warning'],
    ['2024-08-15', 'serious'],
    ['2024-06-15', 'serious'],
    ['2024-06-14', 'serious'],
    ['2024-05-15', 'critical'],
    [null, 'critical'],
  ])('%s → %s', (date, level) => {
    expect(stalenessOf(date, today)).toBe(level);
  });

  it('counts in years for yearly categories, never for "never"', () => {
    expect(stalenessOf('2024-01-15', today, 'yearly')).toBe('fresh');
    expect(stalenessOf('2023-12-15', today, 'yearly')).toBe('mild');
    expect(stalenessOf('2021-12-15', today, 'yearly')).toBe('warning');
    expect(stalenessOf('2017-12-15', today, 'yearly')).toBe('critical');
    expect(stalenessOf('2000-01-01', today, 'never')).toBe('fresh');
    expect(stalenessOf(null, today, 'never')).toBe('fresh');
  });

  it('labels the age', () => {
    expect(ageLabel('2024-09-01', today)).toBe('3 mo');
    expect(ageLabel('2021-12-01', today)).toBe('3 yr');
  });
});

describe('summarizeStaleness', () => {
  it('counts open positions only and finds the worst level', () => {
    const data: Snapshot = {
      schedules: [],
      categories: [{ id: 1, name: 'ETF', kind: 'asset', valuation: 'units', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' }],
      accounts: [{ id: 1, name: 'Broker', institution: null, note: null, archived: false, createdAt: '' }],
      assets: [1, 2, 3, 4].map((id) => ({
        id,
        accountId: 1,
        categoryId: 1,
        name: `A${id}`,
        identifier: null,
        valuation: 'units' as const,
        note: null,
        reviewDate: null,
        archived: id === 4,
        createdAt: '',
      })),
      transactions: [
        { id: 1, assetId: 1, type: 'BUY', date: '2024-12-01', quantity: 1, unitPrice: 10, amount: 10, fees: 0, note: null },
        { id: 2, assetId: 2, type: 'BUY', date: '2024-01-01', quantity: 1, unitPrice: 10, amount: 10, fees: 0, note: null },
        // Dividend: doesn't refresh the price date.
        { id: 3, assetId: 2, type: 'INCOME', date: '2024-12-10', quantity: null, unitPrice: null, amount: 1, fees: 0, note: null },
        // Closed position: ignored.
        { id: 4, assetId: 3, type: 'BUY', date: '2023-01-01', quantity: 1, unitPrice: 10, amount: 10, fees: 0, note: null },
        { id: 5, assetId: 3, type: 'SELL', date: '2023-02-01', quantity: 1, unitPrice: 12, amount: 12, fees: 0, note: null },
        // Archived: ignored.
        { id: 6, assetId: 4, type: 'BUY', date: '2023-01-01', quantity: 1, unitPrice: 10, amount: 10, fees: 0, note: null },
      ],
      prices: [],
    };
    const summary = summarizeStaleness(buildPortfolio(data).byAssetId.values(), '2024-12-15');
    expect(summary.counts).toEqual({ fresh: 1, mild: 0, warning: 0, serious: 0, critical: 1 });
    expect(summary.stale).toBe(1);
    expect(summary.worst).toBe('critical');
  });
});
