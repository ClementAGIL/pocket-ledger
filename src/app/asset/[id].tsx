import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AnnualizedReturn } from '@/components/AnnualizedReturn';
import { EditAsset } from '@/components/asset/EditAsset';
import { EntryLine, newestFirst, txLabel, type Entry } from '@/components/asset/EntryLine';
import { HistoryChart } from '@/components/HistoryChart';
import { NotesCard } from '@/components/NotesCard';
import { PeriodSelector } from '@/components/PeriodSelector';
import { StalenessBadge } from '@/components/StalenessBadge';
import { Button, Card, Money, Percent, Row, SectionTitle, TextLink } from '@/components/ui';
import * as repo from '@/db/repo';
import { formatDate, formatNumber } from '@/domain/format';
import { downsample, sliceHistory } from '@/domain/history';
import { PERIOD_LABELS } from '@/domain/performance';
import { isReviewDue } from '@/domain/reviews';
import type { Transaction } from '@/domain/types';
import { useMoney } from '@/hooks/useMoney';
import { useData, useToday } from '@/state/DataProvider';
import { useUndo } from '@/state/UndoProvider';
import { radius, space, useTheme } from '@/theme';

export default function AssetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const now = useToday();
  const { portfolio, performance, returns, write } = useData();
  const { money, hidden } = useMoney();
  /** "Paid from Livret A" / "Linked to MSCI World" for the two sides of a cash transfer. */
  const linkLabel = (tx: Transaction) => {
    const other = tx.linkedId != null ? portfolio.txById.get(tx.linkedId) : undefined;
    const name = other && portfolio.byAssetId.get(other.assetId)?.asset.name;
    if (!other || !name) return null;
    if (tx.type === 'BUY') return `Paid from ${name}`;
    if (tx.type === 'SELL' || tx.type === 'INCOME') return `Paid into ${name}`;
    return `Linked to ${name}`;
  };
  const showUndo = useUndo();
  const [editing, setEditing] = useState(false);
  const view = portfolio.byAssetId.get(Number(id));

  if (!view) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textMuted }}>This investment no longer exists.</Text>
      </View>
    );
  }

  const { asset, position: p, category, account, isLiability } = view;
  const perf = performance.byAsset.get(asset.id);
  const allPoints = view.steps.map((s) => ({
    date: s.lastDate!,
    value: s.value,
    invested: isLiability ? undefined : s.invested,
  }));
  const last = allPoints[allPoints.length - 1];
  if (last && last.date < now) allPoints.push({ ...last, date: now });
  // Same window as the selected period, starting from the state carried into it.
  const chartPoints = downsample(sliceHistory(allPoints, performance.start));

  const assetTxs = portfolio.txByAsset.get(asset.id) ?? [];
  const assetPrices = portfolio.pricesByAsset.get(asset.id) ?? [];
  // Newest first, in the order they were saved (same order as the calculations).
  // Rendered by a FlatList: only visible rows are drawn, even with years of daily entries.
  const entries: Entry[] = [
    ...assetTxs.map((tx) => ({ kind: 'tx' as const, date: tx.date, tx })),
    ...assetPrices.map((price) => ({ kind: 'price' as const, date: price.date, price })),
  ].sort(newestFirst);

  // An entry is deleted right away: the "Undo" banner replaces a confirmation.
  const deleteEntry = async (entry: Entry) => {
    if (entry.kind === 'tx') {
      const { tx } = entry;
      // A cash transfer goes as a pair: the buy and the withdrawal that paid it.
      const linked = tx.linkedId != null ? portfolio.txById.get(tx.linkedId) : undefined;
      const pair = linked ? [tx, linked] : [tx];
      await write(async (txn) => {
        for (const t of pair) await repo.deleteTransaction(txn, t.id);
      });
      const label = txLabel(tx.type, isLiability);
      const otherName = linked && portfolio.byAssetId.get(linked.assetId)?.asset.name;
      showUndo(`${label} of ${formatDate(tx.date)}${otherName ? ` and its ${otherName} entry` : ''} deleted`, () =>
        write(async (txn) => {
          for (const t of pair) await repo.restoreTransaction(txn, t);
        }),
      );
    } else {
      const { price } = entry;
      await write((txn) => repo.deletePrice(txn, price.id));
      showUndo(`Update of ${formatDate(price.date)} deleted`, () => write((txn) => repo.restorePrice(txn, price)));
    }
  };

  // A whole investment is still confirmed first, then can be undone too.
  const deleteAsset = () =>
    Alert.alert(`Delete ${asset.name}?`, 'All its operations and prices will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const deleted = { asset, transactions: [...assetTxs], prices: [...assetPrices] };
          router.back();
          await write((txn) => repo.deleteAsset(txn, asset.id));
          showUndo(`${asset.name} deleted`, () =>
            write((txn) => repo.restoreAsset(txn, deleted.asset, deleted.transactions, deleted.prices)),
          );
        },
      },
    ]);

  const openEntry = (entry: Entry) =>
    router.push({
      pathname: '/operation',
      params: entry.kind === 'tx' ? { txId: String(entry.tx.id) } : { priceId: String(entry.price.id) },
    });

  return (
    <>
      <Stack.Screen
        options={{
          title: asset.name,
          headerRight: () => (
            <TextLink title={editing ? 'Done' : 'Edit'} size={16} onPress={() => setEditing((e) => !e)} />
          ),
        }}
      />
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        data={editing ? [] : entries}
        keyExtractor={(entry) => `${entry.kind}-${entry.kind === 'tx' ? entry.tx.id : entry.price.id}`}
        initialNumToRender={20}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <Text style={{ color: theme.textSecondary }}>
              {category.name} · {account.name}
              {asset.identifier ? ` · ${asset.identifier}` : ''}
            </Text>
            <Money value={isLiability ? -p.value : p.value} style={styles.hero} />
            {!isLiability && perf && (
              <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'baseline' }}>
                <Money value={perf.gain} signed colored style={{ fontSize: 16, fontWeight: '600' }} />
                <Percent ratio={perf.pct} style={{ fontSize: 16, fontWeight: '600' }} />
                <Text style={{ color: theme.textMuted }}>{PERIOD_LABELS[performance.period].toLowerCase()}</Text>
              </View>
            )}
            {isReviewDue(asset, now) && !editing && (
              <View style={styles.dueBadge}>
                <Ionicons name="flag" size={14} color={theme.staleWarning} />
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Review due: see Notes below</Text>
              </View>
            )}
            {!isLiability && !editing && (
              <View style={{ marginTop: space.md }}>
                <PeriodSelector />
              </View>
            )}

            {editing ? (
              <EditAsset assetId={asset.id} onDone={() => setEditing(false)} onDelete={deleteAsset} />
            ) : (
              <>
                <Button
                  title="Add operation"
                  onPress={() => router.push({ pathname: '/operation', params: { assetId: String(asset.id) } })}
                  style={{ marginTop: space.lg }}
                />

                <Card style={{ marginTop: space.lg }}>
                  <HistoryChart points={chartPoints} hidden={hidden} valueLabel={isLiability ? 'Debt' : 'Value'} />
                </Card>

                <SectionTitle>Position</SectionTitle>
                <Card>
                  {asset.valuation === 'units' && (
                    <>
                      <Row label="Quantity">{formatNumber(p.quantity)}</Row>
                      <Row label="Last price">{p.price !== null ? money(p.price) : '—'}</Row>
                      <Row label="Average cost">{p.avgCost !== null ? money(p.avgCost) : '—'}</Row>
                    </>
                  )}
                  {!isLiability && (
                    <>
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
                        <AnnualizedReturn value={returns.forAsset(asset.id)} />
                      </Row>
                      <Row label={asset.valuation === 'units' ? 'Dividends' : 'Interest'}>
                        <Money value={p.income} />
                      </Row>
                      <Row label="Weight in portfolio">{`${(view.weight * 100).toFixed(1)} %`}</Row>
                    </>
                  )}
                  {p.priceDate && (
                    <Row label={asset.valuation === 'units' ? 'Price updated' : 'Value updated'}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                        {!view.isClosed && !asset.archived && <StalenessBadge priceDate={p.priceDate} frequency={category.updateReminder} />}
                        <Text style={{ color: theme.text }}>{formatDate(p.priceDate)}</Text>
                      </View>
                    </Row>
                  )}
                </Card>

                <SectionTitle>Notes</SectionTitle>
                <NotesCard key={`${asset.id}-${asset.note}-${asset.reviewDate}`} asset={asset} />

                <SectionTitle>History</SectionTitle>
              </>
            )}
          </>
        }
        ListEmptyComponent={
          editing ? null : (
            <Card>
              <Text style={{ color: theme.textMuted }}>No operations yet.</Text>
            </Card>
          )
        }
        renderItem={({ item: entry, index }) => (
          // Each row draws its part of the "card" so the list looks like one card.
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
              isLiability={isLiability}
              units={asset.valuation === 'units'}
              link={entry.kind === 'tx' ? linkLabel(entry.tx) : null}
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
  dueBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm },
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
