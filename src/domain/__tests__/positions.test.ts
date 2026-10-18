import { computePosition } from '../positions';
import type { PricePoint, Transaction, TxType } from '../types';

let nextId = 1;
const tx = (type: TxType, date: string, fields: Partial<Transaction> = {}): Transaction => {
  const quantity = fields.quantity ?? null;
  const unitPrice = fields.unitPrice ?? null;
  return {
    id: nextId++,
    assetId: 1,
    type,
    date,
    quantity,
    unitPrice,
    amount: fields.amount ?? (quantity ?? 0) * (unitPrice ?? 0),
    fees: fields.fees ?? 0,
    note: null,
    createdAt: fields.createdAt,
  };
};
const price = (date: string, value: number): PricePoint => ({ id: nextId++, assetId: 1, date, price: value, source: 'manual' });

describe('units assets', () => {
  it('computes average cost across several buys', () => {
    const p = computePosition(
      'units',
      [tx('BUY', '2024-01-01', { quantity: 10, unitPrice: 100 }), tx('BUY', '2024-02-01', { quantity: 10, unitPrice: 120 })],
      [],
    );
    expect(p.quantity).toBe(20);
    expect(p.invested).toBe(2200);
    expect(p.avgCost).toBe(110);
    expect(p.price).toBe(120);
    expect(p.value).toBe(2400);
  });

  it('uses the latest price update and computes the unrealized gain', () => {
    const p = computePosition(
      'units',
      [tx('BUY', '2024-01-01', { quantity: 10, unitPrice: 100 }), tx('BUY', '2024-02-01', { quantity: 10, unitPrice: 120 })],
      [price('2024-03-01', 130)],
    );
    expect(p.value).toBe(2600);
    expect(p.unrealized).toBe(400);
    expect(p.unrealizedPct).toBeCloseTo(400 / 2200);
  });

  it('a partial sell keeps the average cost and records the realized gain', () => {
    const p = computePosition(
      'units',
      [
        tx('BUY', '2024-01-01', { quantity: 10, unitPrice: 100 }),
        tx('BUY', '2024-02-01', { quantity: 10, unitPrice: 120 }),
        tx('SELL', '2024-04-01', { quantity: 5, unitPrice: 130 }),
      ],
      [price('2024-03-01', 130)],
    );
    expect(p.quantity).toBe(15);
    expect(p.avgCost).toBe(110);
    expect(p.invested).toBe(1650);
    expect(p.realized).toBe(5 * (130 - 110));
  });

  it('includes fees in the cost basis and in the realized gain', () => {
    const p = computePosition(
      'units',
      [
        tx('BUY', '2024-01-01', { quantity: 10, unitPrice: 100, fees: 10 }),
        tx('SELL', '2024-02-01', { quantity: 10, unitPrice: 110, fees: 5 }),
      ],
      [],
    );
    expect(p.quantity).toBe(0);
    expect(p.invested).toBe(0);
    expect(p.realized).toBe(1100 - 5 - 1010);
  });

  it('never sells more than is held', () => {
    const p = computePosition(
      'units',
      [tx('BUY', '2024-01-01', { quantity: 2, unitPrice: 50 }), tx('SELL', '2024-01-02', { quantity: 5, unitPrice: 60 })],
      [],
    );
    expect(p.quantity).toBe(0);
    expect(p.realized).toBe(2 * 10);
  });

  it('replays events by date, whatever the insertion order', () => {
    const p = computePosition(
      'units',
      [tx('SELL', '2024-05-01', { quantity: 1, unitPrice: 200 }), tx('BUY', '2024-01-01', { quantity: 2, unitPrice: 100 })],
      [],
    );
    expect(p.quantity).toBe(1);
    expect(p.realized).toBe(100);
  });

  it('a price update on the same day as a trade wins', () => {
    const p = computePosition('units', [tx('BUY', '2024-01-01', { quantity: 1, unitPrice: 100 })], [price('2024-01-01', 105)]);
    expect(p.price).toBe(105);
  });

  it('records dividends as income without touching the cost basis', () => {
    const p = computePosition(
      'units',
      [tx('BUY', '2024-01-01', { quantity: 1, unitPrice: 100 }), tx('INCOME', '2024-06-01', { amount: 3 })],
      [],
    );
    expect(p.income).toBe(3);
    expect(p.invested).toBe(100);
  });
});

describe('balance assets', () => {
  it('value follows deposits until a valuation is entered', () => {
    const p = computePosition('balance', [tx('DEPOSIT', '2024-01-01', { amount: 1000 })], []);
    expect(p.value).toBe(1000);
    expect(p.invested).toBe(1000);
  });

  it('deposits after the last valuation are added to it', () => {
    const p = computePosition(
      'balance',
      [tx('DEPOSIT', '2024-01-01', { amount: 1000 }), tx('DEPOSIT', '2024-03-01', { amount: 500 })],
      [price('2024-02-01', 1100)],
    );
    expect(p.value).toBe(1600);
    expect(p.invested).toBe(1500);
    expect(p.unrealized).toBe(100);
  });

  it('a withdrawal removes a proportional share of the cost basis', () => {
    const p = computePosition(
      'balance',
      [tx('DEPOSIT', '2024-01-01', { amount: 1000 }), tx('WITHDRAW', '2024-03-01', { amount: 600 })],
      [price('2024-02-01', 1200)],
    );
    expect(p.value).toBe(600);
    expect(p.invested).toBe(500);
    expect(p.realized).toBe(100);
  });

  it('interest increases value and income', () => {
    const p = computePosition(
      'balance',
      [tx('DEPOSIT', '2024-01-01', { amount: 1000 }), tx('INCOME', '2024-12-31', { amount: 30 })],
      [],
    );
    expect(p.value).toBe(1030);
    expect(p.income).toBe(30);
    expect(p.invested).toBe(1000);
  });
});

describe('same-day order: the time each entry was saved', () => {
  const buy = (at: string | null) =>
    tx('BUY', '2026-10-11', { quantity: 1, unitPrice: 105, amount: 105, createdAt: at });
  const update = (at: string | null): PricePoint => ({ ...price('2026-10-11', 100), createdAt: at });

  it('the latest entry of the day sets the price', () => {
    // Buy at 105, then a price update to 100 five minutes later: 100.
    expect(computePosition('units', [buy('2026-10-11 09:00:00')], [update('2026-10-11 09:05:00')]).price).toBe(100);
    // Price update first, buy later: the buy's price, 105.
    expect(computePosition('units', [buy('2026-10-11 09:05:00')], [update('2026-10-11 09:00:00')]).price).toBe(105);
  });

  it('prices saved before save times existed count as end of day', () => {
    expect(computePosition('units', [buy('2026-10-11 09:05:00')], [update(null)]).price).toBe(100);
  });
});
