import { currentValues, MAX_CELEBRATED, milestones, newlyReached, periodValues, withCelebrated } from '../milestones';
import { performanceBetween } from '../performance';
import { buildPortfolio } from '../portfolio';
import { DEFAULT_PROJECTION } from '../projection';
import type { Asset, Snapshot, Transaction } from '../types';

const settings = (patch: Partial<typeof DEFAULT_PROJECTION>) => ({ ...DEFAULT_PROJECTION, ...patch });

describe('milestones', () => {
  it('lists the goal and the emergency fund that are set, keyed by their target', () => {
    expect(milestones(DEFAULT_PROJECTION)).toEqual([]);
    const list = milestones(settings({ goalAmount: 100_000, yearlySpending: 24_000, emergencyMonths: 6 }));
    expect(list.map((m) => [m.kind, m.key, m.target])).toEqual([
      ['goal', 'goal:amount:100000', 100_000],
      ['emergency', 'emergency:6:12000', 12_000],
    ]);
    // FIRE: 25 × the yearly spending.
    expect(milestones(settings({ goalMode: 'fire', yearlySpending: 24_000 }))[0]).toMatchObject({ key: 'goal:fire:600000', fire: true });
  });

  it('celebrates a milestone only when crossed, and only once per target', () => {
    const list = milestones(settings({ goalAmount: 100_000, yearlySpending: 24_000 }));
    const below = { assets: 99_000, cash: 11_000 };
    const above = { assets: 100_000, cash: 11_000 };
    expect(newlyReached(list, below, above).map((m) => m.kind)).toEqual(['goal']);
    // Already above before: nothing new.
    expect(newlyReached(list, above, { assets: 120_000, cash: 11_000 })).toEqual([]);
    // Already celebrated: not again after a dip.
    expect(newlyReached(list, below, above, ['goal:amount:100000'])).toEqual([]);
    // Both at once.
    expect(newlyReached(list, below, { assets: 100_000, cash: 12_000 }).map((m) => m.kind)).toEqual(['goal', 'emergency']);
  });

  it('keeps the latest celebrated keys, without duplicates', () => {
    const [goal] = milestones(settings({ goalAmount: 5 }));
    expect(withCelebrated(['a', goal.key], [goal])).toEqual(['a', goal.key]);
    const many = Array.from({ length: MAX_CELEBRATED }, (_, i) => `k${i}`);
    const next = withCelebrated(many, [goal]);
    expect(next).toHaveLength(MAX_CELEBRATED);
    expect(next.at(-1)).toBe(goal.key);
    expect(next[0]).toBe('k1');
  });

  it('measures assets and the Cash category at the start and end of a month', () => {
    const asset = (id: number, categoryId: number, valuation: 'units' | 'balance'): Asset => ({
      id,
      accountId: 1,
      categoryId,
      name: `A${id}`,
      identifier: null,
      valuation,
      note: null,
      reviewDate: null,
      archived: false,
      createdAt: '',
    });
    const tx = (id: number, assetId: number, type: Transaction['type'], date: string, amount: number, quantity: number | null = null): Transaction => ({
      id,
      assetId,
      type,
      date,
      quantity,
      unitPrice: quantity ? amount / quantity : null,
      amount,
      fees: 0,
      note: null,
      linkedId: null,
      createdAt: `${date} 10:00:00`,
    });
    const category = (id: number, name: string, valuation: 'units' | 'balance') => ({
      id,
      name,
      kind: 'asset' as const,
      valuation,
      color: '#000',
      sortOrder: id,
      isDefault: false,
      targetWeight: null,
      updateReminder: 'monthly' as const,
    });
    const data: Snapshot = {
      schedules: [],
      categories: [category(1, 'Cash', 'balance'), category(2, 'ETF', 'units')],
      accounts: [{ id: 1, name: 'Bank', institution: null, note: null, archived: false, createdAt: '' }],
      assets: [asset(1, 1, 'balance'), asset(2, 2, 'units')],
      transactions: [tx(1, 1, 'DEPOSIT', '2026-08-05', 5000), tx(2, 2, 'BUY', '2026-08-05', 1000, 10), tx(3, 1, 'DEPOSIT', '2026-09-20', 2000)],
      prices: [],
    };
    const portfolio = buildPortfolio(data);
    const { start, end } = periodValues(portfolio, performanceBetween(portfolio, '2026-09-01', '2026-09-30'));
    expect(start).toEqual({ assets: 6000, cash: 5000 });
    expect(end).toEqual({ assets: 8000, cash: 7000 });
    expect(currentValues(portfolio)).toEqual({ assets: 8000, cash: 7000 });
    // A 6-month fund of 1 000 €/month: completed in September.
    const list = milestones(settings({ yearlySpending: 12_000, emergencyMonths: 6 }));
    expect(newlyReached(list, start, end).map((m) => m.kind)).toEqual(['emergency']);
  });
});
