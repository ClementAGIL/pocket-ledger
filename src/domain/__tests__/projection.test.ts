import {
  chartProjectionMonths,
  DEFAULT_PROJECTION,
  doublingYears,
  fireTarget,
  goalOf,
  inflationOf,
  missingSetup,
  monthsToReach,
  nominalPlan,
  parseProjectionSettings,
  project,
  projectMonths,
  rateOf,
  realRate,
  savingPace,
} from '../projection';
import type { Snapshot, Transaction } from '../types';

describe('project', () => {
  it('compounds the yearly rate and adds the saving', () => {
    const points = project({ start: 1000, yearlySaving: 0, rate: 0.05 }, 2);
    expect(points.map((p) => p.month)).toEqual([0, 12, 24]);
    expect(points[1].value).toBeCloseTo(1050, 6);
    expect(points[2].value).toBeCloseTo(1102.5, 6);
    expect(points[2].contributed).toBe(1000);

    // No growth: the value is exactly what was put in.
    const flat = project({ start: 1000, yearlySaving: 1200, rate: 0 }, 3);
    expect(flat[3].value).toBeCloseTo(4600, 6);
    expect(flat[3].contributed).toBeCloseTo(4600, 6);
  });

  it('saves monthly: growth on savings is less than a full year of it', () => {
    const [, year1] = project({ start: 0, yearlySaving: 12000, rate: 0.1 }, 1);
    expect(year1.value).toBeGreaterThan(12000);
    expect(year1.value).toBeLessThan(12000 * 1.1);
    expect(year1.contributed).toBeCloseTo(12000, 6);
  });

  it('never goes below zero when withdrawing', () => {
    const points = project({ start: 1000, yearlySaving: -6000, rate: 0.05 }, 2);
    expect(points[2].value).toBe(0);
    expect(points[2].contributed).toBe(0);
  });
});

describe('monthsToReach', () => {
  it('finds the month the goal is reached', () => {
    // 1000 at 5%/yr doubles in ~14.2 years (171 months).
    expect(monthsToReach(2000, { start: 1000, yearlySaving: 0, rate: 0.05 })).toBe(171);
    expect(monthsToReach(1200, { start: 0, yearlySaving: 1200, rate: 0 })).toBe(12);
  });

  it('is 0 when already reached and null when never reached', () => {
    expect(monthsToReach(500, { start: 1000, yearlySaving: 0, rate: 0 })).toBe(0);
    expect(monthsToReach(2000, { start: 1000, yearlySaving: 0, rate: 0 })).toBeNull();
    expect(monthsToReach(2000, { start: 1000, yearlySaving: 0, rate: -0.02 })).toBeNull();
  });
});

describe('goals and settings', () => {
  it('FIRE target is 25× the yearly spending', () => {
    expect(fireTarget(30000)).toBeCloseTo(750000, 6);
    expect(goalOf({ ...DEFAULT_PROJECTION, goalMode: 'fire', yearlySpending: 30000 })).toBeCloseTo(750000, 6);
    expect(goalOf({ ...DEFAULT_PROJECTION, goalAmount: 500000 })).toBe(500000);
    expect(goalOf(DEFAULT_PROJECTION)).toBeNull();
  });

  it('resolves the rate choice', () => {
    expect(rateOf({ ...DEFAULT_PROJECTION, rate: 'mine' }, 0.063)).toBe(0.063);
    expect(rateOf({ ...DEFAULT_PROJECTION, rate: 'mine' }, null)).toBe(0.07);
    expect(rateOf({ ...DEFAULT_PROJECTION, rate: '4' }, 0.063)).toBe(0.04);
    expect(rateOf({ ...DEFAULT_PROJECTION, rate: 'custom', customRate: 0.055 }, null)).toBe(0.055);
  });

  it('removes inflation to get the real rate', () => {
    expect(realRate(0.07, 0.02)).toBeCloseTo(0.04902, 5);
    expect(realRate(0.05, 0)).toBeCloseTo(0.05, 12);
    expect(inflationOf(DEFAULT_PROJECTION)).toBe(0.02);
    expect(inflationOf({ ...DEFAULT_PROJECTION, inflation: 'off' })).toBe(0);
    expect(inflationOf({ ...DEFAULT_PROJECTION, inflation: 'custom', customInflation: 0.035 })).toBe(0.035);
    // Today's euros: 1 000 at 7% with 2% inflation buys after 10 years what 1 615 € buys today.
    const [, ...years] = project({ start: 1000, yearlySaving: 0, rate: realRate(0.07, 0.02) }, 10);
    expect(years[9].value).toBeCloseTo((1000 * 1.07 ** 10) / 1.02 ** 10, 6);
  });

  it('parses saved settings tolerantly', () => {
    expect(parseProjectionSettings(undefined)).toEqual(DEFAULT_PROJECTION);
    expect(parseProjectionSettings('not json')).toEqual(DEFAULT_PROJECTION);
    const s = parseProjectionSettings(JSON.stringify({ rate: '10', goalAmount: 500000, years: 30, customRate: 3, saving: 'x' }));
    expect(s).toMatchObject({ rate: '10', goalAmount: 500000, years: 30, customRate: 0.5, saving: 'mine' });
    expect(parseProjectionSettings(JSON.stringify({ rate: 'bad', years: 15 }))).toMatchObject({ rate: 'mine', years: 20 });
    // Saved before inflation existed: today's euros at 2% by default.
    expect(parseProjectionSettings(JSON.stringify({ rate: '7' }))).toMatchObject({ inflation: '2' });
    expect(parseProjectionSettings(JSON.stringify({ inflation: 'custom', customInflation: 0.9 }))).toMatchObject({ customInflation: 0.2 });
  });
});

describe('savingPace', () => {
  let id = 1;
  const tx = (assetId: number, type: Transaction['type'], date: string, amount: number): Transaction => ({
    id: id++,
    assetId,
    type,
    date,
    quantity: null,
    unitPrice: null,
    amount,
    fees: 0,
    note: null,
  });
  const base: Omit<Snapshot, 'transactions'> = {
    schedules: [],
    categories: [
      { id: 1, name: 'Cash', kind: 'asset', valuation: 'balance', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
      { id: 2, name: 'Loan', kind: 'liability', valuation: 'balance', color: '#000', sortOrder: 1, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    ],
    accounts: [{ id: 1, name: 'Bank', institution: null, note: null, archived: false, createdAt: '' }],
    assets: [1, 2].map((n) => ({
      id: n,
      accountId: 1,
      categoryId: n,
      name: `A${n}`,
      identifier: null,
      valuation: 'balance' as const,
      note: null,
      reviewDate: null,
      archived: false,
      createdAt: '',
    })),
    prices: [],
  };

  it('averages the last 12 complete months, without exceptional ones and loans', () => {
    const transactions = [
      // Existing savings entered on the first day: exceptional, left out.
      tx(1, 'DEPOSIT', '2023-12-03', 50000),
      ...Array.from({ length: 11 }, (_, i) => tx(1, 'DEPOSIT', `2024-${String(i + 1).padStart(2, '0')}-05`, 1000)),
      // Loan payments don't count.
      tx(2, 'WITHDRAW', '2024-06-10', 800),
      // Current month: incomplete, not counted.
      tx(1, 'DEPOSIT', '2024-12-02', 9000),
    ];
    const pace = savingPace({ ...base, transactions }, '2024-12-15');
    expect(pace.excluded).toBe(1);
    expect(pace.months).toBe(11);
    expect(pace.yearly).toBeCloseTo(12000, 6);
  });

  it('uses the history there is when shorter than a year', () => {
    const pace = savingPace({ ...base, transactions: [tx(1, 'DEPOSIT', '2024-10-05', 600), tx(1, 'DEPOSIT', '2024-11-05', 400)] }, '2024-12-15');
    expect(pace.months).toBe(2);
    expect(pace.yearly).toBeCloseTo(6000, 6);
    expect(savingPace({ ...base, transactions: [] }, '2024-12-15')).toEqual({ yearly: 0, months: 0, excluded: 0 });
    // Started this month: the current month is used.
    expect(savingPace({ ...base, transactions: [tx(1, 'DEPOSIT', '2024-12-01', 500)] }, '2024-12-15').yearly).toBeCloseTo(6000, 6);
  });
});

describe('missingSetup', () => {
  it('offers both steps on a fresh install', () => {
    expect(missingSetup(DEFAULT_PROJECTION)).toEqual(['goal', 'emergency']);
  });

  it('a goal amount leaves the emergency fund to set', () => {
    expect(missingSetup({ ...DEFAULT_PROJECTION, goalMode: 'amount', goalAmount: 300000, yearlySpending: 0 })).toEqual(['emergency']);
  });

  it('expenses set the fund up; with FIRE they are the goal too', () => {
    expect(missingSetup({ ...DEFAULT_PROJECTION, goalMode: 'amount', goalAmount: 0, yearlySpending: 30000 })).toEqual(['goal']);
    expect(missingSetup({ ...DEFAULT_PROJECTION, goalMode: 'fire', yearlySpending: 30000 })).toEqual([]);
  });
});

describe('projectMonths', () => {
  it('gives one point per month and ends where the yearly projection does', () => {
    const plan = { start: 1000, yearlySaving: 1200, rate: 0.06 };
    const months = projectMonths(plan, 24);
    expect(months.map((p) => p.month)).toEqual(Array.from({ length: 25 }, (_, i) => i));
    expect(months[24].value).toBeCloseTo(project(plan, 2)[2].value, 9);
    expect(months[1].contributed).toBeCloseTo(1100, 9);
  });

  it('is only today for 0 months', () => {
    expect(projectMonths({ start: 500, yearlySaving: 0, rate: 0.05 }, 0)).toEqual([{ month: 0, value: 500, contributed: 500 }]);
  });
});

describe('chartProjectionMonths', () => {
  it('projects as long as the period shown', () => {
    expect(chartProjectionMonths('MTD', '2020-01-01', '2026-10-29')).toBe(1);
    expect(chartProjectionMonths('YTD', '2020-01-01', '2026-10-29')).toBe(12);
    expect(chartProjectionMonths('12M', '2020-01-01', '2026-10-29')).toBe(12);
    // ALL: the length of the history, 6 years here.
    expect(chartProjectionMonths('ALL', '2020-10-29', '2026-10-29')).toBe(72);
  });

  it('projects at least a month, at most MAX_YEARS', () => {
    expect(chartProjectionMonths('ALL', '2026-10-28', '2026-10-29')).toBe(1);
    expect(chartProjectionMonths('ALL', '1900-01-01', '2026-10-29')).toBe(1200);
    expect(chartProjectionMonths('ALL', null, '2026-10-29')).toBe(12);
  });
});

describe('nominalPlan', () => {
  it('uses the Goals rate and saving, without inflation', () => {
    const s = { ...DEFAULT_PROJECTION, inflation: '3' as const };
    expect(nominalPlan(s, 1000, 0.08, 6000)).toEqual({ start: 1000, yearlySaving: 6000, rate: 0.08 });
    // No annualized return yet: 7%, like Goals.
    expect(nominalPlan(s, 1000, null, 6000).rate).toBe(0.07);
    expect(nominalPlan({ ...s, rate: '4', saving: 'custom', customSaving: -1200 }, 1000, 0.08, 6000)).toEqual({
      start: 1000,
      yearlySaving: -1200,
      rate: 0.04,
    });
  });
});

describe('doublingYears', () => {
  it('is the time for money to double at the rate', () => {
    expect(doublingYears(0.074)).toBeCloseTo(9.71, 2);
    expect(doublingYears(1)).toBeCloseTo(1, 9);
    expect(doublingYears(0)).toBeNull();
    expect(doublingYears(-0.02)).toBeNull();
  });
});
