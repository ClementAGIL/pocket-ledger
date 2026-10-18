import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatPercent } from '@/domain/format';
import { goalOf, inflationOf, rateOf, realRate, savingPace, type ProjectionSettings, type RateChoice } from '@/domain/projection';
import { useMoney } from '@/hooks/useMoney';
import { useNumberDraft } from '@/hooks/useNumberDraft';
import { useData, useToday } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

import { GoalCard } from './goals/GoalCard';
import { GrowthCard } from './goals/GrowthCard';
import { ProjectionCard } from './goals/ProjectionCard';
import { SavingCard } from './goals/SavingCard';

/**
 * Insights › Goals: your assets projected at a growth rate and a yearly saving, and when you reach
 * a goal. Holds the choices (saved in `settings.projection`) and the number drafts; each card shows
 * one part (components/goals/).
 */
export function Simulation() {
  const theme = useTheme();
  const { snapshot, portfolio, returns, settings, updateSettings } = useData();
  const { money } = useMoney({ rounded: true });
  const saved = settings.projection;

  // Number inputs: shown as typed, saved when editing ends.
  const rateDraft = useNumberDraft(saved.customRate, { scale: 100 });
  const savingDraft = useNumberDraft(saved.customSaving);
  const goalDraft = useNumberDraft(saved.goalAmount);
  const spendingDraft = useNumberDraft(saved.yearlySpending);
  const inflationDraft = useNumberDraft(saved.customInflation, { scale: 100 });

  // Live values: what's being typed counts right away, it's saved when editing ends.
  const s: ProjectionSettings = {
    ...saved,
    customRate: rateDraft.value,
    customSaving: savingDraft.value,
    goalAmount: Math.max(0, goalDraft.value),
    yearlySpending: Math.max(0, spendingDraft.value),
    customInflation: Math.min(Math.max(inflationDraft.value, 0), 0.2),
  };
  // Saves the live values too, so a draft still being typed isn't lost by another change.
  const save = (patch: Partial<ProjectionSettings>) => updateSettings({ projection: { ...s, ...patch } });

  const now = useToday();
  const pace = useMemo(() => savingPace(snapshot, now), [snapshot, now]);
  const mine = returns.total.meaningful ? returns.total.rate : null;
  const rateChoice: RateChoice = s.rate === 'mine' && mine === null ? '7' : s.rate;
  const rate = rateOf({ ...s, rate: rateChoice }, mine);
  const start = portfolio.summary.assetsValue;
  const inflation = inflationOf(s);
  // In today's euros: growth in purchasing power; the saving stays constant in today's money.
  const growth = realRate(rate, inflation);
  const plan = { start, yearlySaving: s.saving === 'mine' ? pace.yearly : s.customSaving, rate: growth };
  const goal = goalOf(s);

  return (
    <View style={{ gap: space.md }}>
      <GoalCard s={s} save={save} goalDraft={goalDraft} spendingDraft={spendingDraft} goal={goal} start={start} />
      <ProjectionCard s={s} save={save} plan={plan} goal={goal} rate={rate} inflation={inflation} />
      <GrowthCard
        s={s}
        save={save}
        rateDraft={rateDraft}
        inflationDraft={inflationDraft}
        mine={mine}
        rateChoice={rateChoice}
        rate={rate}
        inflation={inflation}
        growth={growth}
      />
      <SavingCard s={s} save={save} savingDraft={savingDraft} pace={pace} />

      <Text style={[styles.footnote, { color: theme.textMuted }]}>
        A simulation, not a forecast. Starts from your assets today ({money(start)}, debts excluded), grows at a steady
        rate with the saving added each month.{' '}
        {inflation > 0 ? `Amounts are in today’s euros (${formatPercent(inflation)} inflation a year removed).` : 'Amounts are in future euros (inflation not removed).'}{' '}
        Real returns vary from year to year.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footnote: { fontSize: 12, marginHorizontal: space.xs, lineHeight: 17 },
});
