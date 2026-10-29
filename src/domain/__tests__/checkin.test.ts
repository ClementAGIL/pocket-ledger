import { buildCheckIn, checkInDue, checkInRange, lastCompleteMonth, monthEnd, shiftMonth } from '../checkin';
import { buildPortfolio } from '../portfolio';
import type { Asset, Snapshot, Transaction } from '../types';

const asset = (id: number, name: string): Asset => ({
  id,
  accountId: 1,
  categoryId: 1,
  name,
  identifier: null,
  valuation: 'units',
  note: null,
  reviewDate: null,
  archived: false,
  createdAt: '',
});
const buy = (id: number, assetId: number, date: string, quantity: number, unitPrice: number): Transaction => ({
  id,
  assetId,
  type: 'BUY',
  date,
  quantity,
  unitPrice,
  amount: quantity * unitPrice,
  fees: 0,
  note: null,
  linkedId: null,
  createdAt: `${date} 10:00:00`,
});
const price = (id: number, assetId: number, date: string, p: number) => ({ id, assetId, date, price: p, source: 'manual' as const });

// Three ETFs bought in August; in September A gains 100, B loses 50, C doesn't move.
const data: Snapshot = {
  schedules: [],
  categories: [{ id: 1, name: 'ETF', kind: 'asset', valuation: 'units', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' }],
  accounts: [{ id: 1, name: 'Broker', institution: null, note: null, archived: false, createdAt: '' }],
  assets: [asset(1, 'A'), asset(2, 'B'), asset(3, 'C')],
  transactions: [buy(1, 1, '2026-08-10', 10, 100), buy(2, 2, '2026-08-10', 10, 100), buy(3, 3, '2026-08-10', 10, 100), buy(4, 1, '2026-09-15', 1, 100)],
  prices: [price(1, 1, '2026-09-30', 110), price(2, 2, '2026-09-30', 95), price(3, 1, '2026-10-20', 200)],
};

describe('check-in months', () => {
  it('finds the month end, the last complete month and the range', () => {
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(monthEnd('2024-02')).toBe('2024-02-29');
    expect(monthEnd('2026-12')).toBe('2026-12-31');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(lastCompleteMonth('2026-10-29')).toBe('2026-09');
    expect(checkInRange(data, '2026-10-29')).toEqual({ first: '2026-08', last: '2026-10' });
  });
});

describe('buildCheckIn', () => {
  const portfolio = buildPortfolio(data);

  it('sums a past month: gain, money saved, movers both ways', () => {
    const c = buildCheckIn(portfolio, data, '2026-09', '2026-10-29');
    expect(c).toMatchObject({ start: '2026-09-01', end: '2026-09-30', partial: false });
    // Later prices (October) don't count: A = 11 × 110, B = 10 × 95, C = 10 × 100.
    expect(c.total.endValue).toBeCloseTo(1210 + 950 + 1000, 6);
    expect(c.total.gain).toBeCloseTo(110 - 50, 6);
    expect(c.savings.added).toBeCloseTo(100, 6);
    expect(c.gainers.map((m) => [m.view.asset.name, Math.round(m.perf.gain)])).toEqual([['A', 110]]);
    expect(c.losers.map((m) => [m.view.asset.name, Math.round(m.perf.gain)])).toEqual([['B', -50]]);
  });

  it('shows the current month so far', () => {
    const c = buildCheckIn(portfolio, data, '2026-10', '2026-10-29');
    expect(c).toMatchObject({ end: '2026-10-29', partial: true });
    expect(c.total.gain).toBeCloseTo(11 * 90, 6);
  });
});

describe('checkInDue', () => {
  const range = { first: '2026-01' };
  it('offers last month in the first days of the month, until seen', () => {
    expect(checkInDue(range, '', '2026-11-03')).toBe('2026-10');
    expect(checkInDue(range, '2026-09', '2026-11-10')).toBe('2026-10');
    expect(checkInDue(range, '2026-10', '2026-11-03')).toBeNull();
    expect(checkInDue(range, '', '2026-11-11')).toBeNull();
  });
  it('needs data before the current month', () => {
    expect(checkInDue(null, '', '2026-11-03')).toBeNull();
    expect(checkInDue({ first: '2026-11' }, '', '2026-11-03')).toBeNull();
  });
});
