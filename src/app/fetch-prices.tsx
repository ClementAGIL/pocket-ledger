import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { ProgressBar, SaveBar, TextLink } from '@/components/ui';
import { QuoteRow } from '@/components/prices/QuoteRow';
import { showSaveError } from '@/components/saveError';
import * as repo from '@/db/repo';
import { today } from '@/domain/dates';
import { planQuoteSave, quoteCandidates } from '@/domain/quotes';
import type { QuoteState } from '@/quotes/fetchQuotes';
import { useConfirmLeave } from '@/hooks/useConfirmLeave';
import { useQuoteRun } from '@/hooks/useQuoteRun';
import { useData } from '@/state/DataProvider';
import { useUndo } from '@/state/UndoProvider';
import { radius, space, useTheme } from '@/theme';

/**
 * Fetches the latest price of every investment with a ticker / ISIN / coin as identifier, shows
 * old → new, and saves nothing until "Save". Only reachable when Settings › Online prices is on.
 */
export default function FetchPricesScreen() {
  const theme = useTheme();
  const { portfolio, settings, write } = useData();
  const showUndo = useUndo();

  // Frozen when the screen opens: saving refreshes the portfolio, the list must not change.
  const [candidates] = useState(() => quoteCandidates(portfolio));
  const { states, excluded, running, found, failed, done, toSave, notFound, unchangedCount, cancel, retry, toggle, tickAll } =
    useQuoteRun(candidates, settings.onlinePricesEnabled);
  const [saving, setSaving] = useState(false);

  // Ask before dropping fetched prices that were not saved.
  const { leave } = useConfirmLeave(toSave.length > 0, {
    title: 'Discard the fetched prices?',
    text: 'They have not been saved.',
    keep: 'Keep',
  });

  const save = async () => {
    if (saving || running || toSave.length === 0) return;
    setSaving(true);
    const rows = toSave.map((c) => {
      const s = states[c.assetId] as Extract<QuoteState, { status: 'found' }>;
      // Saved today, not on the market day: it is the latest price known today, and a price already
      // entered today or after the last close would otherwise stay the current one.
      return { assetId: c.assetId, date: today(), price: s.price };
    });
    const plan = planQuoteSave(rows, portfolio.pricesByAsset);
    try {
      await write(async (txn) => {
        for (const r of plan.rows) await repo.upsertPrice(txn, { ...r, source: 'online' });
      });
      showUndo(`${rows.length} price${rows.length > 1 ? 's' : ''} updated`, () =>
        write(async (txn) => {
          for (const c of plan.created) await repo.deletePriceOn(txn, c.assetId, c.date);
          for (const p of plan.replaced) {
            await repo.deletePriceOn(txn, p.assetId, p.date);
            await repo.restorePrice(txn, p);
          }
        }),
      );
      leave();
    } catch (e) {
      showSaveError(e);
      setSaving(false);
    }
  };

  if (!settings.onlinePricesEnabled) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>Turn on Settings › Online prices first.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={candidates}
        keyExtractor={(c) => String(c.assetId)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={[styles.header, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.headerLine}>
              <Text style={{ color: theme.text, fontWeight: '600', flex: 1 }}>
                {running
                  ? `Fetching… ${done} of ${candidates.length}`
                  : `${found.length} found${unchangedCount ? ` (${unchangedCount} unchanged)` : ''}${failed.length ? ` · ${failed.length} failed` : ''}${
                      done < candidates.length ? ` · ${candidates.length - done} not fetched` : ''
                    }`}
              </Text>
              {running ? (
                <TextLink title="Cancel" onPress={cancel} />
              ) : notFound.length > 0 ? (
                <TextLink title={`Retry ${notFound.length}`} onPress={() => retry(notFound)} />
              ) : null}
            </View>
            <ProgressBar progress={candidates.length ? done / candidates.length : 0} height={6} />
            {!running && found.length > 0 && (
              <View style={styles.headerLine}>
                <Text style={{ color: theme.textMuted, fontSize: 12, flex: 1 }}>
                  Ticked prices are saved when you press Save. Untick one to keep its current price.
                </Text>
                <TextLink
                  title={toSave.length ? 'Untick all' : 'Tick all'}
                  size={13}
                  onPress={() => tickAll(toSave.length === 0)}
                />
              </View>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <QuoteRow
            candidate={item}
            state={states[item.assetId] ?? { status: 'pending' }}
            excluded={excluded.has(item.assetId)}
            onToggle={() => toggle(item.assetId)}
            first={index === 0}
            last={index === candidates.length - 1}
          />
        )}
        ListEmptyComponent={
          <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: space.xl }}>
            No investment to fetch: add a ticker, ISIN or coin as the identifier of a stock, ETF or crypto.
          </Text>
        }
      />
      <SaveBar
        title={toSave.length ? `Save ${toSave.length} price${toSave.length > 1 ? 's' : ''}` : 'Nothing to save'}
        onPress={save}
        saving={saving}
        disabled={running || toSave.length === 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  content: { padding: space.lg, paddingBottom: space.xl },
  header: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.sm, marginBottom: space.lg },
  headerLine: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
