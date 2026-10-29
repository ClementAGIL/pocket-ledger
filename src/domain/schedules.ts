import { fromISODate, toISODate } from './dates';
import { formatNumber, parseNumber } from './format';
import type { AssetView } from './portfolio';
import type { PositionState } from './positions';
import { monthlyPaymentDates } from './repayments';
import type { ISODate, NewTransaction, Schedule } from './types';

/*
 * Scheduled operations: a monthly buy, deposit, withdrawal or loan payment that the app proposes
 * when due (Home reminder → review screen) and the user confirms, adjusts or skips. Nothing is
 * saved on its own; missed months pile up until reviewed.
 *
 * Loans with a rate: each payment = interest (balance × rate / 12, saved as the repayment's fees)
 * + principal (the rest, which is what lowers the balance).
 */

/** At most this many occurrences of one schedule are proposed at once (10 years of months). */
const MAX_DUE = 120;

const cents = (n: number) => Math.round(n * 100);
const euros = (c: number) => c / 100;

function dayBefore(date: ISODate): ISODate {
  const d = fromISODate(date);
  d.setDate(d.getDate() - 1);
  return toISODate(d);
}

/** Occurrences not done yet, up to `today` (inclusive), oldest first. */
export function dueDates(s: Schedule, today: ISODate): ISODate[] {
  const after = s.doneUntil ?? dayBefore(s.startDate);
  return monthlyPaymentDates(after, today, s.day).slice(-MAX_DUE);
}

/** The next occurrence after `today` (or after the last one done, if later). */
export function nextDate(s: Schedule, today: ISODate): ISODate {
  const after = [s.doneUntil ?? dayBefore(s.startDate), today].reduce((a, b) => (a > b ? a : b));
  const [y, m] = after.split('-').map(Number);
  const horizon = toISODate(new Date(y, m + 1, 28));
  return monthlyPaymentDates(after, horizon, s.day)[0];
}

export interface Occurrence {
  schedule: Schedule;
  view: AssetView;
  date: ISODate;
}

/** Everything due, by date then investment name. Schedules of archived or closed-and-gone investments are left out. */
export function dueOccurrences(schedules: Schedule[], views: Map<number, AssetView>, today: ISODate): Occurrence[] {
  const list: Occurrence[] = [];
  for (const s of schedules) {
    const view = views.get(s.assetId);
    if (!view || view.asset.archived) continue;
    for (const date of dueDates(s, today)) list.push({ schedule: s, view, date });
  }
  return list.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.view.asset.name.localeCompare(b.view.asset.name)));
}

// ——— Loans ———

/** One month of interest on a balance at a yearly rate (nominal: rate / 12), to the cent. */
export const monthlyInterest = (balance: number, rate: number) => euros(Math.max(0, Math.round(cents(balance) * (rate / 12))));

/** A payment split into interest and principal; the principal never exceeds the balance. */
export function loanSplit(balance: number, rate: number, payment: number): { interest: number; principal: number } {
  const interest = Math.min(monthlyInterest(balance, rate), Math.max(payment, 0));
  const principal = euros(Math.min(Math.max(cents(payment) - cents(interest), 0), Math.max(cents(balance), 0)));
  return { interest, principal };
}

export interface Payoff {
  /** Payments left, the last one included. */
  payments: number;
  /** Date of the last payment. */
  date: ISODate;
  /** Interest still to pay until then. */
  interest: number;
}

/**
 * When the loan is paid off by the schedule's payment, from `balance` after the last payment done
 * (`after`). Null when the payment doesn't cover the interest (the loan would never end) or it
 * takes more than 100 years.
 */
export function loanPayoff(balance: number, rate: number, payment: number, day: number, after: ISODate): Payoff | null {
  let left = cents(balance);
  if (left <= 0) return { payments: 0, date: after, interest: 0 };
  const [y, m] = after.split('-').map(Number);
  const dates = monthlyPaymentDates(after, toISODate(new Date(y + 100, m, 0)), day);
  let interest = 0;
  for (const [i, date] of dates.entries()) {
    const split = loanSplit(euros(left), rate, payment);
    if (split.principal <= 0) return null;
    interest += cents(split.interest);
    left -= cents(split.principal);
    if (left <= 0) return { payments: i + 1, date, interest: euros(interest) };
  }
  return null;
}

/** Interest paid so far on a loan: the fees of its repayments. */
export const interestPaid = (txs: { type: string; fees: number }[]) =>
  euros(txs.reduce((s, t) => s + (t.type === 'WITHDRAW' ? cents(t.fees) : 0), 0));

export type RepayAdvice = 'repay' | 'invest' | 'even';

/**
 * Repaying early saves the loan rate for sure; investing earns `investRate` on average, with ups
 * and downs. Within half a point of each other it's a draw.
 */
export function repayOrInvest(loanRate: number, investRate: number): RepayAdvice {
  if (loanRate > investRate + 0.005) return 'repay';
  if (investRate > loanRate + 0.005) return 'invest';
  return 'even';
}

/** Balance (value) of an asset at the end of `date`, from its replay steps. */
export function valueAt(steps: PositionState[], date: ISODate): number {
  let value = 0;
  for (const s of steps) {
    if (s.lastDate! > date) break;
    value = s.value;
  }
  return value;
}

// ——— Review screen: the operation of one occurrence ———

/** What the review screen shows for an occurrence, adjustable before saving. */
export interface OccurrenceDraft {
  amount: number;
  /** BUY: the unit price used (quantity = amount / price). */
  price: number | null;
  /** Loan with a rate: the interest part of the payment. */
  interest: number | null;
}

/**
 * Starting values of the due occurrences (in date order). Several months of the same loan follow
 * each other: each one starts from the balance left by the previous ones.
 */
export function draftOccurrences(occurrences: Occurrence[], lastPrice: (assetId: number) => number | null): OccurrenceDraft[] {
  const repaidBefore = new Map<number, number>();
  return occurrences.map(({ schedule: s, view, date }) => {
    if (s.type === 'BUY') return { amount: s.amount, price: lastPrice(s.assetId), interest: null };
    if (!view.isLiability || s.rate === null) return { amount: s.amount, price: null, interest: null };
    const already = repaidBefore.get(s.id) ?? 0;
    const { interest, principal } = loanSplit(valueAt(view.steps, date) - already, s.rate, s.amount);
    repaidBefore.set(s.id, already + principal);
    return { amount: s.amount, price: null, interest };
  });
}

export interface OccurrenceRecords {
  /** The operation on the investment itself. */
  main: NewTransaction;
  /** The cash side (paid from / into), not tracked when null. */
  cash: NewTransaction | null;
  /** A buy and its payment are linked like in the Add form (they net to 0); deposits, withdrawals and loan payments aren't. */
  linked: boolean;
}

/** The rows an occurrence saves, or the error to show. */
export function occurrenceRecords(o: Occurrence, d: OccurrenceDraft, cashAssetId: number | null): { records: OccurrenceRecords } | { error: string } {
  const { schedule: s, view, date } = o;
  const name = view.asset.name;
  if (!(d.amount > 0)) return { error: 'Enter an amount.' };
  const base = { assetId: s.assetId, date, quantity: null, unitPrice: null, fees: 0, note: null };
  const cashTx = (type: 'DEPOSIT' | 'WITHDRAW', amount: number, note: string): NewTransaction | null =>
    cashAssetId === null ? null : { ...base, assetId: cashAssetId, type, amount, note };

  if (s.type === 'BUY') {
    if (!(d.price !== null && d.price > 0)) return { error: 'Enter the price.' };
    const quantity = d.amount / d.price;
    const main: NewTransaction = { ...base, type: 'BUY', quantity, unitPrice: d.price, amount: d.amount };
    return { records: { main, cash: cashTx('WITHDRAW', d.amount, `Buy ${formatNumber(quantity)} × ${name}`), linked: true } };
  }
  if (s.type === 'DEPOSIT') {
    return { records: { main: { ...base, type: 'DEPOSIT', amount: d.amount }, cash: cashTx('WITHDRAW', d.amount, `Put into ${name}`), linked: false } };
  }
  if (!view.isLiability) {
    return { records: { main: { ...base, type: 'WITHDRAW', amount: d.amount }, cash: cashTx('DEPOSIT', d.amount, `Taken out of ${name}`), linked: false } };
  }
  // Loan payment: the principal lowers the balance, the interest is its fees.
  const interest = d.interest ?? 0;
  if (interest < 0) return { error: 'The interest can’t be negative.' };
  if (cents(interest) > cents(d.amount)) return { error: 'The interest is more than the payment.' };
  const main: NewTransaction = { ...base, type: 'WITHDRAW', amount: euros(cents(d.amount) - cents(interest)), fees: interest };
  return { records: { main, cash: cashTx('WITHDRAW', d.amount, `${name} payment`), linked: false } };
}

// ——— Schedule form ———

export interface ScheduleDraft {
  type: Schedule['type'];
  amount: string;
  day: number;
  startDate: ISODate;
  cashAssetId: number | null;
  /** Percent, as typed ("3,5"); loans only, empty = not set. */
  rate: string;
}

export type ScheduleInput = Omit<Schedule, 'id' | 'doneUntil' | 'createdAt'>;

/** The operations a schedule can repeat on an investment. */
export function scheduleTypes(view: AssetView): { value: Schedule['type']; label: string }[] {
  if (view.isLiability) return [{ value: 'WITHDRAW', label: 'Monthly payment' }];
  if (view.asset.valuation === 'units') return [{ value: 'BUY', label: 'Buy' }];
  return [
    { value: 'DEPOSIT', label: 'Put in' },
    { value: 'WITHDRAW', label: 'Take out' },
  ];
}

export function validateSchedule(d: ScheduleDraft, assetId: number, isLiability: boolean): { input: ScheduleInput } | { errors: { amount?: string; rate?: string } } {
  const amount = parseNumber(d.amount);
  const errors: { amount?: string; rate?: string } = {};
  if (amount === null || amount <= 0) errors.amount = 'Enter an amount above 0.';
  let rate: number | null = null;
  if (isLiability && d.rate.trim() !== '') {
    const pct = parseNumber(d.rate);
    if (pct === null || pct < 0 || pct > 50) errors.rate = 'Enter a yearly rate between 0 and 50%.';
    else rate = pct / 100;
  }
  if (errors.amount || errors.rate) return { errors };
  return {
    input: {
      assetId,
      type: d.type,
      amount: euros(cents(amount!)),
      day: Math.min(Math.max(Math.round(d.day), 1), 31),
      startDate: d.startDate,
      cashAssetId: d.cashAssetId,
      rate,
    },
  };
}

/** "Buy 200 € on the 5th of each month": the label of a schedule (amount given already formatted). */
export function scheduleLabel(s: Pick<Schedule, 'type' | 'day'>, isLiability: boolean, amount: string): string {
  const what = isLiability ? `Pay ${amount}` : s.type === 'BUY' ? `Buy ${amount}` : s.type === 'DEPOSIT' ? `Put in ${amount}` : `Take out ${amount}`;
  return `${what} on the ${ordinal(s.day)} of each month`;
}

export function ordinal(n: number) {
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
