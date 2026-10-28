import { assetPerformance, buildPerformance, combine, periodStart } from '../performance';
import { buildHistory, moneyFlows } from '../history';
import { buildPortfolio, groupByAccount } from '../portfolio';
import { computePosition, replay } from '../positions';
import { monthlySavings } from '../savings';
import { sortAccounts } from '../sorting';
import type { PricePoint, Snapshot, Transaction, TxType } from '../types';

let nextId = 1;
const tx = (type: TxType, date: string, fields: Partial<Transaction> = {}): Transaction => ({
  id: nextId++,
  assetId: 1,
  type,
  date,
  quantity: fields.quantity ?? null,
  unitPrice: fields.unitPrice ?? null,
  amount: fields.amount ?? (fields.quantity ?? 0) * (fields.unitPrice ?? 0),
  fees: fields.fees ?? 0,
  note: null,
});
const price = (date: string, value: number): PricePoint => ({ id: nextId++, assetId: 1, date, price: value, source: 'manual' });

describe('periodStart', () => {
  it('computes calendar and rolling starts', () => {
    expect(periodStart('MTD', '2024-06-17')).toBe('2024-06-01');
    expect(periodStart('YTD', '2024-06-17')).toBe('2024-01-01');
    expect(periodStart('12M', '2024-06-17')).toBe('2023-06-17');
    expect(periodStart('ALL', '2024-06-17')).toBeNull();
  });
});

describe('assetPerformance', () => {
  it('money added during the period is not a gain (Modified Dietz %)', () => {
    const txs = [tx('DEPOSIT', '2024-05-01', { amount: 10000 }), tx('DEPOSIT', '2024-06-15', { amount: 1000 })];
    const prices = [price('2024-05-31', 10000), price('2024-06-30', 11300)];
    const p = assetPerformance('balance', replay('balance', txs, prices), txs, '2024-06-01', '2024-06-30');
    expect(p.startValue).toBe(10000);
    expect(p.endValue).toBe(11300);
    expect(p.netFlows).toBe(1000);
    expect(p.gain).toBe(300);
    expect(p.pct).toBeCloseTo(300 / (10000 + (1000 * 15) / 29));
  });

  it('a sale during the period keeps its gain', () => {
    const txs = [
      tx('BUY', '2024-01-10', { quantity: 10, unitPrice: 100 }),
      tx('SELL', '2024-06-10', { quantity: 5, unitPrice: 130 }),
    ];
    const prices = [price('2024-05-31', 120), price('2024-06-30', 140)];
    const p = assetPerformance('units', replay('units', txs, prices), txs, '2024-06-01', '2024-06-30');
    expect(p.startValue).toBe(1200);
    expect(p.endValue).toBe(700);
    expect(p.netFlows).toBe(-650);
    // 5 units sold 120 → 130 (+50) and 5 kept 120 → 140 (+100).
    expect(p.gain).toBe(150);
  });

  it('dividends paid out count as gain; interest is already in the balance', () => {
    const units = [tx('BUY', '2024-01-01', { quantity: 1, unitPrice: 100 }), tx('INCOME', '2024-06-05', { amount: 4 })];
    const pu = assetPerformance('units', replay('units', units, []), units, '2024-06-01', '2024-06-30');
    expect(pu.gain).toBe(4);
    expect(pu.income).toBe(4);
    expect([pu.priceGain, pu.dividends, pu.interest]).toEqual([0, 4, 0]);

    const balance = [tx('DEPOSIT', '2024-01-01', { amount: 1000 }), tx('INCOME', '2024-06-05', { amount: 30 })];
    const pb = assetPerformance('balance', replay('balance', balance, []), balance, '2024-06-01', '2024-06-30');
    expect(pb.gain).toBe(30);
    expect(pb.income).toBe(30);
    expect([pb.priceGain, pb.dividends, pb.interest]).toEqual([0, 0, 30]);
  });

  it('a position opened during the period starts from zero', () => {
    const txs = [tx('BUY', '2024-06-10', { quantity: 2, unitPrice: 50 })];
    const prices = [price('2024-06-30', 60)];
    const p = assetPerformance('units', replay('units', txs, prices), txs, '2024-06-01', '2024-06-30');
    expect(p.startValue).toBe(0);
    expect(p.gain).toBe(20);
    expect(p.pct).toBeCloseTo(20 / (100 * (20 / 29)));
  });

  it('since the start = unrealized + realized + income, % of net money invested', () => {
    const txs = [
      tx('BUY', '2024-01-01', { quantity: 10, unitPrice: 100 }),
      tx('SELL', '2024-03-01', { quantity: 5, unitPrice: 130 }),
      tx('INCOME', '2024-04-01', { amount: 10 }),
    ];
    const prices = [price('2024-06-30', 140)];
    const p = assetPerformance('units', replay('units', txs, prices), txs, null, '2024-06-30');
    const pos = computePosition('units', txs, prices);
    expect(p.gain).toBe(pos.unrealized + pos.realized + pos.income);
    expect(p.gain).toBe(360);
    expect(p.pct).toBeCloseTo(360 / 350);
    // 150 realized on the sale + 200 unrealized on the 5 kept units; 10 of dividends.
    expect([p.priceGain, p.dividends, p.interest]).toEqual([350, 10, 0]);
  });

  it('since the start, a closed position with profit uses money put in as base', () => {
    const txs = [
      tx('BUY', '2024-01-01', { quantity: 10, unitPrice: 100 }),
      tx('SELL', '2024-03-01', { quantity: 10, unitPrice: 150 }),
    ];
    const p = assetPerformance('units', replay('units', txs, []), txs, null, '2024-06-30');
    expect(p.gain).toBe(500);
    expect(p.pct).toBeCloseTo(0.5);
  });
});

describe('buildPerformance', () => {
  const data: Snapshot = {
    categories: [
      { id: 1, name: 'Cash', kind: 'asset', valuation: 'balance', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
      { id: 2, name: 'Loan', kind: 'liability', valuation: 'balance', color: '#000', sortOrder: 1, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    ],
    accounts: [{ id: 1, name: 'Bank', institution: null, note: null, archived: false, createdAt: '' }],
    assets: [
      { id: 1, accountId: 1, categoryId: 1, name: 'Savings', identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' },
      { id: 2, accountId: 1, categoryId: 1, name: 'Checking', identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' },
      { id: 3, accountId: 1, categoryId: 2, name: 'Mortgage', identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' },
    ],
    transactions: [],
    prices: [
      { id: 1, assetId: 1, date: '2023-12-31', price: 1000, source: 'manual' },
      { id: 2, assetId: 1, date: '2024-06-30', price: 1100, source: 'manual' },
      { id: 3, assetId: 2, date: '2023-12-31', price: 500, source: 'manual' },
      { id: 4, assetId: 2, date: '2024-06-30', price: 450, source: 'manual' },
      { id: 5, assetId: 3, date: '2023-12-31', price: 9000, source: 'manual' },
      { id: 6, assetId: 3, date: '2024-06-30', price: 8000, source: 'manual' },
    ],
  };

  it('sums assets per category and in total, without liabilities', () => {
    const perf = buildPerformance(buildPortfolio(data), 'YTD', '2024-06-30');
    expect(perf.start).toBe('2024-01-01');
    expect(perf.total.startValue).toBe(1500);
    expect(perf.total.gain).toBe(50);
    expect(perf.total.pct).toBeCloseTo(50 / 1500);
    expect(perf.byCategory.get(1)!.gain).toBe(50);
    expect(perf.byAsset.get(2)!.gain).toBe(-50);
  });

  it('combine is additive', () => {
    const a = assetPerformance('balance', [], [], '2024-01-01', '2024-06-30');
    expect(combine([a, a], false).gain).toBe(0);
  });
});

describe('dividends paid into a cash account', () => {
  const cat = (id: number, name: string, valuation: 'units' | 'balance') =>
    ({ id, name, kind: 'asset', valuation, color: '#000', sortOrder: id, isDefault: true, targetWeight: null, updateReminder: 'monthly' }) as const;
  const asset = (id: number, categoryId: number, valuation: 'units' | 'balance') =>
    ({ id, accountId: 1, categoryId, name: `A${id}`, identifier: null, valuation, note: null, reviewDate: null, archived: false, createdAt: '' }) as const;
  const row = (id: number, assetId: number, type: TxType, date: string, amount: number, linkedId: number | null, quantity: number | null = null): Transaction => ({
    id,
    assetId,
    type,
    date,
    quantity,
    unitPrice: quantity ? amount / quantity : null,
    amount,
    fees: 0,
    note: null,
    linkedId,
  });
  // 1000 € put into the cash account, 900 € of shares bought from it, a 20 € dividend paid into it.
  const data: Snapshot = {
    categories: [cat(1, 'ETF', 'units'), cat(2, 'Cash', 'balance')],
    accounts: [{ id: 1, name: 'Broker', institution: null, note: null, archived: false, createdAt: '' }],
    assets: [asset(1, 1, 'units'), asset(2, 2, 'balance')],
    transactions: [
      row(101, 2, 'DEPOSIT', '2024-01-02', 1000, null),
      row(102, 1, 'BUY', '2024-01-03', 900, 103, 10),
      row(103, 2, 'WITHDRAW', '2024-01-03', 900, 102),
      row(104, 1, 'INCOME', '2024-03-01', 20, 105),
      row(105, 2, 'DEPOSIT', '2024-03-01', 20, 104),
    ],
    prices: [{ id: 1, assetId: 1, date: '2024-06-30', price: 95, source: 'manual' }],
  };
  const portfolio = buildPortfolio(data);

  it('are a gain of the stock, not money added', () => {
    const perf = buildPerformance(portfolio, 'ALL', '2024-06-30');
    expect(perf.total.netFlows).toBe(1000);
    expect(perf.total.gain).toBe(70);
    expect(perf.total.dividends).toBe(20);
    expect(perf.total.pct).toBeCloseTo(0.07);
    // Each account on its own: the dividend is the stock's, the cash account just received it.
    expect(perf.byAsset.get(1)!.gain).toBe(70);
    expect(perf.byAsset.get(2)!.gain).toBe(0);
    // Over a period too: no money added in the first half.
    const ytd = buildPerformance(portfolio, 'YTD', '2024-06-30');
    expect(ytd.total.netFlows).toBe(1000);
    // Only the 1000 € of 2 January is weighted (the buy and its cash side cancel out).
    expect(ytd.total.weightedFlows).toBeCloseTo((1000 * 180) / 181, 5);
  });

  it('stay inside the account when the cash is in the same account', () => {
    const perf = buildPerformance(portfolio, 'ALL', '2024-06-30');
    expect(perf.byAccount.get(1)!.netFlows).toBe(1000);
    expect(perf.byAccount.get(1)!.gain).toBe(70);
    // Paid into another account's cash: money leaving the broker, arriving at the bank.
    const twoAccounts = buildPortfolio({
      ...data,
      accounts: [...data.accounts, { id: 2, name: 'Bank', institution: null, note: null, archived: false, createdAt: '' }],
      assets: [data.assets[0], { ...data.assets[1], accountId: 2 }],
    });
    const split = buildPerformance(twoAccounts, 'ALL', '2024-06-30');
    expect(split.byAccount.get(1)!.gain).toBe(70);
    expect(split.byAccount.get(2)!.netFlows).toBe(1000 - 900 + 20);
    expect(split.total.netFlows).toBe(1000);
  });

  it('do not raise the money put in (Home chart line)', () => {
    const points = buildHistory(
      [...portfolio.byAssetId.values()].map((v) => ({ steps: v.steps, isLiability: v.isLiability })),
      '2024-06-30',
      moneyFlows(portfolio),
    );
    expect(points.map((p) => [p.date, p.invested])).toEqual([
      ['2024-01-02', 1000],
      ['2024-01-03', 1000],
      ['2024-03-01', 1000],
      ['2024-06-30', 1000],
    ]);
    expect(points[points.length - 1].value).toBe(1070);
  });

  it('are not savings', () => {
    expect(monthlySavings(data, '2024-01', '2024-03').months.map((m) => m.net)).toEqual([1000, 0, 0]);
  });
});

describe('groupByAccount', () => {
  const cat = (id: number, name: string, kind: 'asset' | 'liability' = 'asset') =>
    ({ id, name, kind, valuation: 'balance', color: '#000', sortOrder: id, isDefault: true, targetWeight: null, updateReminder: 'monthly' }) as const;
  const account = (id: number, name: string) => ({ id, name, institution: null, note: null, archived: false, createdAt: '' });
  const asset = (id: number, accountId: number, categoryId: number) =>
    ({ id, accountId, categoryId, name: `A${id}`, identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' }) as const;
  const data: Snapshot = {
    categories: [cat(1, 'Cash'), cat(2, 'Stock'), cat(3, 'Loan', 'liability')],
    accounts: [account(1, 'Bank'), account(2, 'Broker')],
    assets: [asset(1, 1, 1), asset(2, 2, 1), asset(3, 2, 2), asset(4, 1, 3)],
    transactions: [],
    prices: [
      { id: 1, assetId: 1, date: '2024-01-01', price: 100, source: 'manual' },
      { id: 2, assetId: 2, date: '2024-01-01', price: 50, source: 'manual' },
      { id: 3, assetId: 3, date: '2024-01-01', price: 850, source: 'manual' },
      { id: 4, assetId: 4, date: '2024-01-01', price: 300, source: 'manual' },
    ],
  };
  const portfolio = buildPortfolio(data);
  const accounts = groupByAccount(portfolio.groups, portfolio.summary.assetsValue);

  it('regroups the categories by account, with shares of the account and of all assets', () => {
    const broker = accounts.find((a) => a.account.name === 'Broker')!;
    expect(broker.value).toBe(900);
    expect(broker.weight).toBeCloseTo(0.9);
    // Same order as the category list (largest first).
    expect(broker.groups.map((g) => [g.category.name, g.value, g.weight])).toEqual([
      ['Stock', 850, 850 / 900],
      ['Cash', 50, 50 / 900],
    ]);
    const bank = accounts.find((a) => a.account.name === 'Bank')!;
    expect([bank.value, bank.debts, bank.count]).toEqual([100, 300, 2]);
    // Debts last, with no share.
    expect(bank.groups.map((g) => [g.category.name, g.weight])).toEqual([
      ['Cash', 1],
      ['Loan', 0],
    ]);
  });

  it('sorts accounts by net value', () => {
    const perf = buildPerformance(portfolio, 'ALL', '2024-01-01');
    expect(sortAccounts(accounts, 'value', 'desc', perf).map((a) => a.account.name)).toEqual(['Broker', 'Bank']);
    expect(sortAccounts(accounts, 'value', 'asc', perf).map((a) => a.account.name)).toEqual(['Bank', 'Broker']);
  });
});
