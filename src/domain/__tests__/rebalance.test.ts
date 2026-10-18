import { planRebalance, type RebalanceInput } from '../rebalance';

const cat = (categoryId: number, name: string, value: number, target: number | null): RebalanceInput => ({
  categoryId,
  name,
  color: '#000',
  value,
  target,
});

// 10 000 € included: ETF 6 000 (60%), Cash 3 000 (30%), Crypto 1 000 (10%). Real estate excluded.
const inputs = [cat(1, 'ETF', 6000, 0.7), cat(2, 'Cash', 3000, 0.2), cat(3, 'Crypto', 1000, 0.1), cat(4, 'Real estate', 250000, null)];
const byName = (plan: ReturnType<typeof planRebalance>) => Object.fromEntries(plan.rows.map((r) => [r.name, r.action]));

describe('planRebalance', () => {
  it('excludes categories without target and checks the targets add up to 100%', () => {
    const plan = planRebalance(inputs, 0, 'full');
    expect(plan.total).toBe(10000);
    expect(plan.excluded.map((e) => e.name)).toEqual(['Real estate']);
    expect(plan.valid).toBe(true);
    expect(plan.rows.find((r) => r.name === 'ETF')!.currentWeight).toBeCloseTo(0.6);
    expect(plan.rows.find((r) => r.name === 'Cash')!.drift).toBeCloseTo(0.1);

    const invalid = planRebalance([cat(1, 'ETF', 100, 0.5), cat(2, 'Cash', 100, 0.4)], 0, 'full');
    expect(invalid.valid).toBe(false);
    expect(invalid.rows.every((r) => r.action === 0)).toBe(true);
  });

  it('full rebalance: buys and sells to reach the targets exactly', () => {
    expect(byName(planRebalance(inputs, 0, 'full'))).toEqual({ ETF: 1000, Cash: -1000, Crypto: 0 });
    // With 2 000 € more: total 12 000 → ETF 8 400, Cash 2 400, Crypto 1 200.
    expect(byName(planRebalance(inputs, 2000, 'full'))).toEqual({ ETF: 2400, Cash: -600, Crypto: 200 });
  });

  it('buy only, small amount: split over the categories below target, never sells', () => {
    // Total 10 500 → deficits ETF 1 350, Crypto 50 (Cash is over target). 500 € split 1350:50.
    const actions = byName(planRebalance(inputs, 500, 'buy-only'));
    expect(actions.Cash).toBe(0);
    expect(actions.ETF + actions.Crypto).toBeCloseTo(500, 10);
    expect(actions.ETF).toBeCloseTo((500 * 1350) / 1400, 2);
  });

  it('buy only, large amount: fills every deficit then follows the targets', () => {
    // Total 20 000 → deficits ETF 8 000, Cash 1 000, Crypto 1 000 = 10 000 = the money.
    expect(byName(planRebalance(inputs, 10000, 'buy-only'))).toEqual({ ETF: 8000, Cash: 1000, Crypto: 1000 });
  });

  it('keeps the exact total when rounding to cents', () => {
    const plan = planRebalance([cat(1, 'A', 0, 1 / 3), cat(2, 'B', 0, 1 / 3), cat(3, 'C', 0, 1 / 3)], 100, 'buy-only');
    expect(plan.rows.reduce((s, r) => s + r.action, 0)).toBeCloseTo(100, 10);
    expect(plan.rows.map((r) => r.action).sort()).toEqual([33.33, 33.33, 33.34]);
  });

  it('puts the biggest buy first', () => {
    expect(planRebalance(inputs, 500, 'buy-only').rows[0].name).toBe('ETF');
  });
});
