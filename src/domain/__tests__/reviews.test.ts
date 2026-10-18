import { buildPortfolio } from '../portfolio';
import { isReviewDue, reviewsDue } from '../reviews';
import type { Asset, Snapshot } from '../types';

const asset = (id: number, reviewDate: string | null, archived = false): Asset => ({
  id,
  accountId: 1,
  categoryId: 1,
  name: `A${id}`,
  identifier: null,
  valuation: 'balance',
  note: null,
  reviewDate,
  archived,
  createdAt: '',
});

describe('reviews', () => {
  it('is due on the date and after, never when archived', () => {
    expect(isReviewDue(asset(1, '2024-06-10'), '2024-06-09')).toBe(false);
    expect(isReviewDue(asset(1, '2024-06-10'), '2024-06-10')).toBe(true);
    expect(isReviewDue(asset(1, '2024-01-01'), '2024-06-10')).toBe(true);
    expect(isReviewDue(asset(1, null), '2024-06-10')).toBe(false);
    expect(isReviewDue(asset(1, '2024-01-01', true), '2024-06-10')).toBe(false);
  });

  it('lists open investments with a due review, oldest first', () => {
    const data: Snapshot = {
      categories: [{ id: 1, name: 'Cash', kind: 'asset', valuation: 'balance', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' }],
      accounts: [{ id: 1, name: 'Bank', institution: null, note: null, archived: false, createdAt: '' }],
      assets: [asset(1, '2024-05-01'), asset(2, '2024-03-01'), asset(3, '2025-01-01'), asset(4, '2024-01-01')],
      transactions: [],
      // Asset 4 has no value: closed, so not listed.
      prices: [1, 2, 3].map((id) => ({ id, assetId: id, date: '2024-01-01', price: 100, source: 'manual' as const })),
    };
    const due = reviewsDue(buildPortfolio(data).byAssetId.values(), '2024-06-10');
    expect(due.map((v) => v.asset.id)).toEqual([2, 1]);
  });
});
