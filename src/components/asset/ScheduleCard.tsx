import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Money, Row, SectionTitle, TextLink } from '@/components/ui';
import { formatDate, formatDuration, formatPercent } from '@/domain/format';
import type { AssetView } from '@/domain/portfolio';
import { interestPaid, loanPayoff, monthlyInterest, nextDate, repayOrInvest, scheduleLabel } from '@/domain/schedules';
import type { Schedule } from '@/domain/types';
import { useMoney } from '@/hooks/useMoney';
import { useData, useToday } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

/**
 * Investment page: its scheduled operations (each opens its editor) and, for a loan, the loan
 * details: interest, payoff date, and whether repaying early beats investing.
 */
export function ScheduleCard({ view }: { view: AssetView }) {
  const theme = useTheme();
  const { snapshot, portfolio, returns } = useData();
  const { asset, isLiability } = view;
  const schedules = snapshot.schedules.filter((x) => x.assetId === asset.id);
  const open = (id?: number) =>
    router.push({ pathname: '/schedule', params: id ? { asset: String(asset.id), id: String(id) } : { asset: String(asset.id) } });
  const paid = isLiability ? interestPaid(portfolio.txByAsset.get(asset.id) ?? []) : 0;
  const loan = isLiability ? schedules.find((x) => x.rate !== null) : undefined;

  if ((view.isClosed || asset.archived) && schedules.length === 0) return null;
  return (
    <>
    <SectionTitle>{isLiability ? 'Payments' : 'Scheduled'}</SectionTitle>
    <Card style={{ gap: space.sm }}>
      {schedules.length === 0 && (
        <Text style={{ color: theme.textMuted }}>
          {isLiability
            ? 'Add the monthly payment (and the rate) to see the payoff date and the interest, and confirm each payment in one tap.'
            : 'A monthly buy, deposit or withdrawal: the app proposes it when it’s due, you confirm or adjust it.'}
        </Text>
      )}
      {schedules.map((x) => (
        <ScheduleRow key={x.id} schedule={x} isLiability={isLiability} onPress={() => open(x.id)} />
      ))}
      {schedules.length === 0 ? (
        <Button title={isLiability ? 'Add the monthly payment' : 'Schedule an operation'} variant="outline" icon="repeat" onPress={() => open()} />
      ) : (
        !isLiability && <TextLink title="Schedule another" size={13} icon="add" onPress={() => open()} />
      )}

      {loan && <LoanDetails view={view} loan={loan} investRate={returns.total.meaningful ? returns.total.rate : null} />}
      {isLiability && paid > 0 && (
        <Row label="Interest paid so far">
          <Money value={paid} />
        </Row>
      )}
      {isLiability && !loan && schedules.length > 0 && (
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>Add the yearly rate to split each payment into interest and principal.</Text>
      )}
    </Card>
    </>
  );
}

function ScheduleRow({ schedule: x, isLiability, onPress }: { schedule: Schedule; isLiability: boolean; onPress: () => void }) {
  const theme = useTheme();
  const now = useToday();
  const { portfolio } = useData();
  const { money } = useMoney();
  const cash = x.cashAssetId !== null ? portfolio.byAssetId.get(x.cashAssetId)?.asset.name : null;
  const details = [
    `next ${formatDate(nextDate(x, now))}`,
    x.rate !== null && `at ${formatPercent(x.rate)}/yr`,
    cash && (x.type === 'WITHDRAW' && !isLiability ? `into ${cash}` : `from ${cash}`),
  ].filter(Boolean);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Tap to edit" style={styles.row}>
      <Ionicons name="repeat" size={18} color={theme.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text }}>{scheduleLabel(x, isLiability, money(x.amount))}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>{details.join(' · ')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
    </Pressable>
  );
}

function LoanDetails({ view, loan, investRate }: { view: AssetView; loan: Schedule; investRate: number | null }) {
  const theme = useTheme();
  const now = useToday();
  const balance = view.position.value;
  const rate = loan.rate!;
  // From the last payment done (or today), with the balance as it is now.
  const after = loan.doneUntil && loan.doneUntil > now ? loan.doneUntil : now;
  const payoff = loanPayoff(balance, rate, loan.amount, loan.day, after);
  const advice = investRate !== null ? repayOrInvest(rate, investRate) : null;
  const r = formatPercent(rate);
  return (
    <View style={[styles.loan, { borderColor: theme.border }]}>
      <Row label="Interest this month">
        <Money value={monthlyInterest(balance, rate)} />
      </Row>
      {payoff ? (
        <>
          <Row label="Paid off">{`${formatDate(payoff.date)} (${formatDuration(payoff.payments)})`}</Row>
          <Row label="Interest left to pay">
            <Money value={payoff.interest} />
          </Row>
        </>
      ) : (
        <Text style={{ color: theme.negative, fontSize: 13 }}>The payment doesn’t cover the interest: the balance never goes down.</Text>
      )}
      <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
        {advice === null
          ? `Repay early or invest? Repaying early is a sure ${r}/yr. After a year of history, your own return is compared here.`
          : advice === 'repay'
            ? `Repay early or invest? Your loan costs ${r}/yr, more than your investments’ ${formatPercent(investRate)}/yr: extra money repaying it earns a sure ${r}.`
            : advice === 'invest'
              ? `Repay early or invest? Your loan costs ${r}/yr, less than your investments’ ${formatPercent(investRate)}/yr: investing extra money has earned more, with ups and downs. Repaying early is a sure ${r}.`
              : `Repay early or invest? Your loan costs about what your investments earn (${r} vs ${formatPercent(investRate)}/yr): repaying early is the safer choice.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  loan: { gap: space.xs, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm, marginTop: space.xs },
});
