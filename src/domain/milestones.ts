import { cashValue, isCashCategory } from './emergency';
import type { PortfolioPerformance } from './performance';
import type { Portfolio } from './portfolio';
import { goalOf, type ProjectionSettings } from './projection';

/*
 * Milestones: the goal (an amount or FIRE) and the emergency fund, celebrated when they're reached.
 * In the app, when an operation or a price update crosses one (once per milestone: the key changes
 * with the target, so a new goal can be celebrated again); in the check-in, when it was crossed
 * during the month shown (against today's targets: their past values aren't kept).
 */

export interface Milestone {
  kind: 'goal' | 'emergency';
  /** Kind + target: what has been celebrated (settings.celebratedGoals). */
  key: string;
  target: number;
  /** goal: FIRE rather than an amount. */
  fire: boolean;
  /** emergency: months of expenses. */
  months: number;
}

/** What the milestones are measured against: assets (debts left out) for the goal, the Cash category for the fund. */
export interface MilestoneValues {
  assets: number;
  cash: number;
}

/** How many celebrated keys are kept (the latest ones). */
export const MAX_CELEBRATED = 20;

/** The milestones set in the Goals settings. */
export function milestones(s: ProjectionSettings): Milestone[] {
  const list: Milestone[] = [];
  const goal = goalOf(s);
  if (goal !== null) list.push({ kind: 'goal', key: `goal:${s.goalMode}:${Math.round(goal)}`, target: goal, fire: s.goalMode === 'fire', months: 0 });
  if (s.yearlySpending > 0 && s.emergencyMonths > 0) {
    const target = (s.yearlySpending / 12) * s.emergencyMonths;
    list.push({ kind: 'emergency', key: `emergency:${s.emergencyMonths}:${Math.round(target)}`, target, fire: false, months: s.emergencyMonths });
  }
  return list;
}

export const isReached = (m: Milestone, v: MilestoneValues) => (m.kind === 'goal' ? v.assets : v.cash) >= m.target - 0.005;

/** Milestones reached in `after` and not in `before`, minus those already celebrated. */
export function newlyReached(list: Milestone[], before: MilestoneValues, after: MilestoneValues, celebrated: readonly string[] = []): Milestone[] {
  return list.filter((m) => !celebrated.includes(m.key) && !isReached(m, before) && isReached(m, after));
}

/** Today's values. */
export const currentValues = (portfolio: Portfolio): MilestoneValues => ({ assets: portfolio.summary.assetsValue, cash: cashValue(portfolio) });

/** Values at the start and end of a period (`performanceBetween`), e.g. the check-in's month. */
export function periodValues(portfolio: Portfolio, perf: Omit<PortfolioPerformance, 'period'>): { start: MilestoneValues; end: MilestoneValues } {
  let startCash = 0;
  let endCash = 0;
  for (const v of portfolio.byAssetId.values()) {
    if (v.isLiability || !isCashCategory(v.category.name)) continue;
    const p = perf.byAsset.get(v.asset.id);
    if (!p) continue;
    startCash += p.startValue;
    endCash += p.endValue;
  }
  return { start: { assets: perf.total.startValue, cash: startCash }, end: { assets: perf.total.endValue, cash: endCash } };
}

/** Celebrated keys after celebrating `reached` (the latest MAX_CELEBRATED kept). */
export const withCelebrated = (celebrated: readonly string[], reached: Milestone[]) =>
  [...celebrated.filter((k) => !reached.some((m) => m.key === k)), ...reached.map((m) => m.key)].slice(-MAX_CELEBRATED);
