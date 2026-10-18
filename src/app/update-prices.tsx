import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { useOnlinePricesEntry } from '@/components/OnlinePricesIntro';
import { PriceRow } from '@/components/prices/PriceRow';
import { Button, Card, Field, SaveBar, SectionTitle } from '@/components/ui';
import { showSaveError } from '@/components/saveError';
import * as repo from '@/db/repo';
import { today } from '@/domain/dates';
import { planPriceUpdates } from '@/domain/priceUpdates';
import { quoteCandidates } from '@/domain/quotes';
import type { ISODate } from '@/domain/types';
import { useConfirmLeave } from '@/hooks/useConfirmLeave';
import { useData } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

/**
 * Updates the price (or value / balance) of every open investment in one pass, all at the same date.
 * Empty fields are left untouched.
 */
export default function UpdatePricesScreen() {
  const theme = useTheme();
  const { portfolio, write } = useData();
  const [date, setDate] = useState<ISODate>(today());
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const inputs = useRef(new Map<number, TextInput>());

  const sections = portfolio.groups
    .map((g) => ({ category: g.category, items: g.items.filter((v) => !v.asset.archived && !v.isClosed) }))
    .filter((s) => s.items.length > 0);
  const order = sections.flatMap((s) => s.items.map((v) => v.asset.id));

  const { updates, invalid } = planPriceUpdates(drafts);
  const fetchable = quoteCandidates(portfolio).length;
  const online = useOnlinePricesEntry();
  const hasEdits = Object.values(drafts).some((d) => d.trim() !== '');
  const { leave } = useConfirmLeave(hasEdits, {
    title: 'Discard your changes?',
    text: 'The prices you entered have not been saved.',
    keep: 'Keep editing',
  });

  const focusNext = (assetId: number) => {
    const next = order[order.indexOf(assetId) + 1];
    if (next !== undefined) inputs.current.get(next)?.focus();
    else inputs.current.get(assetId)?.blur();
  };

  const save = async () => {
    if (updates.length === 0 || invalid.size > 0 || saving) return;
    setSaving(true);
    try {
      await write(async (txn) => {
        for (const u of updates) await repo.upsertPrice(txn, { assetId: u.assetId, date, price: u.price });
      });
      leave();
    } catch (e) {
      showSaveError(e);
      setSaving(false);
    }
  };

  const saveLabel =
    invalid.size > 0
      ? `Fix ${invalid.size} invalid ${invalid.size > 1 ? 'entries' : 'entry'}`
      : updates.length === 0
        ? 'Enter at least one price'
        : `Save ${updates.length} ${updates.length > 1 ? 'updates' : 'update'}`;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Always offered so the feature can be discovered; when off, it explains and offers to turn it on. */}
        <Button
          title={online.enabled && fetchable ? `Fetch prices online (${fetchable})` : 'Fetch prices online'}
          variant="outline"
          icon="sync-outline"
          disabled={online.enabled && fetchable === 0}
          onPress={online.open}
        />
        {online.enabled && fetchable === 0 && (
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: space.xs }}>
            Add a ticker (GOOG, IWDA.AS), an ISIN or a coin (BTC) as the identifier of an investment to fetch its price.
          </Text>
        )}
        <Field label="Date of these prices" hint="Leave a field empty to keep its current price.">
          <DateField value={date} onChange={setDate} />
        </Field>

        {sections.length === 0 && (
          <Text style={{ color: theme.textMuted, marginTop: space.xl, textAlign: 'center' }}>No open investments.</Text>
        )}

        {sections.map((s) => (
          <View key={s.category.id}>
            <SectionTitle>{s.category.name}</SectionTitle>
            <Card style={{ paddingVertical: 0 }}>
              {s.items.map((v, i) => (
                <PriceRow
                  key={v.asset.id}
                  view={v}
                  last={i === s.items.length - 1}
                  value={drafts[v.asset.id] ?? ''}
                  invalid={invalid.has(v.asset.id)}
                  onChange={(text) => setDrafts((prev) => ({ ...prev, [v.asset.id]: text }))}
                  onSubmit={() => focusNext(v.asset.id)}
                  isLastInput={v.asset.id === order[order.length - 1]}
                  inputRef={(el) => {
                    if (el) inputs.current.set(v.asset.id, el);
                    else inputs.current.delete(v.asset.id);
                  }}
                />
              ))}
            </Card>
          </View>
        ))}
      </ScrollView>

      <SaveBar title={saveLabel} onPress={save} saving={saving} disabled={updates.length === 0 || invalid.size > 0} />
      {online.intro}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl * 2 },
});
