import { buildAllocation } from '../allocation';
import { accountsLabel, findHolding, holdingKey, holdingPerformance, mergeRows, sumStates } from '../holdings';
import { buildPerformance } from '../performance';
import { buildPortfolio } from '../portfolio';
import { buildReturns } from '../returns';
import { sortRows } from '../sorting';
import type { Asset, Snapshot, Transaction } from '../types';

const asset = (id: number, accountId: number, name: string, identifier: string | null, fields: Partial<Asset> = {}): Asset => ({
  id,
  accountId,
  categoryId: 1,
  name,
  identifier,
  valuation: 'units',
  note: null,
  reviewDate: null,
  archived: false,
  createdAt: '',
  ...fields,
});
let nextId = 1;
const buy = (assetId: number, date: string, quantity: number, unitPrice: number): Transaction => ({
  id: nextId++,
  assetId,
  type: 'BUY',
  date,
  quantity,
  unitPrice,
  amount: quantity * unitPrice,
  fees: 0,
  note: null,
});

// Intel in two accounts (same ISIN, different case), Apple in one, a savings account with an identifier.
const data = (): Snapshot => ({
  schedules: [],
  categories: [
    { id: 1, name: 'Stocks', kind: 'asset', valuation: 'units', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    { id: 2, name: 'Cash', kind: 'asset', valuation: 'balance', color: '#000', sortOrder: 1, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
  ],
  accounts: [
    { id: 1, name: 'DEGIRO', institution: null, note: null, archived: false, createdAt: '' },
    { id: 2, name: 'Revolut', institution: null, note: null, archived: false, createdAt: '' },
  ],
  assets: [
    asset(1, 1, 'Intel Corp', 'US4581401001'),
    asset(2, 2, 'Intel', ' us4581401001 '),
    asset(3, 2, 'Apple', 'AAPL'),
    asset(4, 1, 'Livret', 'X1', { categoryId: 2, valuation: 'balance' }),
    asset(5, 2, 'Livret 2', 'X1', { categoryId: 2, valuation: 'balance' }),
  ],
  transactions: [
    buy(1, '2022-01-10', 30, 40),
    buy(2, '2023-03-01', 10, 30),
    buy(3, '2023-01-01', 2, 150),
    { id: nextId++, assetId: 4, type: 'DEPOSIT', date: '2023-01-01', quantity: null, unitPrice: null, amount: 100, fees: 0, note: null },
    { id: nextId++, assetId: 5, type: 'DEPOSIT', date: '2023-01-01', quantity: null, unitPrice: null, amount: 100, fees: 0, note: null },
  ],
  prices: [
    { id: 1, assetId: 1, date: '2024-01-01', price: 20, source: 'manual' },
    { id: 2, assetId: 2, date: '2024-02-01', price: 25, source: 'online' },
  ],
});

describe('holdingKey', () => {
  it('is the category + identifier, case and spaces ignored, for units investments only', () => {
    const [a, b, , d] = data().assets;
    expect(holdingKey(a)).toBe('1:us4581401001');
    expect(holdingKey(b)).toBe(holdingKey(a));
    expect(holdingKey(d)).toBeNull();
    expect(holdingKey(asset(9, 1, 'No id', '  '))).toBeNull();
    expect(holdingKey(asset(9, 1, 'Other category', 'US4581401001', { categoryId: 3 }))).not.toBe(holdingKey(a));
  });
});

describe('sumStates', () => {
  it('adds up and keeps the most recently known price', () => {
    const state = (price: number, priceDate: string) => ({ quantity: 1, price, value: price, invested: 10, realized: 1, income: 2, lastDate: priceDate, priceDate });
    expect(sumStates([state(5, '2024-02-01'), state(6, '2024-01-01')])).toEqual({
      quantity: 2,
      price: 5,
      value: 11,
      invested: 20,
      realized: 2,
      income: 4,
      lastDate: '2024-02-01',
      priceDate: '2024-02-01',
    });
  });
});

describe('mergeRows', () => {
  it('merges the same identifier of one category into one row, at the place of the first one', () => {
    const portfolio = buildPortfolio(data());
    const stocks = portfolio.groups.find((g) => g.category.id === 1)!;
    const rows = mergeRows(stocks.items);
    expect(rows.map((r) => (r.kind === 'asset' ? r.view.asset.name : `${r.holding.name}×${r.holding.items.length}`))).toEqual(
      expect.arrayContaining(['Apple', 'Intel Corp×2']),
    );
    expect(rows).toHaveLength(2);

    const intel = rows.find((r) => r.kind === 'holding')!;
    if (intel.kind !== 'holding') throw new Error();
    const { position, items } = intel.holding;
    // 30 at 20 € (DEGIRO, largest, named first) + 10 at 25 € (Revolut); price = the latest one.
    expect(items.map((v) => v.account.name)).toEqual(['DEGIRO', 'Revolut']);
    expect(position.quantity).toBe(40);
    expect(position.value).toBe(850);
    expect(position.invested).toBe(1500);
    expect(position.avgCost).toBe(37.5);
    expect(position.unrealized).toBe(-650);
    expect(position.price).toBe(25);
    expect(position.priceDate).toBe('2024-02-01');
  });

  it('counts distinct accounts: two lines in the same account are labelled with its name', () => {
    const snapshot = data();
    snapshot.assets[1] = { ...snapshot.assets[1], accountId: 1 };
    const intel = findHolding(buildPortfolio(snapshot), '1:us4581401001')!;
    expect(intel.items).toHaveLength(2);
    expect(intel.accountCount).toBe(1);
    expect(accountsLabel(intel)).toBe('DEGIRO');
    expect(accountsLabel(findHolding(buildPortfolio(data()), '1:us4581401001')!)).toBe('2 accounts');
  });

  it('never merges balance investments', () => {
    const portfolio = buildPortfolio(data());
    const cash = portfolio.groups.find((g) => g.category.id === 2)!;
    expect(mergeRows(cash.items).every((r) => r.kind === 'asset')).toBe(true);
  });
});

describe('a holding in the rest of the app', () => {
  const portfolio = buildPortfolio(data());
  const intel = findHolding(portfolio, '1:us4581401001')!;

  it('is found with all its investments', () => {
    expect(intel.items.map((v) => v.asset.id).sort()).toEqual([1, 2]);
    expect(findHolding(portfolio, '1:nothing')).toBeNull();
  });

  it('sums its investments’ period performance', () => {
    const performance = buildPerformance(portfolio, 'ALL', '2024-06-01');
    const perf = holdingPerformance(intel, performance);
    expect(perf.gain).toBeCloseTo(performance.byAsset.get(1)!.gain + performance.byAsset.get(2)!.gain);
    expect(perf.gain).toBeCloseTo(-650);
  });

  it('sorts with the merged figures', () => {
    const performance = buildPerformance(portfolio, 'ALL', '2024-06-01');
    const rows = mergeRows(portfolio.groups.find((g) => g.category.id === 1)!.items);
    // Intel: 850 € in total, more than Apple (300 €), although each Intel line alone is smaller than 850.
    const names = (key: 'value' | 'gain') =>
      sortRows(rows, key, 'desc', performance).map((r) => (r.kind === 'asset' ? r.view.asset.name : r.holding.name));
    expect(names('value')).toEqual(['Intel Corp', 'Apple']);
    expect(names('gain')).toEqual(['Apple', 'Intel Corp']);
  });

  it('is one slice of the allocation by investment', () => {
    const items = buildAllocation(portfolio, 'asset').items;
    expect(items.map((i) => [i.label, i.sublabel, i.value])).toEqual([
      ['Intel Corp', '2 accounts · Stocks', 850],
      ['Apple', 'Revolut · Stocks', 300],
      ['Livret', 'DEGIRO · Cash', 100],
      ['Livret 2', 'Revolut · Cash', 100],
    ]);
  });

  it('has one annualized return over its flows', () => {
    const returns = buildReturns(portfolio, '2024-06-01');
    const merged = returns.forAssets([1, 2])!;
    expect(merged.meaningful).toBe(true);
    expect(merged.rate).toBeLessThan(0);
    expect(returns.forAssets([4])?.rate).toBeCloseTo(0);
    expect(returns.forAssets([99])).toBeUndefined();
  });
});
