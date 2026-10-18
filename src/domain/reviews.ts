import type { AssetView } from './portfolio';
import { needsTracking } from './staleness';
import type { Asset, ISODate } from './types';

/** A review is due on its date and after. Archived investments are never due. */
export const isReviewDue = (asset: Asset, today: ISODate) =>
  !!asset.reviewDate && asset.reviewDate <= today && !asset.archived;

/** Open investments whose review date has come, oldest first. */
export function reviewsDue(views: Iterable<AssetView>, today: ISODate): AssetView[] {
  return [...views]
    .filter((v) => needsTracking(v) && isReviewDue(v.asset, today))
    .sort((a, b) => a.asset.reviewDate!.localeCompare(b.asset.reviewDate!));
}
