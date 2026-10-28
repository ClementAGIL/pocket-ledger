import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AnnualizedReturn } from '@/components/AnnualizedReturn';
import { EntryLine, newestFirst, type Entry } from '@/components/asset/EntryLine';
import { HistoryChart } from '@/components/HistoryChart';
import { PeriodSelector } from '@/components/PeriodSelector';
import { StalenessBadge } from '@/components/StalenessBadge';
import { Card, Money, Percent, Row, SectionTitle, TextLink } from '@/components/ui';
import { formatNumber } from '@/domain/format';
import { buildHistory, chartMarks, downsample, sliceHistory } from '@/domain/history';
import { accountsLabel, findHolding, holdingPerformance } from '@/domain/holdings';
import { PERIOD_LABELS } from '@/domain/performance';
import { isReviewDue } from '@/domain/reviews';
import { needsTracking } from '@/domain/staleness';
import { useEntryActions } from '@/hooks/useEntryActions';
import { useMoney } from '@/hooks/useMoney';
import { useData, useToday } from '@/state/DataProvider';
import { radius, space, useTheme } from '@/theme';

/**
 * One product held in several accounts (same identifier and category), merged for reading: summed
 * chart, position and history. Editing stays per investment: each line opens its own page.
 */
export default function HoldingScreen() {
  const { holding: key } = useLocalSearchParams<{ holding: string }>();
  const theme = useTheme();
  const now = useToday();
  const { portfolio, performance, returns } = useData();
  const { money, hidden } = useMoney();
  const { linkLabel, openEntry, deleteEntry } = useEntryActions();
  const [showPrices, setShowPrices] = useState(false);
  const holding = findHolding(portfolio, key);

  if (!holding) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textMuted }}>These investments no longer exist.</Text>
      </View>
    );
  }

  const { items, position: p } = holding;
  const category = items[0].category;
  const perf = holdingPerformance(holding, performance);
  const ids = items.map((v) => v.asset.id);
  const history = buildHistory(
    items.map((v) => ({ steps: v.steps, isLiability: false })),
    now,
  );
  const chartPoints = downsample(sliceHistory(history, performance.start)).map(({ date, value, invested }) => ({ date, value, invested }));

  const txs = ids.flatMap((id) => portfolio.txByAsset.get(id) ?? []);
  const prices = ids.flatMap((id) => portfolio.pricesByAsset.get(id) ?? []);
  const marks = chartMarks(txs, performance.start);
  // All accounts in one list, newest first in the order they were saved (rendered by a FlatList).
  const entries: Entry[] = [
    ...txs.map((tx) => ({ kind: 'tx' as const, date: tx.date, tx })),
    ...(showPrices ? prices.map((price) => ({ kind: 'price' as const, date: price.date, price })) : []),
  ].sort(newestFirst);
  const accountOf = (entry: Entry) =>
    portfolio.byAssetId.get(entry.kind === 'tx' ? entry.tx.assetId : entry.price.assetId)?.account.name;

  return (
    <>
      <Stack.Screen options={{ title: holding.name }} />
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        data={entries}
        keyExtractor={(entry) => `${entry.kind}-${entry.kind === 'tx' ? entry.tx.id : entry.price.id}`}
        initialNumToRender={20}
        windowSize={7}
        ListHeaderComponent={
          <>
            <Text style={{ color: theme.textSecondary }}>
              {category.name} · {items.length} accounts · {holding.identifier}
            </Text>
            <Money value={p.value} style={styles.hero} />
            <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'baseline' }}>
              <Money value={perf.gain} signed colored style={{ fontSize: 16, fontWeight: '600' }} />
              <Percent ratio={perf.pct} style={{ fontSize: 16, fontWeight: '600' }} />
              <Text style={{ color: theme.textMuted }}>{PERIOD_LABELS[performance.period].toLowerCase()}</Text>
            </View>
            <View style={{ marginTop: space.md }}>
              <PeriodSelector />
            </View>

            <Card style={{ marginTop: space.lg }}>
              <HistoryChart points={chartPoints} hidden={hidden} marks={marks} />
            </Card>

            <SectionTitle>Position, all accounts</SectionTitle>
            <Card>
              <Row label="Quantity">{formatNumber(p.quantity)}</Row>
              <Row label="Last price">{p.price !== null ? money(p.price) : '—'}</Row>
              <Row label="Average cost">{p.avgCost !== null ? money(p.avgCost) : '—'}</Row>
              <Row label="Invested">
                <Money value={p.invested} />
              </Row>
              <Row label="Unrealized gain">
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Money value={p.unrealized} signed colored />
                  <Percent ratio={p.unrealizedPct} />
                </View>
              </Row>
              <Row label="Realized gain">
                <Money value={p.realized} signed colored />
              </Row>
              <Row label="Annualized return">
                <AnnualizedReturn value={returns.forAssets(ids)} />
              </Row>
              <Row label="Dividends">
                <Money value={p.income} />
              </Row>
              <Row label="Weight in portfolio">{`${(holding.weight * 100).toFixed(1)} %`}</Row>
            </Card>

            <SectionTitle>{holding.accountCount > 1 ? `In ${holding.accountCount} accounts` : `In ${accountsLabel(holding)}`}</SectionTitle>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: space.sm }}>
              Operations, notes, reviews and changes are per account: open one.
            </Text>
            <Card style={{ paddingVertical: 0 }}>
              {items.map((v, i) => (
                <Pressable
                  key={v.asset.id}
                  onPress={() => router.push({ pathname: '/asset/[id]', params: { id: String(v.asset.id) } })}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.account,
                    { borderColor: theme.border, opacity: pressed ? 0.6 : v.isClosed ? 0.55 : 1 },
                    i === items.length - 1 && { borderBottomWidth: 0 },
                  ]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: theme.text, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
                      {v.account.name}
                      <Text style={{ color: theme.textMuted, fontWeight: '400' }}> · {v.asset.name}</Text>
                    </Text>
                    <View style={styles.subtitle}>
                      {needsTracking(v) && isReviewDue(v.asset, now) && (
                        <View style={styles.badge} accessible accessibilityLabel="Review due">
                          <Ionicons name="flag" size={12} color={theme.staleWarning} />
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Review</Text>
                        </View>
                      )}
                      {needsTracking(v) && <StalenessBadge priceDate={v.position.priceDate} frequency={category.updateReminder} />}
                      <Text style={{ color: theme.textMuted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                        {[
                          `${formatNumber(v.position.quantity)} × ${formatNumber(v.position.price ?? 0, 4)} €`,
                          v.position.avgCost !== null ? `avg ${formatNumber(v.position.avgCost, 4)} €` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  </View>
                  <Money value={v.position.value} style={{ fontSize: 15, fontWeight: '600' }} />
                  <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                </Pressable>
              ))}
            </Card>

            <View style={styles.historyTitle}>
              <SectionTitle>History</SectionTitle>
              {prices.length > 0 && (
                <TextLink
                  title={showPrices ? 'Hide price updates' : `Show price updates (${prices.length})`}
                  icon={showPrices ? 'eye-off-outline' : 'eye-outline'}
                  onPress={() => setShowPrices((s) => !s)}
                  style={{ alignSelf: 'flex-end', marginBottom: space.sm }}
                />
              )}
            </View>
          </>
        }
        ListEmptyComponent={
          <Card>
            <Text style={{ color: theme.textMuted }}>{prices.length > 0 ? 'No operations yet: only price updates.' : 'No operations yet.'}</Text>
          </Card>
        }
        renderItem={({ item: entry, index }) => (
          <Pressable
            onPress={() => openEntry(entry)}
            accessibilityRole="button"
            accessibilityHint="Tap to edit"
            style={({ pressed }) => [
              styles.entry,
              { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
              index === 0 && styles.entryFirst,
              index === entries.length - 1 && styles.entryLast,
            ]}>
            <EntryLine
              entry={entry}
              isLiability={false}
              units
              link={entry.kind === 'tx' ? linkLabel(entry.tx) : null}
              account={accountOf(entry)}
            />
            <Pressable onPress={() => deleteEntry(entry)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Delete">
              <Ionicons name="trash-outline" size={18} color={theme.textMuted} />
            </Pressable>
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl * 3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { fontSize: 32, fontWeight: '700', marginTop: space.xs },
  historyTitle: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  entryFirst: { borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  entryLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
});
