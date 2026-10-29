import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { showSaveError } from '@/components/saveError';
import { Card, Input, SaveBar } from '@/components/ui';
import * as repo from '@/db/repo';
import { formatDate, formatNumber, parseNumber } from '@/domain/format';
import { draftOccurrences, dueOccurrences, occurrenceRecords, type Occurrence } from '@/domain/schedules';
import type { ISODate } from '@/domain/types';
import { useMoney } from '@/hooks/useMoney';
import { useData, useToday } from '@/state/DataProvider';
import { useUndo } from '@/state/UndoProvider';
import { radius, space, useTheme } from '@/theme';

/** What the user typed for one occurrence (strings, as typed). */
interface LineDraft {
  save: boolean;
  amount: string;
  price: string;
  interest: string;
}

const text = (n: number | null) => (n === null ? '' : formatNumber(n));
const keyOf = (o: Occurrence) => `${o.schedule.id}-${o.date}`;

/** Scheduled operations due: each one is checked (amount, price, interest), then all are saved at once. */
export default function ScheduledScreen() {
  const theme = useTheme();
  const now = useToday();
  const { snapshot, portfolio, write } = useData();
  const showUndo = useUndo();
  // Fixed when the screen opens: saving refreshes the data, the list must not change under the user.
  const [occurrences] = useState(() => dueOccurrences(snapshot.schedules, portfolio.byAssetId, now));
  const [lines, setLines] = useState<Record<string, LineDraft>>(() => {
    const drafts = draftOccurrences(occurrences, (id) => portfolio.byAssetId.get(id)?.position.price ?? null);
    return Object.fromEntries(
      occurrences.map((o, i) => [keyOf(o), { save: true, amount: text(drafts[i].amount), price: text(drafts[i].price), interest: text(drafts[i].interest) }]),
    );
  });
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const results = useMemo(
    () =>
      occurrences.map((o) => {
        const l = lines[keyOf(o)];
        if (!l.save) return null;
        const draft = {
          amount: parseNumber(l.amount) ?? 0,
          price: parseNumber(l.price),
          interest: o.view.isLiability && o.schedule.rate !== null ? (parseNumber(l.interest) ?? 0) : null,
        };
        return occurrenceRecords(o, draft, o.schedule.cashAssetId);
      }),
    [occurrences, lines],
  );
  const update = (key: string, patch: Partial<LineDraft>) => setLines((ls) => ({ ...ls, [key]: { ...ls[key], ...patch } }));
  const count = results.filter((r) => r && 'records' in r).length;
  const hasErrors = results.some((r) => r && 'error' in r);

  const save = async () => {
    setSubmitted(true);
    if (hasErrors) return;
    setSaving(true);
    const items = occurrences.map((o, i) => {
      const r = results[i];
      return { scheduleId: o.schedule.id, date: o.date, records: r && 'records' in r ? r.records : null };
    });
    const previous = new Map<number, ISODate | null>(occurrences.map((o) => [o.schedule.id, o.schedule.doneUntil]));
    try {
      const ids = await write((txn) => repo.saveScheduled(txn, items));
      router.back();
      showUndo(count === 0 ? 'Skipped' : `${count} ${count > 1 ? 'operations' : 'operation'} saved`, () =>
        write((txn) => repo.undoScheduled(txn, ids, previous)),
      );
    } catch (e) {
      setSaving(false);
      showSaveError(e);
    }
  };

  if (occurrences.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.background }]}>
        <Ionicons name="checkmark-circle" size={32} color={theme.positive} />
        <Text style={{ color: theme.text }}>Nothing due: all scheduled operations are up to date.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={occurrences}
        keyExtractor={keyOf}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: space.sm }}>
            Check each amount{occurrences.some((o) => o.schedule.type === 'BUY') ? ' and the price you got' : ''}, then save. An
            unticked line is skipped and won’t be proposed again.
          </Text>
        }
        renderItem={({ item: o, index }) => {
          const key = keyOf(o);
          const r = results[index];
          return (
            <OccurrenceLine
              occurrence={o}
              line={lines[key]}
              error={submitted && r && 'error' in r ? r.error : null}
              principal={r && 'records' in r && o.view.isLiability ? r.records.main.amount : null}
              onChange={(patch) => update(key, patch)}
            />
          );
        }}
      />
      <SaveBar
        title={count === 0 ? 'Skip all' : `Save ${count} ${count > 1 ? 'operations' : 'operation'}`}
        onPress={save}
        saving={saving}
        disabled={submitted && hasErrors}
      />
    </KeyboardAvoidingView>
  );
}

function OccurrenceLine({
  occurrence: o,
  line,
  error,
  principal,
  onChange,
}: {
  occurrence: Occurrence;
  line: LineDraft;
  error: string | null;
  principal: number | null;
  onChange: (patch: Partial<LineDraft>) => void;
}) {
  const theme = useTheme();
  const { portfolio } = useData();
  const { money, hidden } = useMoney();
  const { schedule: s, view, date } = o;
  const cash = s.cashAssetId !== null ? portfolio.byAssetId.get(s.cashAssetId)?.asset.name : null;
  const isLoan = view.isLiability && s.rate !== null;
  const muted = !line.save;
  return (
    <Card style={[styles.card, muted && { opacity: 0.6 }]}>
      <Pressable
        onPress={() => onChange({ save: !line.save })}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: line.save }}
        style={styles.header}>
        <Ionicons name={line.save ? 'checkbox' : 'square-outline'} size={22} color={line.save ? theme.primary : theme.textMuted} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '600' }}>
            {view.asset.name}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
            {formatDate(date)}
            {cash ? ` · ${s.type === 'WITHDRAW' && !view.isLiability ? 'into' : 'from'} ${cash}` : ''}
          </Text>
        </View>
      </Pressable>
      {line.save ? (
        <>
          <View style={styles.inputs}>
            <Labeled label="Amount (€)">
              <Input value={line.amount} onChangeText={(amount) => onChange({ amount })} keyboardType="decimal-pad" secureTextEntry={hidden} />
            </Labeled>
            {s.type === 'BUY' && (
              <Labeled label="Unit price (€)">
                <Input value={line.price} onChangeText={(price) => onChange({ price })} keyboardType="decimal-pad" placeholder="Price" />
              </Labeled>
            )}
            {isLoan && (
              <Labeled label="Interest (€)">
                <Input value={line.interest} onChangeText={(interest) => onChange({ interest })} keyboardType="decimal-pad" secureTextEntry={hidden} />
              </Labeled>
            )}
          </View>
          {principal !== null && isLoan && (
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              {money(principal)} repaid. Adjust the interest to your bank’s statement if it differs.
            </Text>
          )}
          {error && <Text style={{ color: theme.negative, fontSize: 13 }}>{error}</Text>}
        </>
      ) : (
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>Skipped</Text>
      )}
    </Card>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  card: { gap: space.sm, borderRadius: radius.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  inputs: { flexDirection: 'row', gap: space.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
});
