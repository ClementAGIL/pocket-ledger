import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LossBadge, StalenessBadge, StalenessIcon } from '@/components/StalenessBadge';
import { Card, Money, Percent, Stat } from '@/components/ui';
import { formatNumber, formatPercent } from '@/domain/format';
import { accountsLabel, holdingPerformance, type Holding, type ListRow } from '@/domain/holdings';
import { combine } from '@/domain/performance';
import type { AssetView, CategoryGroup } from '@/domain/portfolio';
import { BIG_LOSS, bigLoss, isReviewDue, reviewsDue } from '@/domain/reviews';
import { needsTracking, summarizeStaleness } from '@/domain/staleness';
import { useData, useToday } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

/**
 * Investments list: a category card that expands into its investments. `nested`: a category inside
 * an account card (By account), without its own card, its share and gain within the account.
 * `rows`: the investments with holdings in several accounts merged (By category); default: one row each.
 */
export function Group({
  group,
  open,
  onToggle,
  nested = false,
  rows,
}: {
  group: CategoryGroup;
  open: boolean;
  onToggle: () => void;
  nested?: boolean;
  rows?: ListRow[];
}) {
  const theme = useTheme();
  const now = useToday();
  const { performance } = useData();
  const perf = nested
    ? combine(group.items.map((v) => performance.byAsset.get(v.asset.id)!).filter(Boolean), performance.start === null)
    : performance.byCategory.get(group.category.id);
  const isLiability = group.category.kind === 'liability';
  const staleness = summarizeStaleness(group.items, now);
  const reviewCount = reviewsDue(group.items, now).length;
  const Container = nested ? View : Card;
  return (
    <Container style={nested ? [styles.nested, { borderColor: theme.border }] : styles.group}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.groupHeader}>
        <View style={[styles.dot, { backgroundColor: group.category.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.groupName, nested && styles.nestedName, { color: theme.text }]}>{group.category.name}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
            {group.items.length} {group.items.length > 1 ? 'items' : 'item'}
            {!isLiability && ` · ${formatPercent(group.weight)} of ${nested ? 'the account' : 'assets'}`}
          </Text>
          {(staleness.stale > 0 || reviewCount > 0) && (
            <View style={styles.staleLine}>
              {staleness.stale > 0 && (
                <>
                  <StalenessIcon level={staleness.worst} size={13} />
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{staleness.stale} to update</Text>
                </>
              )}
              {reviewCount > 0 && (
                <>
                  <Ionicons name="flag" size={12} color={theme.staleWarning} style={{ marginLeft: staleness.stale > 0 ? 6 : 0 }} />
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{reviewCount} to review</Text>
                </>
              )}
            </View>
          )}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Money value={isLiability ? -group.value : group.value} rounded style={styles.groupValue} />
          {!isLiability && perf && (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Money value={perf.gain} signed colored rounded style={{ fontSize: 13 }} />
              <Percent ratio={perf.pct} style={{ fontSize: 13 }} />
            </View>
          )}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textMuted} />
      </Pressable>

      {open && (
        <View style={{ marginTop: space.sm }}>
          {!isLiability && (
            <View style={[styles.groupStats, { borderColor: theme.border }]}>
              <Stat label="Invested">
                <Money value={group.invested} rounded style={styles.statValue} />
              </Stat>
              <Stat label="Unrealized">
                <Money value={group.unrealized} signed colored rounded style={styles.statValue} />
              </Stat>
              <Stat label="Income">
                <Money value={perf?.income ?? 0} rounded style={styles.statValue} />
              </Stat>
            </View>
          )}
          {(rows ?? group.items.map((view): ListRow => ({ kind: 'asset', view }))).map((row) =>
            row.kind === 'asset' ? (
              <AssetRow key={row.view.asset.id} view={row.view} showAccount={!nested} />
            ) : (
              <HoldingRow key={row.holding.key} holding={row.holding} />
            ),
          )}
        </View>
      )}
    </Container>
  );
}

/**
 * One product in several accounts: summed figures, opens the holding page; the chevron shows its
 * per-account lines, each opening its own investment page.
 */
function HoldingRow({ holding }: { holding: Holding }) {
  const theme = useTheme();
  const now = useToday();
  const { performance } = useData();
  const [open, setOpen] = useState(false);
  const perf = holdingPerformance(holding, performance);
  const { position: p, items } = holding;
  const tracked = items.filter(needsTracking);
  // The investment updated longest ago sets the reminder level.
  const oldest = tracked.reduce<AssetView | null>(
    (old, v) => (!old || (v.position.priceDate ?? '') < (old.position.priceDate ?? '') ? v : old),
    null,
  );
  const reviewDue = tracked.some((v) => isReviewDue(v.asset, now));
  // On the summed position: what the product as a whole lost vs what was paid.
  const loss = tracked.length && p.unrealizedPct !== null && p.unrealizedPct <= BIG_LOSS ? p.unrealizedPct : null;
  return (
    <View style={[styles.holding, { borderColor: theme.border }]}>
      <Pressable
        onPress={() => router.push({ pathname: '/holding', params: { holding: holding.key } })}
        accessibilityRole="button"
        style={({ pressed }) => [styles.holdingRow, { opacity: pressed ? 0.6 : holding.isClosed ? 0.55 : 1 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
            {holding.name}
            <Text style={{ color: theme.textMuted, fontWeight: '400' }}> · {holding.identifier}</Text>
          </Text>
          <View style={styles.subtitle}>
            {reviewDue && (
              <View style={styles.reviewBadge} accessible accessibilityLabel="Review due">
                <Ionicons name="flag" size={12} color={theme.staleWarning} />
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Review</Text>
              </View>
            )}
            {loss !== null && <LossBadge loss={loss} />}
            {oldest && <StalenessBadge priceDate={oldest.position.priceDate} frequency={oldest.category.updateReminder} />}
            <Text style={{ color: theme.textMuted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
              {[
                accountsLabel(holding),
                p.quantity > 0 ? formatNumber(p.quantity) : null,
                p.avgCost !== null ? `avg ${formatNumber(p.avgCost, 4)} €` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Money value={p.value} style={{ fontSize: 15, fontWeight: '600' }} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Money value={perf.gain} signed colored rounded style={{ fontSize: 12 }} />
            <Percent ratio={perf.pct} style={{ fontSize: 12 }} />
          </View>
        </View>
      </Pressable>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide the accounts' : `Show the ${items.length} lines`}
        style={styles.holdingToggle}>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textMuted} />
      </Pressable>
      {open && (
        <View style={[styles.holdingItems, { borderColor: theme.border }]}>
          {items.map((v) => (
            <AssetRow key={v.asset.id} view={v} showAccount />
          ))}
        </View>
      )}
    </View>
  );
}

function AssetRow({ view, showAccount }: { view: AssetView; showAccount: boolean }) {
  const theme = useTheme();
  const now = useToday();
  const { performance } = useData();
  const perf = performance.byAsset.get(view.asset.id);
  const { asset, account, position: p, isLiability } = view;
  const loss = bigLoss(view);
  const details =
    asset.valuation === 'units' && p.quantity > 0
      ? `${formatNumber(p.quantity)} × ${formatNumber(p.price ?? 0, 4)} €`
      : null;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/asset/[id]', params: { id: String(asset.id) } })}
      accessibilityRole="button"
      style={({ pressed }) => [styles.assetRow, { borderColor: theme.border, opacity: pressed ? 0.6 : view.isClosed ? 0.55 : 1 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
          {asset.name}
          {asset.identifier ? <Text style={{ color: theme.textMuted, fontWeight: '400' }}> · {asset.identifier}</Text> : null}
        </Text>
        <View style={styles.subtitle}>
          {needsTracking(view) && isReviewDue(asset, now) && (
            <View style={styles.reviewBadge} accessible accessibilityLabel="Review due">
              <Ionicons name="flag" size={12} color={theme.staleWarning} />
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Review</Text>
            </View>
          )}
          {loss !== null && <LossBadge loss={loss} />}
          {needsTracking(view) && <StalenessBadge priceDate={p.priceDate} frequency={view.category.updateReminder} />}
          <Text style={{ color: theme.textMuted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
            {[showAccount ? account.name : null, details, p.avgCost !== null ? `avg ${formatNumber(p.avgCost, 4)} €` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Money value={isLiability ? -p.value : p.value} style={{ fontSize: 15, fontWeight: '600' }} />
        {!isLiability && perf && (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Money value={perf.gain} signed colored rounded style={{ fontSize: 12 }} />
            <Percent ratio={perf.pct} style={{ fontSize: 12 }} />
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { paddingVertical: space.md },
  nested: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm, marginTop: space.sm },
  nestedName: { fontSize: 15 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  groupName: { fontSize: 17, fontWeight: '600' },
  staleLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reviewBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  holding: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  holdingRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, minHeight: 56 },
  holdingToggle: { width: 32, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  holdingItems: { width: '100%', paddingLeft: space.md, borderLeftWidth: 2, marginBottom: space.sm },
  groupValue: { fontSize: 16, fontWeight: '600' },
  groupStats: {
    flexDirection: 'row',
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statValue: { fontSize: 14, fontWeight: '500' },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
});
