import { buildPortfolio } from '../portfolio';
import { buildReturns, investmentFlows, xirr } from '../returns';
import type { Snapshot, Transaction } from '../types';

describe('xirr', () => {
  it('matches the Excel reference example', () => {
    // Microsoft's XIRR documentation example: 0.373362535.
    const rate = xirr([
      { date: '2008-01-01', amount: -10000 },
      { date: '2008-03-01', amount: 2750 },
      { date: '2008-10-30', amount: 4250 },
      { date: '2009-02-15', amount: 3250 },
      { date: '2009-04-01', amount: 2750 },
    ]);
    expect(rate).toBeCloseTo(0.373362535, 6);
  });

  it('gives the plain yearly rate for a single investment', () => {
    // 365-day years (Excel convention): 2023 → 2024 is exactly one.
    expect(xirr([{ date: '2023-01-01', amount: -1000 }, { date: '2024-01-01', amount: 1100 }])).toBeCloseTo(0.1, 8);
    // +21% over two years = +10%/yr (2024 is a leap year, so 731 days).
    expect(xirr([{ date: '2023-01-01', amount: -1000 }, { date: '2025-01-01', amount: 1210 }])).toBeCloseTo(0.0998, 3);
  });

  it('handles losses, near-total losses and huge gains', () => {
    expect(xirr([{ date: '2023-01-01', amount: -1000 }, { date: '2024-01-01', amount: 800 }])).toBeCloseTo(-0.2, 8);
    expect(xirr([{ date: '2023-01-01', amount: -1000 }, { date: '2024-01-01', amount: 1 }])).toBeCloseTo(-0.999, 6);
    expect(xirr([{ date: '2023-01-01', amount: -1000 }, { date: '2024-01-01', amount: 50000 }])).toBeCloseTo(49, 6);
  });

  it('has no answer without money in and money out', () => {
    expect(xirr([{ date: '2023-01-01', amount: -1000 }])).toBeNull();
    expect(xirr([{ date: '2023-01-01', amount: 1000 }, { date: '2024-01-01', amount: 100 }])).toBeNull();
    expect(xirr([])).toBeNull();
  });

  it('accounts for when the money was invested', () => {
    // Same total gain (+200 on 2 000), but the second 1 000 only worked for a short time.
    const late = xirr([
      { date: '2023-01-01', amount: -1000 },
      { date: '2023-12-01', amount: -1000 },
      { date: '2024-01-01', amount: 2200 },
    ])!;
    const early = xirr([{ date: '2023-01-01', amount: -2000 }, { date: '2024-01-01', amount: 2200 }])!;
    expect(late).toBeGreaterThan(early);
  });
});

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

describe('investment flows & portfolio returns', () => {
  it('turns operations into investor flows: buys out, sells and dividends in, value at the end', () => {
    const flows = investmentFlows(
      'units',
      [tx(1, 'BUY', '2023-01-01', 1000), tx(1, 'INCOME', '2023-06-01', 20), tx(1, 'SELL', '2023-09-01', 300)],
      900,
      '2024-01-01',
    );
    expect(flows).toEqual([
      { date: '2023-01-01', amount: -1000 },
      { date: '2023-06-01', amount: 20 },
      { date: '2023-09-01', amount: 300 },
      { date: '2024-01-01', amount: 900 },
    ]);
    // Interest on a balance is inside its value: not a separate flow.
    expect(investmentFlows('balance', [tx(2, 'DEPOSIT', '2023-01-01', 500), tx(2, 'INCOME', '2023-12-01', 10)], 510, '2024-01-01')).toEqual([
      { date: '2023-01-01', amount: -500 },
      { date: '2024-01-01', amount: 510 },
    ]);
  });

  const data: Snapshot = {
    categories: [
      { id: 1, name: 'Cash', kind: 'asset', valuation: 'balance', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
      { id: 2, name: 'Loan', kind: 'liability', valuation: 'balance', color: '#000', sortOrder: 1, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    ],
    accounts: [{ id: 1, name: 'Bank', institution: null, note: null, archived: false, createdAt: '' }],
    assets: [1, 2, 3].map((n) => ({
      id: n,
      accountId: 1,
      categoryId: n === 3 ? 2 : 1,
      name: `A${n}`,
      identifier: null,
      valuation: 'balance' as const,
      note: null,
      reviewDate: null,
      archived: false,
      createdAt: '',
    })),
    transactions: [tx(1, 'DEPOSIT', '2023-01-01', 1000), tx(2, 'DEPOSIT', '2023-12-01', 1000), tx(3, 'DEPOSIT', '2023-01-01', 50000)],
    prices: [
      { id: 1, assetId: 1, date: '2024-01-01', price: 1100, source: 'manual' },
      { id: 2, assetId: 2, date: '2024-01-01', price: 1000, source: 'manual' },
    ],
  };

  it('computes per investment and overall, without debts; under a year is not annualized', () => {
    const r = buildReturns(buildPortfolio(data), '2024-01-01');
    expect(r.forAsset(1)!.rate).toBeCloseTo(0.1, 6);
    expect(r.forAsset(2)!.meaningful).toBe(false);
    expect(r.forAsset(2)!.rate).toBeNull();
    expect(r.forAsset(3)).toBeUndefined();
    // Cached: the same object on a second call.
    expect(r.forAsset(1)).toBe(r.forAsset(1));
    // Overall: 1 000 for a year at +10%, 1 000 for one month at 0% → between 0% and 10%.
    expect(r.total.meaningful).toBe(true);
    expect(r.total.rate!).toBeGreaterThan(0.05);
    expect(r.total.rate!).toBeLessThan(0.1);
  });
});
