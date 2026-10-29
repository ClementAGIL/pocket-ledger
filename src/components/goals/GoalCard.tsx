import { StyleSheet, Text, View } from 'react-native';

import { goalProgress } from '@/domain/emergency';
import { formatPercent } from '@/domain/format';
import { FIRE_WITHDRAWAL_RATE, fireTarget, type GoalMode, type ProjectionSettings } from '@/domain/projection';
import { useMoney } from '@/hooks/useMoney';
import type { NumberDraft } from '@/hooks/useNumberDraft';
import { space, useTheme } from '@/theme';

import { Card, Field, Input, ProgressBar, Segmented } from '../ui';
import { goalStyles, type SaveProjection } from './styles';

/** Goals › the target: an amount or FIRE (from yearly spending), and how far today's assets are. */
export function GoalCard({
  s,
  save,
  goalDraft,
  spendingDraft,
  goal,
  start,
}: {
  s: ProjectionSettings;
  save: SaveProjection;
  goalDraft: NumberDraft;
  spendingDraft: NumberDraft;
  /** The amount to reach, null when no goal is set. */
  goal: number | null;
  /** Assets today. */
  start: number;
}) {
  const theme = useTheme();
  const { money, hidden } = useMoney({ rounded: true });
  const progress = goal === null ? 0 : goalProgress(start, goal);
  return (
    <Card>
      <Text style={[goalStyles.cardTitle, { color: theme.text }]}>Goal</Text>
      <View style={{ marginTop: space.md }}>
        <Segmented<GoalMode>
          options={[
            { value: 'amount', label: 'Amount' },
            { value: 'fire', label: 'FIRE' },
          ]}
          value={s.goalMode}
          onChange={(goalMode) => save({ goalMode })}
        />
      </View>
      {s.goalMode === 'amount' ? (
        <Field label="Target (€)" hint="Leave empty for no goal.">
          <Input
            value={goalDraft.text}
            onChangeText={goalDraft.setText}
            onEndEditing={() => save({ goalAmount: s.goalAmount })}
            keyboardType="decimal-pad"
            placeholder="500000"
            secureTextEntry={hidden}
          />
        </Field>
      ) : (
        <Field
          label="Yearly spending (€)"
          hint={
            s.yearlySpending > 0
              ? `FIRE number: ${money(fireTarget(s.yearlySpending))} (${Math.round(1 / FIRE_WITHDRAWAL_RATE)}× your yearly spending, the "4% rule").`
              : `Financial independence: assets that can pay your yearly spending at ${formatPercent(FIRE_WITHDRAWAL_RATE)} a year.`
          }>
          <Input
            value={spendingDraft.text}
            onChangeText={spendingDraft.setText}
            onEndEditing={() => save({ yearlySpending: s.yearlySpending })}
            keyboardType="decimal-pad"
            placeholder="30000"
            secureTextEntry={hidden}
          />
        </Field>
      )}
      {goal !== null && (
        <View style={{ marginTop: space.md, gap: 6 }}>
          <View style={styles.barLabels}>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              Today {money(start)} of {money(goal)}
            </Text>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>{formatPercent(progress)}</Text>
          </View>
          <ProgressBar progress={progress} color={theme.primary} />
          {s.goalMode === 'fire' && (
            // What today's assets could already pay for under the same 4% rule.
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              With your current investments ({money(start)}), you can cover{' '}
              <Text style={{ color: theme.text, fontWeight: '600' }}>{money(Math.max(start, 0) * FIRE_WITHDRAWAL_RATE)}</Text> of yearly
              spending ({money((Math.max(start, 0) * FIRE_WITHDRAWAL_RATE) / 12)}/month).
            </Text>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
});
