import { parseNumber } from './format';

export interface PlannedPriceUpdates {
  /** Valid entries, ready to save. */
  updates: { assetId: number; price: number }[];
  /** Asset ids whose input is not empty but can't be saved. */
  invalid: Set<number>;
}

/**
 * Turns the raw inputs of the "Update prices" screen into price updates.
 * Empty inputs are skipped (nothing to update). Negative or unparsable inputs are invalid.
 */
export function planPriceUpdates(drafts: Record<number, string>): PlannedPriceUpdates {
  const updates: PlannedPriceUpdates['updates'] = [];
  const invalid = new Set<number>();
  for (const [key, input] of Object.entries(drafts)) {
    if (input.trim() === '') continue;
    const assetId = Number(key);
    const price = parseNumber(input);
    if (price === null || price < 0) invalid.add(assetId);
    else updates.push({ assetId, price });
  }
  return { updates, invalid };
}

/** Relative change from `previous` to `next`, or null when it can't be computed. */
export function relativeChange(previous: number | null, next: number): number | null {
  if (previous === null || Math.abs(previous) < 1e-12) return null;
  return (next - previous) / Math.abs(previous);
}
