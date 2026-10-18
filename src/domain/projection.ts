import { addMonths } from './dates';
import { DEFAULT_EMERGENCY_MONTHS, EMERGENCY_MONTHS } from './emergency';
import { exceptionalLimit, firstMonth, monthlySavings, monthOf } from './savings';
import type { ISODate, Snapshot } from './types';

/*
 * Simulation: where the assets (debts excluded) could go at a given yearly growth rate and a
 * given yearly saving, and when they would reach a goal. With inflation on, everything is in today's
 * euros: growth uses the real rate and the saving keeps its purchasing power (it rises with prices).
 * Monthly steps: growth at the monthly equivalent of the yearly rate, then 1/12 of the saving.
 */

/** "4% rule": the portfolio can pay a yearly spending of 4% of its value, i.e. 25× the spending. */
export const FIRE_WITHDRAWAL_RATE = 0.04;
/** Projections and goal searches stop here. */
export const MAX_YEARS = 100;

export interface ProjectionPoint {
  /** Months from today. */
  month: number;
  value: number;
  /** Today's value plus every saving added since: the part that is not growth. */
  contributed: number;
}

export interface Plan {
  start: number;
  /** €/year added (negative = withdrawn). */
  yearlySaving: number;
  /** Yearly growth rate (0.05 = 5%/yr). */
  rate: number;
}

/** Calls `visit` after each month, until it returns true or MAX_YEARS is reached. */
function simulate({ start, yearlySaving, rate }: Plan, visit: (p: ProjectionPoint) => boolean) {
  const monthlyRate = Math.pow(1 + rate, 1 / 12) - 1;
  const monthlySaving = yearlySaving / 12;
  let value = Math.max(start, 0);
  let contributed = value;
  for (let month = 1; month <= MAX_YEARS * 12; month++) {
    // A portfolio can't go below zero: withdrawals stop when it is empty.
    value = Math.max(0, value * (1 + monthlyRate) + monthlySaving);
    contributed = Math.max(0, contributed + monthlySaving);
    if (visit({ month, value, contributed })) return;
  }
}

/** One point per year, from today (year 0) to `years`. */
export function project(plan: Plan, years: number): ProjectionPoint[] {
  const start = Math.max(plan.start, 0);
  const points: ProjectionPoint[] = [{ month: 0, value: start, contributed: start }];
  simulate(plan, (p) => {
    if (p.month % 12 === 0) points.push(p);
    return p.month >= years * 12;
  });
  return points;
}

/** Months until the value reaches `target`: 0 when already there, null when not within MAX_YEARS. */
export function monthsToReach(target: number, plan: Plan): number | null {
  if (plan.start >= target) return 0;
  let found: number | null = null;
  simulate(plan, (p) => {
    if (p.value >= target) found = p.month;
    return found !== null;
  });
  return found;
}

/** The portfolio that pays `yearlySpending` forever under the 4% rule. */
export const fireTarget = (yearlySpending: number) => yearlySpending / FIRE_WITHDRAWAL_RATE;

export interface SavingPace {
  /** Average € added to assets per year (money in − money out, debts excluded). */
  yearly: number;
  /** Months averaged (exceptional ones left out). */
  months: number;
  /** Exceptional months left out (home purchase, first deposit of existing savings…). */
  excluded: number;
}

/**
 * Current saving pace: net money put into assets per month over the last 12 complete months (or
 * since the first operation), without exceptional months, × 12. Loans don't count: repaying a loan
 * doesn't add to the assets being projected.
 */
export function savingPace(data: Snapshot, today: ISODate): SavingPace {
  const first = firstMonth(data);
  if (!first) return { yearly: 0, months: 0, excluded: 0 };
  const current = monthOf(today);
  let to = monthOf(addMonths(`${current}-01`, -1));
  let from = monthOf(addMonths(`${current}-01`, -12));
  if (first > from) from = first;
  // Started this month: nothing complete yet, use what there is.
  if (from > to) to = from = current;

  const values = monthlySavings(data, from, to).months.map((m) => m.added - m.withdrawn);
  const limit = exceptionalLimit(values);
  const kept = limit === null ? values : values.filter((v) => Math.abs(v) <= limit);
  const average = kept.length ? kept.reduce((s, v) => s + v, 0) / kept.length : 0;
  return { yearly: average * 12, months: kept.length, excluded: values.length - kept.length };
}

// ——— Saved choices (settings.projection, stored as JSON) ———

export type RateChoice = 'mine' | 'custom' | '4' | '7' | '10';
export type GoalMode = 'amount' | 'fire';
export type InflationChoice = 'off' | '2' | '3' | 'custom';
export const HORIZONS = [10, 20, 30] as const;

export interface ProjectionSettings {
  rate: RateChoice;
  /** Fraction, used when rate = 'custom'. */
  customRate: number;
  saving: 'mine' | 'custom';
  /** €/year, used when saving = 'custom'. */
  customSaving: number;
  goalMode: GoalMode;
  /** € (0 = no goal). */
  goalAmount: number;
  /** €/year, for the FIRE goal (0 = none). */
  yearlySpending: number;
  years: number;
  /** 'off' = future euros; otherwise amounts are in today's euros at this yearly inflation. */
  inflation: InflationChoice;
  /** Fraction, used when inflation = 'custom'. */
  customInflation: number;
  /** Emergency fund size, in months of expenses (yearlySpending / 12). */
  emergencyMonths: number;
}

export const DEFAULT_PROJECTION: ProjectionSettings = {
  rate: 'mine',
  customRate: 0.05,
  saving: 'mine',
  customSaving: 0,
  goalMode: 'amount',
  goalAmount: 0,
  yearlySpending: 0,
  years: 20,
  // 2% = the ECB target: on by default, so a FIRE number in today's money is compared fairly.
  inflation: '2',
  customInflation: 0.025,
  emergencyMonths: DEFAULT_EMERGENCY_MONTHS,
};

const RATE_CHOICES: RateChoice[] = ['mine', 'custom', '4', '7', '10'];
const INFLATION_CHOICES: InflationChoice[] = ['off', '2', '3', 'custom'];
const finite = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Tolerant: any missing or invalid field falls back to its default. */
export function parseProjectionSettings(raw: string | undefined): ProjectionSettings {
  let obj: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') obj = parsed as Record<string, unknown>;
  } catch {
    // Keep the defaults.
  }
  const d = DEFAULT_PROJECTION;
  return {
    rate: RATE_CHOICES.includes(obj.rate as RateChoice) ? (obj.rate as RateChoice) : d.rate,
    customRate: Math.min(Math.max(finite(obj.customRate, d.customRate), -0.5), 0.5),
    saving: obj.saving === 'custom' ? 'custom' : 'mine',
    customSaving: finite(obj.customSaving, d.customSaving),
    goalMode: obj.goalMode === 'fire' ? 'fire' : 'amount',
    goalAmount: Math.max(0, finite(obj.goalAmount, d.goalAmount)),
    yearlySpending: Math.max(0, finite(obj.yearlySpending, d.yearlySpending)),
    years: HORIZONS.includes(obj.years as (typeof HORIZONS)[number]) ? (obj.years as number) : d.years,
    inflation: INFLATION_CHOICES.includes(obj.inflation as InflationChoice) ? (obj.inflation as InflationChoice) : d.inflation,
    customInflation: Math.min(Math.max(finite(obj.customInflation, d.customInflation), 0), 0.2),
    emergencyMonths: EMERGENCY_MONTHS.includes(obj.emergencyMonths as (typeof EMERGENCY_MONTHS)[number])
      ? (obj.emergencyMonths as number)
      : d.emergencyMonths,
  };
}

/** The rate a choice stands for; 'mine' falls back to 7% when there's no annualized return yet. */
export function rateOf(s: ProjectionSettings, mine: number | null): number {
  if (s.rate === 'mine') return mine ?? 0.07;
  if (s.rate === 'custom') return s.customRate;
  return Number(s.rate) / 100;
}

/** Yearly inflation the choice stands for (0 when off). */
export function inflationOf(s: ProjectionSettings): number {
  if (s.inflation === 'off') return 0;
  if (s.inflation === 'custom') return s.customInflation;
  return Number(s.inflation) / 100;
}

/** Growth in purchasing power: 7% a year with 2% inflation is ≈ 4.9% a year in today's euros. */
export const realRate = (rate: number, inflation: number) => (1 + rate) / (1 + inflation) - 1;

/** The goal in €, or null when none is set. */
export function goalOf(s: ProjectionSettings): number | null {
  const goal = s.goalMode === 'fire' ? fireTarget(s.yearlySpending) : s.goalAmount;
  return goal > 0 ? goal : null;
}

/** Part of the plan not set yet, offered in the Home reminders. */
export type SetupStep = 'goal' | 'emergency';

/**
 * What's missing: a goal (an amount, or FIRE with a yearly spending) and the emergency fund
 * (it needs the expenses, shared with FIRE). A FIRE goal therefore also sets up the fund.
 */
export function missingSetup(s: ProjectionSettings): SetupStep[] {
  const steps: SetupStep[] = [];
  if (goalOf(s) === null) steps.push('goal');
  if (!(s.yearlySpending > 0)) steps.push('emergency');
  return steps;
}
