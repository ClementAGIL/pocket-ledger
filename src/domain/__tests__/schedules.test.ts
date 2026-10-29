import { buildPortfolio } from '../portfolio';
import { computePosition } from '../positions';
import {
  draftOccurrences,
  dueDates,
  dueOccurrences,
  interestPaid,
  loanPayoff,
  loanSplit,
  nextDate,
  occurrenceRecords,
  repayOrInvest,
  validateSchedule,
} from '../schedules';
import type { Schedule, Snapshot, Transaction } from '../types';

const schedule = (over: Partial<Schedule> = {}): Schedule => ({
  id: 1,
  assetId: 1,
  type: 'BUY',
  amount: 200,
  day: 5,
  startDate: '2026-01-01',
  doneUntil: null,
  cashAssetId: null,
  rate: null,
  ...over,
});

const tx = (id: number, assetId: number, type: Transaction['type'], date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id,
  assetId,
  type,
  date,
  quantity: null,
  unitPrice: null,
  amount,
  fees: 0,
  note: null,
  ...extra,
});

const data: Snapshot = {
  categories: [
    { id: 1, name: 'ETF', kind: 'asset', valuation: 'units', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    { id: 2, name: 'Loan', kind: 'liability', valuation: 'balance', color: '#000', sortOrder: 1, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
  ],
  accounts: [{ id: 1, name: 'Bank', institution: null, note: null, archived: false, createdAt: '' }],
  assets: [
    { id: 1, accountId: 1, categoryId: 1, name: 'World', identifier: null, valuation: 'units', note: null, reviewDate: null, archived: false, createdAt: '' },
    { id: 2, accountId: 1, categoryId: 2, name: 'Mortgage', identifier: null, valuation: 'balance', note: null, reviewDate: null, archived: false, createdAt: '' },
  ],
  transactions: [
    tx(1, 1, 'BUY', '2025-12-01', 1000, { quantity: 10, unitPrice: 100 }),
    tx(2, 2, 'DEPOSIT', '2025-12-01', 120000),
  ],
  prices: [],
  schedules: [],
};
const portfolio = buildPortfolio(data);
const world = portfolio.byAssetId.get(1)!;
const mortgage = portfolio.byAssetId.get(2)!;

describe('due dates', () => {
  it('lists the months not done yet, up to today', () => {
    expect(dueDates(schedule(), '2026-03-04')).toEqual(['2026-01-05', '2026-02-05']);
    expect(dueDates(schedule(), '2026-03-05')).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
    expect(dueDates(schedule({ doneUntil: '2026-02-05' }), '2026-03-05')).toEqual(['2026-03-05']);
    // The start date itself counts; a 31st is clamped to the month's last day.
    expect(dueDates(schedule({ startDate: '2026-01-05' }), '2026-01-05')).toEqual(['2026-01-05']);
    expect(dueDates(schedule({ day: 31, startDate: '2026-02-01' }), '2026-03-01')).toEqual(['2026-02-28']);
  });

  it('gives the next date', () => {
    expect(nextDate(schedule(), '2026-03-04')).toBe('2026-03-05');
    expect(nextDate(schedule(), '2026-03-05')).toBe('2026-04-05');
    expect(nextDate(schedule({ startDate: '2026-06-01' }), '2026-03-04')).toBe('2026-06-05');
  });

  it('collects everything due, by date, without archived investments', () => {
    const due = dueOccurrences([schedule(), schedule({ id: 2, assetId: 2, type: 'WITHDRAW', day: 1 })], portfolio.byAssetId, '2026-02-10');
    expect(due.map((o) => [o.view.asset.name, o.date])).toEqual([
      ['Mortgage', '2026-01-01'],
      ['World', '2026-01-05'],
      ['Mortgage', '2026-02-01'],
      ['World', '2026-02-05'],
    ]);
  });
});

describe('loans', () => {
  it('splits a payment into interest and principal', () => {
    // 120 000 € at 3% a year: 300 € of interest this month.
    expect(loanSplit(120000, 0.03, 800)).toEqual({ interest: 300, principal: 500 });
    // The last payment only repays what's left.
    expect(loanSplit(100, 0.03, 800)).toEqual({ interest: 0.25, principal: 100 });
    // A payment below the interest repays nothing.
    expect(loanSplit(120000, 0.03, 200)).toEqual({ interest: 200, principal: 0 });
  });

  it('finds the payoff date and the interest left', () => {
    const p = loanPayoff(1200, 0, 100, 5, '2026-01-10')!;
    expect(p).toEqual({ payments: 12, date: '2027-01-05', interest: 0 });
    const withRate = loanPayoff(120000, 0.03, 800, 5, '2026-01-10')!;
    // Like a bank's schedule: n = −ln(1 − 300/800) / ln(1.0025) ≈ 188.2 payments, ≈ 30.6 k€ of interest.
    expect(withRate.payments).toBe(189);
    expect(withRate.interest).toBeGreaterThan(30400);
    expect(withRate.interest).toBeLessThan(30800);
    expect(loanPayoff(120000, 0.03, 300, 5, '2026-01-10')).toBeNull();
  });

  it('sums the interest paid and compares the rate with investing', () => {
    expect(interestPaid([tx(1, 2, 'WITHDRAW', '2026-01-01', 500, { fees: 300 }), tx(2, 2, 'DEPOSIT', '2026-01-01', 10, { fees: 1 })])).toBe(300);
    expect(repayOrInvest(0.04, 0.07)).toBe('invest');
    expect(repayOrInvest(0.08, 0.07)).toBe('repay');
    expect(repayOrInvest(0.068, 0.07)).toBe('even');
  });
});

describe('occurrences', () => {
  const loan = schedule({ id: 2, assetId: 2, type: 'WITHDRAW', amount: 800, day: 1, rate: 0.03, cashAssetId: 9 });

  it('starts each month of a loan from the balance left by the previous ones', () => {
    const occ = [
      { schedule: loan, view: mortgage, date: '2026-01-01' },
      { schedule: loan, view: mortgage, date: '2026-02-01' },
      { schedule: schedule(), view: world, date: '2026-01-05' },
    ];
    const drafts = draftOccurrences(occ, () => 104);
    expect(drafts[0]).toEqual({ amount: 800, price: null, interest: 300 });
    // 119 500 € left: 298.75 € of interest.
    expect(drafts[1].interest).toBe(298.75);
    expect(drafts[2]).toEqual({ amount: 200, price: 104, interest: null });
  });

  it('saves a loan payment as principal + interest (fees), the cash side as the whole payment', () => {
    const r = occurrenceRecords({ schedule: loan, view: mortgage, date: '2026-01-01' }, { amount: 800, price: null, interest: 300 }, 9);
    if (!('records' in r)) throw new Error(r.error);
    expect(r.records.main).toMatchObject({ assetId: 2, type: 'WITHDRAW', amount: 500, fees: 300 });
    expect(r.records.cash).toMatchObject({ assetId: 9, type: 'WITHDRAW', amount: 800 });
    expect(r.records.linked).toBe(false);
    // Only the principal lowers the loan.
    const balance = computePosition('balance', [...data.transactions.filter((t) => t.assetId === 2), { ...r.records.main, id: 99 }], []).value;
    expect(balance).toBe(119500);
    expect(occurrenceRecords({ schedule: loan, view: mortgage, date: '2026-01-01' }, { amount: 800, price: null, interest: 900 }, 9)).toEqual({
      error: 'The interest is more than the payment.',
    });
  });

  it('turns a monthly buy into a quantity at the price of the day, linked to its payment', () => {
    const r = occurrenceRecords({ schedule: schedule(), view: world, date: '2026-01-05' }, { amount: 200, price: 80, interest: null }, 9);
    if (!('records' in r)) throw new Error(r.error);
    expect(r.records.main).toMatchObject({ type: 'BUY', quantity: 2.5, unitPrice: 80, amount: 200 });
    expect(r.records.cash).toMatchObject({ type: 'WITHDRAW', amount: 200, note: expect.stringMatching(/^Buy 2[.,]5 × World$/) });
    expect(r.records.linked).toBe(true);
    expect(occurrenceRecords({ schedule: schedule(), view: world, date: '2026-01-05' }, { amount: 200, price: null, interest: null }, null)).toEqual({
      error: 'Enter the price.',
    });
  });
});

describe('schedule form', () => {
  const draft = { type: 'WITHDRAW' as const, amount: '1 250,5', day: 40, startDate: '2026-01-01', cashAssetId: null, rate: '3,5' };
  it('validates and normalizes', () => {
    expect(validateSchedule(draft, 2, true)).toEqual({
      input: { assetId: 2, type: 'WITHDRAW', amount: 1250.5, day: 31, startDate: '2026-01-01', cashAssetId: null, rate: 0.035 },
    });
    // The rate is for loans only, and optional.
    expect(validateSchedule({ ...draft, rate: '' }, 2, true)).toMatchObject({ input: { rate: null } });
    expect(validateSchedule(draft, 1, false)).toMatchObject({ input: { rate: null } });
    expect(validateSchedule({ ...draft, amount: '0', rate: '80' }, 2, true)).toEqual({
      errors: { amount: 'Enter an amount above 0.', rate: 'Enter a yearly rate between 0 and 50%.' },
    });
  });
});
