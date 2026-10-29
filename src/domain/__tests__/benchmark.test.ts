import { benchmarkSeries } from '../benchmark';
import type { Snapshot, Transaction } from '../types';

let id = 1;
const tx = (assetId: number, type: Transaction['type'], date: string, amount: number): Transaction => ({
  id: id++,
  assetId,
  type,
  date,
  quantity: type === 'BUY' || type === 'SELL' ? 1 : null,
  unitPrice: type === 'BUY' || type === 'SELL' ? amount : null,
  amount,
  fees: 0,
  note: null,
});

const base = (transactions: Transaction[]): Snapshot => ({
  schedules: [],
  categories: [
    { id: 1, name: 'ETF', kind: 'asset', valuation: 'units', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    { id: 2, name: 'Cash', kind: 'asset', valuation: 'balance', color: '#000', sortOrder: 1, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    { id: 3, name: 'Loan', kind: 'liability', valuation: 'balance', color: '#000', sortOrder: 2, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
  ],
  accounts: [{ id: 1, name: 'A', institution: null, note: null, archived: false, createdAt: '' }],
  assets: [
    { id: 1, accountId: 1, categoryId: 1, name: 'World', identifier: null, valuation: 'units', note: null, reviewDate: null, archived: false, createdAt: '' },
    { id: 2, accountId: 1, categoryId: 2, name: 'Savings', identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' },
    { id: 3, accountId: 1, categoryId: 3, name: 'Loan', identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' },
  ],
  transactions,
  prices: [],
});

describe('benchmarkSeries', () => {
  it('compounds a single deposit at the annual rate', () => {
    const [start, oneYear, twoYears] = benchmarkSeries(
      base([tx(1, 'BUY', '2023-01-01', 1000)]),
      ['2023-01-01', '2024-01-01', '2025-01-01'],
      0.04,
    );
    expect(start).toBe(1000);
    // 2023 has 365 days; 2024 is a leap year (366): close to 4% per year.
    expect(oneYear).toBeCloseTo(1040, 6);
    expect(twoYears).toBeCloseTo(1040 * Math.exp((Math.log(1.04) * 366) / 365), 6);
  });

  it('is zero before the first flow and adds later flows', () => {
    const series = benchmarkSeries(
      base([tx(1, 'BUY', '2023-01-01', 1000), tx(2, 'DEPOSIT', '2024-01-01', 500)]),
      ['2022-06-01', '2024-01-01'],
      0.04,
    );
    expect(series[0]).toBe(0);
    expect(series[1]).toBeCloseTo(1540, 6);
  });

  it('removes sells, withdrawals and dividends; ignores interest and debts', () => {
    const [value] = benchmarkSeries(
      base([
        tx(1, 'BUY', '2024-01-01', 1000),
        tx(1, 'SELL', '2024-01-01', 200),
        tx(1, 'INCOME', '2024-01-01', 10),
        tx(2, 'DEPOSIT', '2024-01-01', 300),
        tx(2, 'WITHDRAW', '2024-01-01', 100),
        tx(2, 'INCOME', '2024-01-01', 50),
        tx(3, 'DEPOSIT', '2024-01-01', 99999),
      ]),
      ['2024-01-01'],
      0.04,
    );
    expect(value).toBe(1000 - 200 - 10 + 300 - 100);
  });

  it('at 0% it equals the net money put in', () => {
    const [value] = benchmarkSeries(base([tx(1, 'BUY', '2020-01-01', 1000), tx(1, 'BUY', '2022-01-01', 500)]), ['2024-01-01'], 0);
    expect(value).toBe(1500);
  });
});
