/*
 * Target allocation and rebalancing, by category.
 * Only categories with a target take part: the others (e.g. real estate you won't sell) are left out
 * of the total. Targets of the included categories must add up to 100%.
 */

export type RebalanceMode = 'buy-only' | 'full';

export interface RebalanceInput {
  categoryId: number;
  name: string;
  color: string;
  value: number;
  /** 0–1, or null when the category is excluded. */
  target: number | null;
}

export interface RebalanceRow extends RebalanceInput {
  target: number;
  /** Share of the included total, 0–1. */
  currentWeight: number;
  /** Value it should have after adding the new money. */
  targetValue: number;
  /** Euros to buy (> 0) or sell (< 0) as recommended for the mode. */
  action: number;
  /** currentWeight − target, in fraction (0.05 = 5 points over). */
  drift: number;
}

export interface RebalancePlan {
  rows: RebalanceRow[];
  excluded: RebalanceInput[];
  /** Value of the included categories. */
  total: number;
  /** Sum of the targets (1 when valid). */
  targetSum: number;
  valid: boolean;
}

const TOLERANCE = 1e-6;

/** Rounds to cents while keeping the exact total (largest remainders get the leftover cents). */
function roundPreservingSum(values: number[], total: number): number[] {
  const cents = values.map((v) => v * 100);
  const floored = cents.map(Math.floor);
  let left = Math.round(total * 100) - floored.reduce((s, v) => s + v, 0);
  const order = cents.map((c, i) => ({ i, frac: c - Math.floor(c) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; left > 0 && k < order.length; k++, left--) floored[order[k].i]++;
  return floored.map((c) => c / 100);
}

export function planRebalance(inputs: RebalanceInput[], newMoney: number, mode: RebalanceMode): RebalancePlan {
  const included = inputs.filter((i): i is RebalanceInput & { target: number } => i.target !== null);
  const excluded = inputs.filter((i) => i.target === null);
  const total = included.reduce((s, i) => s + i.value, 0);
  const targetSum = included.reduce((s, i) => s + i.target, 0);
  const valid = included.length > 0 && Math.abs(targetSum - 1) < TOLERANCE;
  const money = Math.max(0, newMoney);
  const newTotal = total + money;

  const gaps = included.map((i) => i.target * newTotal - i.value);
  let actions: number[];
  if (!valid) {
    actions = included.map(() => 0);
  } else if (mode === 'full') {
    // Exact targets: buys and sells; they net out to the new money.
    actions = roundPreservingSum(gaps, money);
  } else {
    // No selling: fill the categories furthest below target first.
    const deficits = gaps.map((g) => Math.max(0, g));
    const totalDeficit = deficits.reduce((s, d) => s + d, 0);
    const raw =
      totalDeficit <= TOLERANCE
        ? included.map((i) => money * i.target)
        : money >= totalDeficit
          ? deficits.map((d, k) => d + (money - totalDeficit) * included[k].target)
          : deficits.map((d) => (money * d) / totalDeficit);
    actions = roundPreservingSum(raw, money);
  }

  const rows = included
    .map((i, k) => {
      const currentWeight = total > 0 ? i.value / total : 0;
      return {
        ...i,
        currentWeight,
        targetValue: i.target * newTotal,
        action: actions[k],
        drift: currentWeight - i.target,
      };
    })
    .sort((a, b) => b.action - a.action || a.drift - b.drift);

  return { rows, excluded, total, targetSum, valid };
}

/**
 * Today's share of each category with a value, in % with one decimal, adding up to exactly 100
 * (largest remainders get the leftover tenths): "Use my current allocation" as a starting target.
 */
export function currentShares(inputs: Pick<RebalanceInput, 'categoryId' | 'value'>[]): Map<number, number> {
  const held = inputs.filter((i) => i.value > 0);
  const total = held.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return new Map();
  const tenths = held.map((i) => {
    const exact = (i.value / total) * 1000;
    return { id: i.categoryId, floor: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = 1000 - tenths.reduce((s, t) => s + t.floor, 0);
  for (const t of [...tenths].sort((a, b) => b.rest - a.rest)) {
    if (left <= 0) break;
    t.floor++;
    left--;
  }
  // A share rounding to 0% stays without a target rather than a 0% one.
  return new Map(tenths.filter((t) => t.floor > 0).map((t) => [t.id, t.floor / 10]));
}

/** Display order of the target rows: largest share now first, then largest target, then name. */
export const byShareThenTarget = (a: RebalanceRow, b: RebalanceRow) =>
  b.currentWeight - a.currentWeight || b.target - a.target || a.name.localeCompare(b.name);

/**
 * Display order of the target editor: largest target first, then largest value (categories without
 * a target, then those not held), then name.
 */
export const byTargetThenValue = (a: { target: number | null; value: number; name: string }, b: { target: number | null; value: number; name: string }) =>
  (b.target ?? -1) - (a.target ?? -1) || b.value - a.value || a.name.localeCompare(b.name);
