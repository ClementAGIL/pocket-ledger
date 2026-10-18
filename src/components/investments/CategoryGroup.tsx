import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StalenessBadge, StalenessIcon } from '@/components/StalenessBadge';
import { Card, Money, Percent, Stat } from '@/components/ui';
import { formatNumber, formatPercent } from '@/domain/format';
import type { AssetView, CategoryGroup } from '@/domain/portfolio';
import { isReviewDue, reviewsDue } from '@/domain/reviews';
import { needsTracking, summarizeStaleness } from '@/domain/staleness';
import { useData, useToday } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

/** Investments list: a category card that expands into its investments. */
export function Group({ group, open, onToggle }: { group: CategoryGroup; open: boolean; onToggle: () => void }) {
  const theme = useTheme();
  const now = useToday();
  const { performance } = useData();
  const perf = performance.byCategory.get(group.category.id);
  const isLiability = group.category.kind === 'liability';
  const staleness = summarizeStaleness(group.items, now);
  const reviewCount = reviewsDue(group.items, now).length;
  return (
    <Card style={styles.group}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.groupHeader}>
        <View style={[styles.dot, { backgroundColor: group.category.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.groupName, { color: theme.text }]}>{group.category.name}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
            {group.items.length} {group.items.length > 1 ? 'items' : 'item'}
            {!isLiability && ` · ${formatPercent(group.weight)} of assets`}
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
          {group.items.map((v) => (
            <AssetRow key={v.asset.id} view={v} />
          ))}
        </View>
      )}
    </Card>
  );
}

function AssetRow({ view }: { view: AssetView }) {
  const theme = useTheme();
  const now = useToday();
  const { performance } = useData();
  const perf = performance.byAsset.get(view.asset.id);
  const { asset, account, position: p, isLiability } = view;
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
          {needsTracking(view) && <StalenessBadge priceDate={p.priceDate} frequency={view.category.updateReminder} />}
          <Text style={{ color: theme.textMuted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
            {account.name}
            {details ? ` · ${details}` : ''}
            {p.avgCost !== null ? ` · avg ${formatNumber(p.avgCost, 4)} €` : ''}
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
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  groupName: { fontSize: 17, fontWeight: '600' },
  staleLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reviewBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
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
