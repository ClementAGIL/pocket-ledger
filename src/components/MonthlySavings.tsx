import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { addMonths } from '@/domain/dates';
import { firstMonth, monthlySavings, monthOf } from '@/domain/savings';
import { useMoney } from '@/hooks/useMoney';
import { useData, useToday } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

import { EmergencyFund } from './EmergencyFund';
import { formatMonth, SavingsChart } from './SavingsChart';
import { Card, Money, Segmented, Stat } from './ui';

type Range = '12M' | '24M' | 'ALL';

const RANGES: { value: Range; label: string }[] = [
  { value: '12M', label: '12 months' },
  { value: '24M', label: '24 months' },
  { value: 'ALL', label: 'All' },
];

/** Insights › Savings: money saved per month (chart and stats), then the emergency fund. */
export function MonthlySavings({
  onTargets,
  onEmergencyLayout,
}: {
  onTargets: (intent: { invest?: number; edit?: boolean }) => void;
  /** Position of the emergency fund card in this section, so a link can scroll to it. */
  onEmergencyLayout?: (y: number) => void;
}) {
  const theme = useTheme();
  const now = useToday();
  const { snapshot } = useData();
  const { hidden } = useMoney();
  const [range, setRange] = useState<Range>('12M');

  const savings = useMemo(() => {
    const to = monthOf(now);
    const first = firstMonth(snapshot);
    const from =
      range === 'ALL' ? (first ?? to) : monthOf(addMonths(`${to}-01`, range === '12M' ? -11 : -23));
    return monthlySavings(snapshot, from, to);
  }, [snapshot, range, now]);

  const count = savings.months.length;

  return (
    <>
      <Card style={{ gap: space.md }}>
        <Segmented options={RANGES} value={range} onChange={setRange} />
        <SavingsChart months={savings.months} average={savings.average} hidden={hidden} />

        <View style={[styles.stats, { borderColor: theme.border }]}>
          <Stat label="Average / month">
            <Money value={savings.average} rounded style={styles.statValue} />
          </Stat>
          <Stat label="Months saving">
            <Text style={[styles.statValue, { color: theme.text }]}>
              {savings.positiveMonths} / {count}
            </Text>
          </Stat>
          <Stat label="Total (net)">
            <Money value={savings.total} signed rounded style={styles.statValue} />
          </Stat>
        </View>
        {savings.best && (
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            Best month: {formatMonth(savings.best.month, true)} (
            <Money value={savings.best.net} rounded style={{ fontSize: 13, color: theme.textSecondary }} />)
          </Text>
        )}
      </Card>
      <Text style={[styles.footnote, { color: theme.textMuted }]}>
        Money put into your investments minus what you took out, plus loan principal repaid minus money
        borrowed. Dividends, interest and price changes are not counted.
      </Text>

      <View style={{ marginTop: space.lg }} onLayout={(e) => onEmergencyLayout?.(e.nativeEvent.layout.y)}>
        <EmergencyFund onInvest={(invest) => onTargets({ invest })} onEditTargets={() => onTargets({ edit: true })} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  statValue: { fontSize: 16, fontWeight: '600' },
  footnote: { fontSize: 12, marginTop: space.sm, marginHorizontal: space.xs },
});
