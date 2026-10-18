import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import * as repo from '@/db/repo';
import { emergencyFund, emergencyShare, isCashCategory } from '@/domain/emergency';
import { formatPercent, parseNumber } from '@/domain/format';
import { planRebalance, type RebalanceInput, type RebalanceMode, type RebalanceRow } from '@/domain/rebalance';
import { useMoney } from '@/hooks/useMoney';
import { useNumberDraft } from '@/hooks/useNumberDraft';
import { useData } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

import { Button, Card, Field, Input, Segmented, TextLink } from './ui';

/** Below this drift (in fraction) a category counts as on target. */
const ON_TARGET = 0.005;

/** Target weights by category, the current gap, and what to buy (or sell) to get back on target. */
export function TargetAllocation({ investAmount, startEditing = false }: { investAmount?: number; startEditing?: boolean }) {
  const theme = useTheme();
  const { snapshot, portfolio } = useData();
  const { money } = useMoney();
  // Opened from the emergency fund ("Adjust my Cash target"): straight into the editor.
  const [editing, setEditing] = useState(startEditing);
  const [mode, setMode] = useState<RebalanceMode>('buy-only');
  // Opened from the emergency fund with extra cash: that amount is pre-filled.
  const amount = useNumberDraft(investAmount ?? 0);

  // Every asset category that holds something or has a target.
  const values = new Map(portfolio.groups.map((g) => [g.category.id, g.value]));
  const inputs: RebalanceInput[] = snapshot.categories
    .filter((c) => c.kind === 'asset' && ((values.get(c.id) ?? 0) > 0 || c.targetWeight !== null))
    .map((c) => ({ categoryId: c.id, name: c.name, color: c.color, value: values.get(c.id) ?? 0, target: c.targetWeight }));

  const hasTargets = inputs.some((i) => i.target !== null);
  if (editing || !hasTargets) {
    return editing ? (
      <TargetEditor inputs={inputs} onDone={() => setEditing(false)} />
    ) : (
      <Card style={{ gap: space.md }}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Set your target allocation</Text>
        <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
          Choose the share you want for each category (e.g. 70% ETF, 20% cash, 10% crypto). The app shows the gap with
          today and what to buy next to get back on target.
        </Text>
        <Button title="Set targets" onPress={() => setEditing(true)} />
      </Card>
    );
  }

  const plan = planRebalance(inputs, amount.value, mode);
  const next = plan.rows.find((r) => r.action > 0.005);

  return (
    <View style={{ gap: space.md }}>
      <Card style={{ gap: space.md }}>
        <Segmented
          options={[
            { value: 'buy-only', label: 'Invest new money' },
            { value: 'full', label: 'Full rebalance' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Field
          label={mode === 'buy-only' ? 'Amount to invest (€)' : 'New money to add (€, optional)'}
          hint={mode === 'buy-only' ? 'Split across the categories below target. Nothing is sold.' : 'Buys and sells to reach every target exactly.'}>
          <Input value={amount.text} onChangeText={amount.setText} keyboardType="decimal-pad" placeholder="0" />
        </Field>
        {!plan.valid ? (
          <Text style={{ color: theme.negative }}>
            Targets add up to {formatPercent(plan.targetSum)} instead of 100%: edit them below.
          </Text>
        ) : next ? (
          <Text style={{ color: theme.text, fontSize: 15 }}>
            Next: <Text style={{ fontWeight: '700' }}>buy {money(next.action)} of {next.name}</Text>
          </Text>
        ) : mode === 'buy-only' && amount.value <= 0 ? (
          <Text style={{ color: theme.textSecondary }}>Enter an amount to see what to buy.</Text>
        ) : (
          <Text style={{ color: theme.textSecondary }}>You are on target: nothing to buy.</Text>
        )}
      </Card>

      <Card style={{ paddingVertical: space.xs }}>
        {plan.rows.map((row, i) => (
          <TargetRow key={row.categoryId} row={row} last={i === plan.rows.length - 1} />
        ))}
      </Card>

      {plan.excluded.length > 0 && (
        <Text style={{ color: theme.textMuted, fontSize: 12, marginHorizontal: space.xs }}>
          Not in the target allocation: {plan.excluded.map((e) => e.name).join(', ')}.
        </Text>
      )}
      <Button title="Edit targets" variant="secondary" onPress={() => setEditing(true)} />
    </View>
  );
}

function TargetRow({ row, last }: { row: RebalanceRow; last: boolean }) {
  const theme = useTheme();
  const { money } = useMoney();
  const onTarget = Math.abs(row.drift) < ON_TARGET && Math.abs(row.action) < 0.5;
  const points = Math.round(row.drift * 1000) / 10;
  return (
    <View style={[styles.row, { borderColor: theme.border }, last && { borderBottomWidth: 0 }]}>
      <View style={styles.rowHeader}>
        <View style={[styles.dot, { backgroundColor: row.color }]} />
        <Text style={{ color: theme.text, fontSize: 15, flex: 1 }} numberOfLines={1}>
          {row.name}
        </Text>
        <Text
          style={{
            color: row.action > 0.005 ? theme.text : row.action < -0.005 ? theme.negative : theme.textMuted,
            fontWeight: '600',
            fontVariant: ['tabular-nums'],
          }}>
          {row.action > 0.005
            ? `Buy ${money(row.action)}`
            : row.action < -0.005
              ? `Sell ${money(-row.action)}`
              : onTarget
                ? 'On target'
                : '—'}
        </Text>
      </View>
      {/* Current share as a bar, target as a tick. */}
      <View style={[styles.track, { backgroundColor: theme.surfaceAlt }]}>
        <View style={[styles.fill, { width: `${Math.min(100, row.currentWeight * 100)}%`, backgroundColor: row.color }]} />
        <View style={[styles.tick, { left: `${Math.min(100, row.target * 100)}%`, backgroundColor: theme.text }]} />
      </View>
      <Text style={{ color: theme.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] }}>
        {formatPercent(row.currentWeight)} now · target {formatPercent(row.target)}
        {Math.abs(points) >= 0.1 ? ` · ${points > 0 ? '+' : '−'}${Math.abs(points).toFixed(1)} pts` : ''}
      </Text>
    </View>
  );
}

function TargetEditor({ inputs, onDone }: { inputs: RebalanceInput[]; onDone: () => void }) {
  const theme = useTheme();
  const { write, settings } = useData();
  const { money } = useMoney({ rounded: true });
  const { yearlySpending, emergencyMonths } = settings.projection;
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(inputs.map((i) => [i.categoryId, i.target === null ? '' : String(Math.round(i.target * 1000) / 10)])),
  );

  const parsed = inputs.map((i) => ({ id: i.categoryId, raw: drafts[i.categoryId] ?? '', value: parseNumber(drafts[i.categoryId] ?? '') }));
  const invalid = parsed.some((p) => p.raw.trim() !== '' && (p.value === null || p.value < 0 || p.value > 100));
  const filled = parsed.filter((p) => p.raw.trim() !== '' && p.value !== null);
  const sum = filled.reduce((s, p) => s + (p.value ?? 0), 0);
  const canSave = !invalid && (filled.length === 0 || Math.abs(sum - 100) < 0.01);

  // Emergency fund advice on the Cash row: its target as a share of what will be rebalanced.
  const cash = inputs.find((i) => isCashCategory(i.name));
  const fund = cash ? emergencyFund(yearlySpending / 12, emergencyMonths, cash.value) : null;
  const rebalanced = inputs
    .filter((i) => i === cash || (drafts[i.categoryId] ?? '').trim() !== '')
    .reduce((t, i) => t + i.value, 0);
  const share = fund ? emergencyShare(fund.target, rebalanced) : null;
  const suggested = share === null ? null : Math.round(share * 1000) / 10;

  const save = async () => {
    await write((txn) => repo.setCategoryTargets(txn, new Map(filled.map((p) => [p.id, p.value! / 100]))));
    onDone();
  };

  const splitEvenly = () => {
    const ids = inputs.filter((i) => i.value > 0).map((i) => i.categoryId);
    if (!ids.length) return;
    const base = Math.floor((1000 / ids.length)) / 10;
    const next: Record<number, string> = Object.fromEntries(inputs.map((i) => [i.categoryId, '']));
    ids.forEach((id, k) => (next[id] = String(k === ids.length - 1 ? Math.round((100 - base * (ids.length - 1)) * 10) / 10 : base)));
    setDrafts(next);
  };

  return (
    <Card style={{ gap: space.sm }}>
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Target allocation</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
        Leave a category empty to keep it out of rebalancing (e.g. your home). Targets must add up to 100%.
      </Text>
      {inputs.map((i) => (
        <View key={i.categoryId} style={[styles.editRow, { borderColor: theme.border }]}>
          <View style={[styles.dot, { backgroundColor: i.color }]} />
          <Text style={{ color: theme.text, flex: 1 }} numberOfLines={1}>
            {i.name}
          </Text>
          <Input
            value={drafts[i.categoryId] ?? ''}
            onChangeText={(t) => setDrafts((d) => ({ ...d, [i.categoryId]: t }))}
            keyboardType="decimal-pad"
            placeholder="—"
            style={styles.pctInput}
          />
          <Text style={{ color: theme.textSecondary, width: 16 }}>%</Text>
        </View>
      ))}
      {cash && (
        <View style={[styles.advice, { backgroundColor: theme.surfaceAlt }]}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>Cash: your emergency fund</Text>
          {fund && suggested !== null ? (
            <>
              <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
                {emergencyMonths} months of expenses = {money(fund.target)} ≈ {suggested}% of the
                assets in your targets. You hold {money(fund.cash)} in cash today
                {fund.covered ? ': covered.' : '.'} More cash than that usually grows slower than inflation.
              </Text>
              <TextLink
                title={`Use ${suggested}% for Cash`}
                size={13}
                onPress={() => setDrafts((d) => ({ ...d, [cash.categoryId]: String(suggested) }))}
              />
            </>
          ) : (
            <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
              Keep 3–6 months of expenses in cash for the unexpected, and invest the rest. Enter your monthly expenses in Insights ›
              Savings › Emergency fund to get a suggested Cash target.
            </Text>
          )}
        </View>
      )}
      <View style={styles.sumRow}>
        <Text style={{ color: invalid || (filled.length > 0 && !canSave) ? theme.negative : theme.textSecondary }}>
          Total {Math.round(sum * 10) / 10}%{filled.length > 0 && !canSave && !invalid ? ' — must be 100%' : ''}
          {invalid ? ' — each target must be between 0 and 100' : ''}
        </Text>
        <TextLink title="Equal split" onPress={splitEvenly} />
      </View>
      <View style={styles.buttons}>
        <Button title="Save targets" onPress={save} disabled={!canSave} style={{ flex: 1 }} />
        <Button title="Cancel" variant="secondary" onPress={onDone} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.md, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  track: { height: 8, borderRadius: 4, overflow: 'visible', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  tick: { position: 'absolute', width: 2, height: 14, marginLeft: -1, borderRadius: 1 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  pctInput: { width: 76, textAlign: 'right', minHeight: 40 },
  advice: { borderRadius: 12, padding: space.md, gap: 6, marginTop: space.md },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm },
  buttons: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
});
