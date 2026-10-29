import type { AssetView } from './portfolio';
import { needsTracking } from './staleness';
import type { Asset, ISODate } from './types';

/** A review is due on its date and after. Archived investments are never due. */
export const isReviewDue = (asset: Asset, today: ISODate) =>
  !!asset.reviewDate && asset.reviewDate <= today && !asset.archived;

/** Unrealized loss from which an investment is flagged: −25% vs what was paid for what is held. */
export const BIG_LOSS = -0.25;

/** The loss (−0.32 = −32% vs average cost) of an open investment down 25% or more, else null. Debts never. */
export function bigLoss(v: AssetView): number | null {
  const pct = v.position.unrealizedPct;
  return !v.isLiability && needsTracking(v) && pct !== null && pct <= BIG_LOSS ? pct : null;
}

/** Why an investment is to review: its review date has come, or a big loss. */
export type ReviewReason = 'date' | 'loss';

/**
 * 'date' when its review date has come; 'loss' when it is down 25% or more and no later review is
 * planned (planning one, "Look again in 3 months", silences it until then).
 */
export function reviewReason(v: AssetView, today: ISODate): ReviewReason | null {
  if (!needsTracking(v)) return null;
  if (isReviewDue(v.asset, today)) return 'date';
  if (bigLoss(v) !== null && !(v.asset.reviewDate && v.asset.reviewDate > today)) return 'loss';
  return null;
}

/** Open investments to review: big losses first (largest first), then due reviews, oldest first. */
export function reviewsDue(views: Iterable<AssetView>, today: ISODate): AssetView[] {
  const due = [...views].map((v) => ({ v, reason: reviewReason(v, today) })).filter((d) => d.reason !== null);
  due.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === 'loss' ? -1 : 1;
    if (a.reason === 'loss') return a.v.position.unrealizedPct! - b.v.position.unrealizedPct!;
    return a.v.asset.reviewDate!.localeCompare(b.v.asset.reviewDate!);
  });
  return due.map((d) => d.v);
}
