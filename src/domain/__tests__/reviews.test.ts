import { buildPortfolio } from '../portfolio';
import { bigLoss, isReviewDue, reviewReason, reviewsDue } from '../reviews';
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
      schedules: [],
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

  describe('big losses', () => {
    // Units bought at 100: asset 1 now 70 (−30%), asset 2 at 80 (−20%), asset 3 at 50 (−50%).
    const units = (id: number, reviewDate: string | null): Asset => ({ ...asset(id, reviewDate), valuation: 'units' });
    const data = (reviewDates: (string | null)[]): Snapshot => ({
      schedules: [],
      categories: [{ id: 1, name: 'Stocks', kind: 'asset', valuation: 'units', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' }],
      accounts: [{ id: 1, name: 'Broker', institution: null, note: null, archived: false, createdAt: '' }],
      assets: reviewDates.map((d, i) => units(i + 1, d)),
      transactions: reviewDates.map((_, i) => ({
        id: i + 1,
        assetId: i + 1,
        type: 'BUY' as const,
        date: '2024-01-01',
        quantity: 10,
        unitPrice: 100,
        amount: 1000,
        fees: 0,
        note: null,
        linkedId: null,
        createdAt: '2024-01-01 10:00:00',
      })),
      prices: [70, 80, 50].slice(0, reviewDates.length).map((price, i) => ({ id: i + 1, assetId: i + 1, date: '2024-05-01', price, source: 'manual' as const })),
    });

    it('flags an open investment down 25% or more vs its cost', () => {
      const views = [...buildPortfolio(data([null, null, null])).byAssetId.values()];
      expect(views.map(bigLoss)).toEqual([expect.closeTo(-0.3, 9), null, expect.closeTo(-0.5, 9)]);
    });

    it('lists big losses first, largest first, until a later review is planned', () => {
      const today = '2024-06-10';
      const views = [...buildPortfolio(data([null, '2024-06-01', null])).byAssetId.values()];
      expect(reviewsDue(views, today).map((v) => v.asset.id)).toEqual([3, 1, 2]);
      expect(reviewReason(views[1], today)).toBe('date');

      // "Look again in 3 months" on asset 1: silenced until then; due again on that date.
      const later = [...buildPortfolio(data(['2024-09-10', null, null])).byAssetId.values()];
      expect(reviewReason(later[0], today)).toBeNull();
      expect(reviewReason(later[0], '2024-09-10')).toBe('date');
    });
  });
});
