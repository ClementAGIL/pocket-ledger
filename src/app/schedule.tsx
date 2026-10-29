import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { DateField } from '@/components/DateField';
import { showSaveError } from '@/components/saveError';
import { Select } from '@/components/Select';
import { Button, Chips, Field, Input, Row } from '@/components/ui';
import * as repo from '@/db/repo';
import { today } from '@/domain/dates';
import { isCashCategory } from '@/domain/emergency';
import { formatDate, formatNumber } from '@/domain/format';
import { loanSplit, ordinal, scheduleTypes, validateSchedule, type ScheduleDraft } from '@/domain/schedules';
import { useConfirmLeave } from '@/hooks/useConfirmLeave';
import { useMoney } from '@/hooks/useMoney';
import { useData } from '@/state/DataProvider';
import { useUndo } from '@/state/UndoProvider';
import { space, useTheme } from '@/theme';

/** Add / edit a scheduled operation (?asset=ID, &id=SID to edit): a monthly buy, deposit, withdrawal or loan payment. */
export default function ScheduleScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ asset: string; id?: string }>();
  const { snapshot, portfolio, write } = useData();
  const { money, hidden } = useMoney();
  const showUndo = useUndo();
  const view = portfolio.byAssetId.get(Number(params.asset));
  const editing = params.id ? snapshot.schedules.find((s) => s.id === Number(params.id)) : undefined;

  const types = view ? scheduleTypes(view) : [];
  const [initial] = useState<ScheduleDraft>(() =>
    editing
      ? {
          type: editing.type,
          amount: formatNumber(editing.amount),
          day: editing.day,
          startDate: editing.startDate,
          cashAssetId: editing.cashAssetId,
          rate: editing.rate === null ? '' : formatNumber(editing.rate * 100),
        }
      : { type: types[0]?.value ?? 'BUY', amount: '', day: Number(today().slice(8, 10)), startDate: today(), cashAssetId: null, rate: '' },
  );
  const [draft, setDraft] = useState(initial);
  const [dayText, setDayText] = useState(String(initial.day));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const { leave } = useConfirmLeave(dirty && !saving, {
    title: 'Discard changes?',
    text: 'This scheduled operation isn’t saved.',
    keep: 'Keep editing',
  });

  if (!view) return null;
  const isLiability = view.isLiability;
  const update = (patch: Partial<ScheduleDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const result = validateSchedule(draft, view.asset.id, isLiability);
  const errors = submitted && 'errors' in result ? result.errors : {};

  const cashOptions = portfolio.groups
    .filter((g) => !g.items[0]?.isLiability && isCashCategory(g.category.name))
    .flatMap((g) => g.items)
    .filter((v) => !v.asset.archived && v.asset.id !== view.asset.id)
    .map((v) => ({ value: v.asset.id, label: v.asset.name, description: v.account.name, color: v.category.color }));
  const intoCash = draft.type === 'WITHDRAW' && !isLiability;
  // What the first payment of a loan would be made of, at today's balance.
  const split = isLiability && 'input' in result && result.input.rate !== null ? loanSplit(view.position.value, result.input.rate, result.input.amount) : null;

  const save = async () => {
    setSubmitted(true);
    if (!('input' in result)) return;
    setSaving(true);
    try {
      const input = result.input;
      await write(async (txn) => {
        if (editing) await repo.updateSchedule(txn, editing.id, input, input.startDate !== editing.startDate);
        else await repo.insertSchedule(txn, input);
      });
      leave();
    } catch (e) {
      setSaving(false);
      showSaveError(e);
    }
  };

  const remove = () => {
    if (!editing) return;
    Alert.alert('Delete this scheduled operation?', 'Operations already saved stay in the history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await write((txn) => repo.deleteSchedule(txn, editing.id));
            leave();
            showUndo('Scheduled operation deleted', () => write((txn) => repo.restoreSchedule(txn, editing)));
          } catch (e) {
            setSaving(false);
            showSaveError(e);
          }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: editing ? 'Scheduled operation' : 'Schedule an operation' }} />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={{ color: theme.textSecondary }}>
          {view.asset.name} · {view.account.name}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>
          When it’s due, Home reminds you: you check the amount{view.asset.valuation === 'units' ? ' and the price' : ''}, then save. Nothing is added on its own.
        </Text>

        {types.length > 1 && <Chips options={types} value={draft.type} onChange={(type) => update({ type })} />}

        <Field label={isLiability ? 'Monthly payment (€)' : 'Amount (€)'} error={errors.amount}>
          <Input value={draft.amount} onChangeText={(amount) => update({ amount })} keyboardType="decimal-pad" placeholder="0" secureTextEntry={hidden} />
        </Field>

        {isLiability && (
          <Field
            label="Yearly interest rate (%)"
            error={errors.rate}
            hint={
              split
                ? `This month: ${money(split.interest)} of interest, ${money(split.principal)} repaid.`
                : 'Optional: splits each payment into interest and principal, and gives the payoff date.'
            }>
            <Input value={draft.rate} onChangeText={(rate) => update({ rate })} keyboardType="decimal-pad" placeholder="e.g. 3,5" />
          </Field>
        )}

        <Field label="Day of the month" hint={`On the ${ordinal(draft.day)} (the last day in shorter months).`}>
          <Input
            value={dayText}
            keyboardType="number-pad"
            maxLength={2}
            onChangeText={(t) => {
              setDayText(t);
              const n = Number(t);
              if (Number.isInteger(n) && n >= 1 && n <= 31) update({ day: n });
            }}
            onBlur={() => setDayText(String(draft.day))}
          />
        </Field>

        <Field label="Starting" hint={editing ? 'Changing it proposes the operations again from that date.' : 'Months from this date on are proposed, the past ones too.'}>
          <DateField value={draft.startDate} onChange={(startDate) => update({ startDate })} allowFuture />
        </Field>

        <Field
          label={intoCash ? 'Paid into' : 'Paid from'}
          hint={
            cashOptions.length === 0
              ? 'Add a cash account (Cash category) to keep its balance up to date automatically.'
              : 'Optional: the cash account is updated with the same amount.'
          }>
          <Select
            title={intoCash ? 'Paid into' : 'Paid from'}
            placeholder="Not tracked"
            options={[{ value: 0, label: 'Not tracked', description: 'Only this investment changes' }, ...cashOptions]}
            value={draft.cashAssetId ?? 0}
            onChange={(id) => update({ cashAssetId: id === 0 ? null : id })}
          />
        </Field>

        {editing?.doneUntil && (
          <Row label="Done up to">{formatDate(editing.doneUntil)}</Row>
        )}

        <Button title={saving ? 'Saving…' : 'Save'} onPress={save} disabled={saving} style={{ marginTop: space.lg }} />
        {editing && <Button title="Delete" variant="danger" icon="trash-outline" onPress={remove} disabled={saving} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 3 },
});
