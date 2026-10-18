import { cashAdvice, cashTargetAmount, cashValue, emergencyFund, emergencyShare, goalProgress, isCashCategory } from '../emergency';
import { buildPortfolio } from '../portfolio';
import type { Snapshot } from '../types';

describe('emergency fund', () => {
  it('compares cash with months of expenses', () => {
    expect(emergencyFund(2000, 6, 9000)).toEqual({ target: 12000, cash: 9000, monthsCovered: 4.5, missing: 3000, covered: false, progress: 0.75, ratio: 0.75 });
    expect(emergencyFund(2000, 6, 15000)).toMatchObject({ covered: true, missing: 0, progress: 1, ratio: 1.25, monthsCovered: 7.5 });
    expect(emergencyFund(0, 6, 15000)).toBeNull();
  });

  it('gives the cash share to aim for in the target allocation', () => {
    expect(emergencyShare(12000, 100000)).toBeCloseTo(0.12, 10);
    expect(emergencyShare(12000, 8000)).toBe(1);
    expect(emergencyShare(12000, 0)).toBeNull();
  });

  it('advises on cash beyond the emergency fund, in line with the Cash target', () => {
    const fund = emergencyFund(1000, 6, 10000)!; // keep 6 000 for emergencies
    expect(cashAdvice(fund, null)).toEqual({ kind: 'excess', keep: 6000, excess: 4000, basis: 'emergency' });
    // A 15% target worth 8 000 is higher: invest only 2 000.
    expect(cashAdvice(fund, 8000)).toEqual({ kind: 'excess', keep: 8000, excess: 2000, basis: 'target' });
    expect(cashAdvice(fund, 5000)).toMatchObject({ kind: 'excess', keep: 6000, basis: 'emergency' });
    // Even a small extra is reported, like the rebalancing does (15 435 € vs a 15 358.54 € target).
    expect(cashAdvice(emergencyFund(2000, 6, 15435)!, 15358.54)).toMatchObject({ kind: 'excess', excess: expect.closeTo(76.46, 2) });
    // Above the emergency fund but within the target: kept as cash on purpose.
    expect(cashAdvice(emergencyFund(1000, 6, 7000)!, 8000)).toEqual({ kind: 'held-for-target', surplus: 1000, targetAmount: 8000 });
    // Not covered, or exactly met: nothing to say.
    expect(cashAdvice(emergencyFund(1000, 6, 3000)!, null)).toBeNull();
    expect(cashAdvice(emergencyFund(1000, 6, 6000)!, null)).toBeNull();
  });

  it('measures goal progress', () => {
    expect(goalProgress(285000, 750000)).toBeCloseTo(0.38, 10);
    expect(goalProgress(900000, 750000)).toBe(1);
    expect(goalProgress(-10, 750000)).toBe(0);
  });

  it('counts the Cash category only', () => {
    expect(isCashCategory(' cash ')).toBe(true);
    expect(isCashCategory('Cash & savings')).toBe(false);
    const data: Snapshot = {
      categories: [
        { id: 1, name: 'Cash', kind: 'asset', valuation: 'balance', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
        { id: 2, name: 'ETF', kind: 'asset', valuation: 'balance', color: '#000', sortOrder: 1, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
      ],
      accounts: [{ id: 1, name: 'Bank', institution: null, note: null, archived: false, createdAt: '' }],
      assets: [1, 2, 3].map((id) => ({
        id,
        accountId: 1,
        categoryId: id === 3 ? 2 : 1,
        name: `A${id}`,
        identifier: null,
        valuation: 'balance' as const,
        note: null,
        reviewDate: null,
        archived: false,
        createdAt: '',
      })),
      transactions: [1, 2, 3].map((id) => ({ id, assetId: id, type: 'DEPOSIT' as const, date: '2026-01-01', quantity: null, unitPrice: null, amount: id * 1000, fees: 0, note: null })),
      prices: [],
    };
    expect(cashValue(buildPortfolio(data))).toBe(3000);
    // No Cash target yet.
    expect(cashTargetAmount(buildPortfolio(data))).toBeNull();
    // Cash 3 000 + ETF 3 000 in the targets, Cash at 20% → 1 200 €.
    data.categories[0].targetWeight = 0.2;
    data.categories[1].targetWeight = 0.8;
    expect(cashTargetAmount(buildPortfolio(data))).toBeCloseTo(1200, 6);
  });
});
