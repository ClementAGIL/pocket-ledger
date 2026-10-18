import { chartBounds, firstMonth, monthlySavings } from '../savings';
import type { Snapshot, Transaction } from '../types';

let id = 1;
const tx = (assetId: number, type: Transaction['type'], date: string, amount: number, fees = 0): Transaction => ({
  id: id++,
  assetId,
  type,
  date,
  quantity: type === 'BUY' || type === 'SELL' ? 1 : null,
  unitPrice: type === 'BUY' || type === 'SELL' ? amount : null,
  amount,
  fees,
  note: null,
});

const data: Snapshot = {
  categories: [
    { id: 1, name: 'ETF', kind: 'asset', valuation: 'units', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    { id: 2, name: 'Cash', kind: 'asset', valuation: 'balance', color: '#000', sortOrder: 1, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    { id: 3, name: 'Loan', kind: 'liability', valuation: 'balance', color: '#000', sortOrder: 2, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
  ],
  accounts: [{ id: 1, name: 'A', institution: null, note: null, archived: false, createdAt: '' }],
  assets: [
    { id: 1, accountId: 1, categoryId: 1, name: 'World', identifier: null, valuation: 'units', note: null, reviewDate: null, archived: false, createdAt: '' },
    { id: 2, accountId: 1, categoryId: 2, name: 'Savings', identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' },
    { id: 3, accountId: 1, categoryId: 3, name: 'Car loan', identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' },
  ],
  transactions: [
    tx(1, 'BUY', '2024-01-05', 500, 2),
    tx(2, 'DEPOSIT', '2024-01-20', 300),
    tx(1, 'INCOME', '2024-02-10', 12),
    tx(2, 'WITHDRAW', '2024-03-02', 1000),
    tx(1, 'SELL', '2024-03-15', 200, 1),
    tx(1, 'BUY', '2024-03-20', 100),
    tx(3, 'DEPOSIT', '2024-03-01', 15000),
    tx(3, 'WITHDRAW', '2024-04-05', 1000),
    tx(1, 'BUY', '2023-12-31', 999),
  ],
  // Car loan balance update: 15000 → 14500.
  prices: [{ id: 50, assetId: 3, date: '2024-03-25', price: 14500, source: 'manual' }],
};

describe('monthlySavings', () => {
  const s = monthlySavings(data, '2024-01', '2024-04');

  it('returns one bucket per month, empty months included', () => {
    expect(s.months.map((m) => m.month)).toEqual(['2024-01', '2024-02', '2024-03', '2024-04']);
  });

  it('nets assets flows and debt changes; ignores income', () => {
    expect(s.months.map((m) => [m.added, m.withdrawn, m.borrowed, m.repaid, m.net])).toEqual([
      [802, 0, 0, 0, 802],
      [0, 0, 0, 0, 0],
      // Borrowed 15000 for the car, repaid 500 via a balance update.
      [100, 1199, 15000, 500, 100 - 1199 - 15000 + 500],
      // Repay operation.
      [0, 0, 0, 1000, 1000],
    ]);
  });

  it('summarizes regularity', () => {
    expect(s.total).toBeCloseTo(802 - 15599 + 1000);
    expect(s.positiveMonths).toBe(2);
    expect(s.best?.month).toBe('2024-04');
  });

  it('a home bought with a loan only counts the own contribution', () => {
    const home: Snapshot = {
      ...data,
      transactions: [tx(2, 'DEPOSIT', '2024-05-10', 245000)],
      prices: [{ id: 99, assetId: 3, date: '2024-05-10', price: 196000, source: 'manual' }],
    };
    expect(monthlySavings(home, '2024-05', '2024-05').months[0].net).toBe(49000);
  });

  it('crosses year boundaries and finds the first month', () => {
    expect(monthlySavings(data, '2023-11', '2024-01').months.map((m) => [m.month, m.net])).toEqual([
      ['2023-11', 0],
      ['2023-12', 999],
      ['2024-01', 802],
    ]);
    expect(firstMonth(data)).toBe('2023-12');
  });
});

describe('chartBounds', () => {
  it('keeps the real bounds when there is no exceptional month', () => {
    expect(chartBounds([100, 120, -50, 90, 110])).toEqual({ top: 120, bottom: -50 });
  });

  it('ignores exceptional months', () => {
    expect(chartBounds([1000, 1200, 49000, 900, 1100, -800, 0])).toEqual({ top: 1200, bottom: -800 });
    expect(chartBounds([1000, 1200, -60000, 900, 1100])).toEqual({ top: 1200, bottom: 0 });
  });

  it('does nothing with too few months', () => {
    expect(chartBounds([1000, 49000, 0])).toEqual({ top: 49000, bottom: 0 });
  });
});
