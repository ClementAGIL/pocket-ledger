import { buildAllocation, foldSlices, OTHER_KEY, type AllocationItem } from '../allocation';
import { buildPortfolio } from '../portfolio';
import type { Snapshot } from '../types';

const data: Snapshot = {
  categories: [
    { id: 1, name: 'ETF', kind: 'asset', valuation: 'balance', color: '#111', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    { id: 2, name: 'Cash', kind: 'asset', valuation: 'balance', color: '#222', sortOrder: 1, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    { id: 3, name: 'Loan', kind: 'liability', valuation: 'balance', color: '#333', sortOrder: 2, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
  ],
  accounts: [
    { id: 1, name: 'Broker', institution: null, note: null, archived: false, createdAt: '' },
    { id: 2, name: 'Bank', institution: null, note: null, archived: false, createdAt: '' },
  ],
  assets: [
    { id: 1, accountId: 1, categoryId: 1, name: 'World', identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' },
    { id: 2, accountId: 1, categoryId: 2, name: 'Broker cash', identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' },
    { id: 3, accountId: 2, categoryId: 2, name: 'Savings', identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' },
    { id: 4, accountId: 2, categoryId: 3, name: 'Mortgage', identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' },
    { id: 5, accountId: 2, categoryId: 2, name: 'Empty', identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' },
  ],
  transactions: [],
  prices: [
    { id: 1, assetId: 1, date: '2024-01-01', price: 600, source: 'manual' },
    { id: 2, assetId: 2, date: '2024-01-01', price: 100, source: 'manual' },
    { id: 3, assetId: 3, date: '2024-01-01', price: 300, source: 'manual' },
    { id: 4, assetId: 4, date: '2024-01-01', price: 5000, source: 'manual' },
    { id: 5, assetId: 5, date: '2024-01-01', price: 0, source: 'manual' },
  ],
};

describe('buildAllocation', () => {
  const portfolio = buildPortfolio(data);

  it('groups by category, without liabilities or empty positions', () => {
    const a = buildAllocation(portfolio, 'category');
    expect(a.total).toBe(1000);
    expect(a.items.map((i) => [i.label, i.value, i.weight, i.color])).toEqual([
      ['ETF', 600, 0.6, '#111'],
      ['Cash', 400, 0.4, '#222'],
    ]);
  });

  it('groups by account', () => {
    expect(buildAllocation(portfolio, 'account').items.map((i) => [i.label, i.value])).toEqual([
      ['Broker', 700],
      ['Bank', 300],
    ]);
  });

  it('lists individual investments', () => {
    const a = buildAllocation(portfolio, 'asset');
    expect(a.items.map((i) => i.label)).toEqual(['World', 'Savings', 'Broker cash']);
    expect(a.items[1].sublabel).toBe('Bank · Cash');
  });
});

describe('foldSlices', () => {
  const items: AllocationItem[] = [40, 20, 10, 8, 5, 4, 3, 3, 3, 2, 2].map((v, i) => ({
    key: `k${i}`,
    label: `L${i}`,
    value: v,
    weight: v / 100,
    color: null,
  }));

  it('keeps everything when it fits the 8 colors', () => {
    expect(foldSlices(items.slice(0, 8))).toHaveLength(8);
  });

  it('folds the smallest items into "Other", never a 9th hued slice', () => {
    const slices = foldSlices(items);
    expect(slices).toHaveLength(8);
    expect(slices[7]).toEqual({ key: OTHER_KEY, label: 'Other (4)', value: 10, weight: 0.1, members: ['k7', 'k8', 'k9', 'k10'] });
    expect(foldSlices(items.slice(0, 9)).map((s) => s.key)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', OTHER_KEY]);
  });
});
