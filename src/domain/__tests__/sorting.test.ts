import { buildPerformance } from '../performance';
import { buildPortfolio } from '../portfolio';
import { sortGroups } from '../sorting';
import type { Asset, Snapshot, Transaction } from '../types';

const asset = (id: number, categoryId: number, name: string): Asset => ({
  id,
  accountId: 1,
  categoryId,
  name,
  identifier: null,
  valuation: 'balance',
  note: null,
  reviewDate: null,
  archived: false,
  createdAt: '',
});
const deposit = (id: number, assetId: number, amount: number): Transaction => ({
  id,
  assetId,
  type: 'DEPOSIT',
  date: '2024-01-01',
  quantity: null,
  unitPrice: null,
  amount,
  fees: 0,
  note: null,
});

// Cash: A (invested 1000, worth 1100 → +100, +10%), B (invested 5000, worth 4800 → −200)
// ETF:  C (invested 100, worth 300 → +200, +200%)
// Loan: D
const data: Snapshot = {
  schedules: [],
  categories: [
    { id: 1, name: 'Cash', kind: 'asset', valuation: 'balance', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    { id: 2, name: 'ETF', kind: 'asset', valuation: 'balance', color: '#000', sortOrder: 1, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    { id: 3, name: 'Loan', kind: 'liability', valuation: 'balance', color: '#000', sortOrder: 2, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
  ],
  accounts: [{ id: 1, name: 'Bank', institution: null, note: null, archived: false, createdAt: '' }],
  assets: [asset(1, 1, 'A'), asset(2, 1, 'B'), asset(3, 2, 'C'), asset(4, 3, 'D')],
  transactions: [deposit(1, 1, 1000), deposit(2, 2, 5000), deposit(3, 3, 100)],
  prices: [
    { id: 1, assetId: 1, date: '2024-06-01', price: 1100, source: 'manual' },
    { id: 2, assetId: 2, date: '2024-06-01', price: 4800, source: 'manual' },
    { id: 3, assetId: 3, date: '2024-06-01', price: 300, source: 'manual' },
    { id: 4, assetId: 4, date: '2024-06-01', price: 90000, source: 'manual' },
  ],
};

const portfolio = buildPortfolio(data);
const performance = buildPerformance(portfolio, 'ALL', '2024-06-30');
const order = (key: Parameters<typeof sortGroups>[1], dir: Parameters<typeof sortGroups>[2] = 'desc') =>
  sortGroups(portfolio.groups, key, dir, performance).map((g) => `${g.category.name}:${g.items.map((v) => v.asset.name).join('')}`);

describe('sortGroups', () => {
  it('sorts by value, largest first; liabilities stay last', () => {
    expect(order('value')).toEqual(['Cash:BA', 'ETF:C', 'Loan:D']);
    expect(order('value', 'asc')).toEqual(['ETF:C', 'Cash:AB', 'Loan:D']);
  });

  it('sorts by invested', () => {
    expect(order('invested')).toEqual(['Cash:BA', 'ETF:C', 'Loan:D']);
  });

  it('sorts by gain in € and in %', () => {
    // Cash gain = +100 − 200 = −100; ETF gain = +200.
    expect(order('gain')).toEqual(['ETF:C', 'Cash:AB', 'Loan:D']);
    expect(order('gainPct')).toEqual(['ETF:C', 'Cash:AB', 'Loan:D']);
    expect(order('gain', 'asc')).toEqual(['Cash:BA', 'ETF:C', 'Loan:D']);
  });
});
