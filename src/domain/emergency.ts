import type { Portfolio } from './portfolio';

/*
 * Emergency fund: cash kept aside for a few months of expenses (job loss, repairs…), before
 * investing for the long term. Expenses come from the Simulation (the same yearly spending as FIRE).
 */

export const EMERGENCY_MONTHS = [3, 6, 12] as const;
export const DEFAULT_EMERGENCY_MONTHS = 6;

/** The emergency fund is the "Cash" category (current and savings accounts). */
export const isCashCategory = (name: string) => name.trim().toLowerCase() === 'cash';

/** Value of the Cash category today. */
export function cashValue(portfolio: Portfolio): number {
  return portfolio.groups.filter((g) => !g.items[0]?.isLiability && isCashCategory(g.category.name)).reduce((s, g) => s + g.value, 0);
}

export interface EmergencyFund {
  /** months × monthly expenses. */
  target: number;
  cash: number;
  /** How many months of expenses the cash covers. */
  monthsCovered: number;
  /** Cash still to put aside (0 when covered). */
  missing: number;
  covered: boolean;
  /** cash / target, capped at 1 (for bars). */
  progress: number;
  /** cash / target, not capped (1.12 = 112%: more than the target). */
  ratio: number;
}

/** Null when the expenses are unknown. */
export function emergencyFund(monthlyExpenses: number, months: number, cash: number): EmergencyFund | null {
  if (!(monthlyExpenses > 0) || !(months > 0)) return null;
  const target = monthlyExpenses * months;
  const held = Math.max(cash, 0);
  return {
    target,
    cash: held,
    monthsCovered: held / monthlyExpenses,
    missing: Math.max(target - held, 0),
    covered: held >= target - 0.005,
    progress: Math.min(held / target, 1),
    ratio: held / target,
  };
}

/** Share of the rebalanced assets the emergency fund represents (the Cash target to aim for), capped at 100%. */
export function emergencyShare(target: number, rebalancedTotal: number): number | null {
  if (!(target > 0) || !(rebalancedTotal > 0)) return null;
  return Math.min(target / rebalancedTotal, 1);
}

/**
 * The Cash target in euros: its weight × the assets in the target allocation (categories with a
 * target). Null when Cash has no target.
 */
export function cashTargetAmount(portfolio: Portfolio): number | null {
  const groups = portfolio.groups.filter((g) => !g.items[0]?.isLiability && g.category.targetWeight !== null);
  const cash = groups.find((g) => isCashCategory(g.category.name));
  if (!cash) return null;
  return cash.category.targetWeight! * groups.reduce((s, g) => s + g.value, 0);
}

export type CashAdvice =
  /** More cash than both the emergency fund and the Cash target: the extra could be invested. */
  | { kind: 'excess'; keep: number; excess: number; basis: 'emergency' | 'target' }
  /** Above the emergency fund but within the Cash target: the surplus stays cash on purpose. */
  | { kind: 'held-for-target'; surplus: number; targetAmount: number };

/**
 * What to say about cash beyond the emergency fund. What to keep is the higher of the emergency
 * fund (a floor) and the Cash target (an allocation choice), so this agrees with the rebalancing
 * in Targets to the cent. Null when the emergency fund isn't covered (or exactly met).
 */
export function cashAdvice(fund: EmergencyFund, targetAmount: number | null): CashAdvice | null {
  const basis = targetAmount !== null && targetAmount > fund.target ? 'target' : 'emergency';
  const keep = basis === 'target' ? targetAmount! : fund.target;
  // Same rounding as the rebalance plan: anything from a cent up.
  if (fund.cash - keep >= 0.005) return { kind: 'excess', keep, excess: fund.cash - keep, basis };
  if (basis === 'target' && fund.cash - fund.target >= 0.005) {
    return { kind: 'held-for-target', surplus: fund.cash - fund.target, targetAmount: keep };
  }
  return null;
}

/** Today's progress towards a goal (0–1). */
export const goalProgress = (current: number, goal: number) => (goal > 0 ? Math.min(Math.max(current, 0) / goal, 1) : 0);
