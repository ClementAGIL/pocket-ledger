import type { ISODate } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): ISODate {
  return toISODate(new Date());
}

/** Parses 'YYYY-MM-DD' as a local date (not UTC). */
export function fromISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(fromISODate(s)) === s;
}

/** Calendar month arithmetic, clamped to the end of the month (31 Jan + 1 month = 29 Feb). */
export function addMonths(date: ISODate, months: number): ISODate {
  const d = fromISODate(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toISODate(d);
}

/** Days since epoch, used as a numeric x-axis. */
export function dayNumber(date: ISODate): number {
  // Arithmetic "days from civil" (H. Hinnant). Digits are read from char codes: no Date object
  // and no substring, because this runs on every operation (100k+) for charts and performance.
  const digit = (i: number) => date.charCodeAt(i) - 48;
  let y = digit(0) * 1000 + digit(1) * 100 + digit(2) * 10 + digit(3);
  const m = digit(5) * 10 + digit(6);
  const d = digit(8) * 10 + digit(9);
  if (m <= 2) y -= 1;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
