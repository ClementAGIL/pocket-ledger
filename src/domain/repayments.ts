import { fromISODate, toISODate } from './dates';
import type { ISODate } from './types';

/**
 * Monthly payment dates strictly after `after` and up to `upTo` (inclusive), on `day` of each
 * month — clamped to the month's last day (a 31st becomes the 30th in June, the 28th/29th in February).
 */
export function monthlyPaymentDates(after: ISODate, upTo: ISODate, day: number): ISODate[] {
  const dates: ISODate[] = [];
  const cursor = fromISODate(after);
  cursor.setDate(1);
  for (let guard = 0; guard < 1200; guard++) {
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const date = toISODate(new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(day, lastDay)));
    if (date > upTo) break;
    if (date > after) dates.push(date);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return dates;
}

export interface PlannedRepayment {
  date: ISODate;
  amount: number;
}

/**
 * Repayments that bring a loan from `lastBalance` (known on `after`) to `newBalance` on `upTo`:
 * - monthly (`day` given): the principal repaid is split equally over the payment dates; cents
 *   rounding goes on the last one so the final balance is exact. No payment date in the range
 *   → a single repayment on `upTo`.
 * - otherwise: one repayment of the difference on `upTo`.
 */
export function planRepayments(
  lastBalance: number,
  newBalance: number,
  after: ISODate,
  upTo: ISODate,
  day: number | null,
): PlannedRepayment[] {
  const totalCents = Math.round((lastBalance - newBalance) * 100);
  if (totalCents <= 0) return [];
  const dates = day === null ? [] : monthlyPaymentDates(after, upTo, day);
  if (dates.length === 0) return [{ date: upTo, amount: totalCents / 100 }];
  const each = Math.floor(totalCents / dates.length);
  return dates.map((date, i) => ({
    date,
    amount: (i === dates.length - 1 ? totalCents - each * (dates.length - 1) : each) / 100,
  }));
}
