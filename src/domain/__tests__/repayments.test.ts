import { monthlyPaymentDates, planRepayments } from '../repayments';

describe('monthlyPaymentDates', () => {
  it('lists payment days strictly after the last update and up to the date', () => {
    expect(monthlyPaymentDates('2026-06-12', '2026-10-10', 10)).toEqual(['2026-07-10', '2026-08-10', '2026-09-10', '2026-10-10']);
    expect(monthlyPaymentDates('2026-06-10', '2026-10-09', 10)).toEqual(['2026-07-10', '2026-08-10', '2026-09-10']);
    expect(monthlyPaymentDates('2026-06-05', '2026-06-20', 10)).toEqual(['2026-06-10']);
  });

  it('clamps the day to the end of short months and crosses years', () => {
    expect(monthlyPaymentDates('2026-12-31', '2027-03-31', 31)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });
});

describe('planRepayments', () => {
  it("matches the user's example: 200 000 → 196 000 over 4 months on the 10th", () => {
    expect(planRepayments(200000, 196000, '2026-06-12', '2026-10-10', 10)).toEqual([
      { date: '2026-07-10', amount: 1000 },
      { date: '2026-08-10', amount: 1000 },
      { date: '2026-09-10', amount: 1000 },
      { date: '2026-10-10', amount: 1000 },
    ]);
  });

  it('puts the cents rounding on the last payment so the total is exact', () => {
    const plan = planRepayments(1000, 0, '2026-01-15', '2026-04-20', 1);
    expect(plan.map((p) => p.amount)).toEqual([333.33, 333.33, 333.34]);
    expect(plan.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(1000, 10);
  });

  it('one repayment when not monthly, or when no payment day falls in the range', () => {
    expect(planRepayments(5000, 4200, '2026-06-01', '2026-06-20', null)).toEqual([{ date: '2026-06-20', amount: 800 }]);
    expect(planRepayments(5000, 4200, '2026-06-11', '2026-06-20', 10)).toEqual([{ date: '2026-06-20', amount: 800 }]);
  });

  it('nothing to repay when the balance did not go down', () => {
    expect(planRepayments(5000, 5000, '2026-01-01', '2026-06-01', 10)).toEqual([]);
    expect(planRepayments(5000, 6000, '2026-01-01', '2026-06-01', 10)).toEqual([]);
  });
});
