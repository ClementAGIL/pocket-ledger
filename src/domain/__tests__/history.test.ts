import { chartMarks } from '../history';
import type { Transaction, TxType } from '../types';

let nextId = 1;
const tx = (type: TxType, date: string, amount: number, quantity: number | null = null, assetId = 1): Transaction => ({
  id: nextId++,
  assetId,
  type,
  date,
  quantity,
  unitPrice: quantity ? amount / quantity : null,
  amount,
  fees: 0,
  note: null,
});

describe('chartMarks', () => {
  it('gives one mark per operation, oldest first, with its kind', () => {
    const marks = chartMarks([
      tx('SELL', '2024-03-01', 50, 1),
      tx('BUY', '2024-01-10', 200, 2),
      tx('INCOME', '2024-02-15', 4),
      tx('DEPOSIT', '2024-01-05', 100),
      tx('WITHDRAW', '2024-04-01', 30),
    ]);
    expect(marks.map((m) => [m.date, m.kind, m.type])).toEqual([
      ['2024-01-05', 'in', 'DEPOSIT'],
      ['2024-01-10', 'in', 'BUY'],
      ['2024-02-15', 'income', 'INCOME'],
      ['2024-03-01', 'out', 'SELL'],
      ['2024-04-01', 'out', 'WITHDRAW'],
    ]);
  });

  it('counts income net of fees and leaves charges out', () => {
    const fee = { ...tx('INCOME', '2024-01-10', 0), fees: 2.5 };
    const dividend = { ...tx('INCOME', '2024-01-10', 10), fees: 1.5 };
    expect(chartMarks([fee, dividend])).toEqual([{ date: '2024-01-10', kind: 'income', type: 'INCOME', amount: 8.5, quantity: null, count: 1 }]);
  });

  it('adds up the same type on the same day, even across investments', () => {
    const marks = chartMarks([tx('BUY', '2024-01-10', 200, 2, 1), tx('BUY', '2024-01-10', 330, 3.5, 2), tx('SELL', '2024-01-10', 90, 1)]);
    expect(marks).toEqual([
      { date: '2024-01-10', kind: 'in', type: 'BUY', amount: 530, quantity: 5.5, count: 2 },
      { date: '2024-01-10', kind: 'out', type: 'SELL', amount: 90, quantity: 1, count: 1 },
    ]);
  });

  it('keeps only the chart window', () => {
    const marks = chartMarks([tx('BUY', '2023-12-31', 10, 1), tx('BUY', '2024-01-01', 10, 1)], '2024-01-01');
    expect(marks.map((m) => m.date)).toEqual(['2024-01-01']);
  });

  it('keeps no quantity for cash operations', () => {
    expect(chartMarks([tx('INCOME', '2024-01-01', 3), tx('INCOME', '2024-01-01', 2)])[0]).toMatchObject({ amount: 5, quantity: null, count: 2 });
  });
});
