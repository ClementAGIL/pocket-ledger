import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { cashAdvice, cashTargetAmount, cashValue, EMERGENCY_MONTHS, emergencyFund, isCashCategory } from '@/domain/emergency';
import { formatDuration, formatPercent } from '@/domain/format';
import { savingPace } from '@/domain/projection';
import { useMoney } from '@/hooks/useMoney';
import { useNumberDraft } from '@/hooks/useNumberDraft';
import { useData, useToday } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

import { Card, Chips, Field, Input, ProgressBar, StatusLine, TextLink } from './ui';

/**
 * Cash kept for a few months of expenses (Insights › Savings). Expenses are the Goals section's
 * yearly spending (FIRE) / 12: one saved number for both.
 */
export function EmergencyFund({
  onInvest,
  onEditTargets,
}: {
  /** Opens Targets › Invest new money with this amount. */
  onInvest?: (amount: number) => void;
  /** Opens the target editor. */
  onEditTargets?: () => void;
}) {
  const theme = useTheme();
  const { snapshot, portfolio, settings, updateSettings } = useData();
  const { money, hidden } = useMoney({ rounded: true });
  const projection = settings.projection;
  const draft = useNumberDraft(projection.yearlySpending / 12, { decimals: 0 });

  const monthly = Math.max(0, draft.value);
  const save = (patch: Partial<typeof projection>) =>
    updateSettings({ projection: { ...projection, yearlySpending: monthly * 12, ...patch } });

  const now = useToday();
  const pace = useMemo(() => savingPace(snapshot, now), [snapshot, now]);
  const fund = emergencyFund(monthly, projection.emergencyMonths, cashValue(portfolio));
  // At the current saving pace, how long to fill what's missing.
  const fillMonths = fund && !fund.covered && pace.yearly > 0 ? Math.ceil(fund.missing / (pace.yearly / 12)) : null;
  // Cash beyond the emergency fund: to invest if over the Cash target too, else kept on purpose.
  const advice = fund ? cashAdvice(fund, cashTargetAmount(portfolio)) : null;
  const cashTarget = snapshot.categories.find((c) => c.kind === 'asset' && isCashCategory(c.name))?.targetWeight ?? null;

  return (
    <>
      <Card>
        <View style={styles.title}>
          <Ionicons name="umbrella-outline" size={20} color={theme.text} />
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Emergency fund</Text>
        </View>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          Keep a few months of expenses in cash (Cash category) for the unexpected, before investing for the long term.
        </Text>
        <Field label="Monthly expenses (€)" hint="Also used as your yearly spending in Goals › FIRE.">
          <Input
            value={draft.text}
            onChangeText={draft.setText}
            onEndEditing={() => save({})}
            keyboardType="decimal-pad"
            placeholder="2500"
            secureTextEntry={hidden}
          />
        </Field>
        <View style={{ marginTop: space.md }}>
          <Chips
            options={EMERGENCY_MONTHS.map((m) => ({ value: String(m), label: `${m} months` }))}
            value={String(projection.emergencyMonths)}
            onChange={(v) => save({ emergencyMonths: Number(v) })}
          />
        </View>
        {fund ? (
          <View style={{ marginTop: space.md, gap: 6 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              Cash today {money(fund.cash)} · target {money(fund.target)}
            </Text>
            <ProgressBar progress={fund.progress} color={fund.covered ? theme.positive : theme.staleWarning} />
            <StatusLine
              icon={fund.covered ? 'checkmark-circle' : 'alert-circle-outline'}
              color={fund.covered ? theme.positive : theme.staleWarning}>
              {fund.covered
                  ? `Covered: ${fund.monthsCovered.toFixed(1)} months of expenses (${Math.round(fund.ratio * 100)}%).`
                  : `${money(fund.missing)} to put aside (${fund.monthsCovered.toFixed(1)} of ${projection.emergencyMonths} months covered).`}
              {fillMonths !== null ? ` At your saving pace: about ${formatDuration(fillMonths)}.` : ''}
            </StatusLine>
            {advice?.kind === 'excess' && (
              <View style={[styles.target, { borderColor: theme.border }]}>
                <StatusLine icon="trending-down-outline" color={theme.staleWarning} textColor={theme.textSecondary}>
                  You have <Text style={{ color: theme.text, fontWeight: '600' }}>{money(advice.excess)}</Text> more cash than
                    you need. Beyond{' '}
                    {advice.basis === 'target'
                      ? `your Cash target (${formatPercent(cashTarget ?? 0)} = ${money(advice.keep)})`
                      : `${projection.emergencyMonths} months of expenses (${money(advice.keep)})`}
                  , cash loses value to inflation: consider investing it.
                </StatusLine>
                {onInvest && (
                  <TextLink
                    title={`See what to buy with ${money(advice.excess)}`}
                    weight="500"
                    chevron
                    role="link"
                    onPress={() => onInvest(advice.excess)}
                  />
                )}
              </View>
            )}
            {advice?.kind === 'held-for-target' && (
              <View style={[styles.target, { borderColor: theme.border }]}>
                <StatusLine icon="information-circle-outline" color={theme.textSecondary} textColor={theme.textSecondary}>
                  You have {money(advice.surplus)} more than your emergency fund, but your Cash target (
                    {formatPercent(cashTarget ?? 0)} = {money(advice.targetAmount)}) asks for more cash: so this surplus is
                  kept as cash, not advised for investing. To invest it, lower your Cash target.
                </StatusLine>
                {onEditTargets && <TextLink title="Adjust my Cash target" weight="500" chevron role="link" onPress={onEditTargets} />}
              </View>
            )}
          </View>
        ) : (
          <Text style={[styles.hint, { color: theme.textMuted }]}>Enter your monthly expenses to see your target.</Text>
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  hint: { fontSize: 12, marginTop: space.sm, lineHeight: 17 },
  target: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: space.sm, paddingTop: space.sm, gap: 6 },
});
