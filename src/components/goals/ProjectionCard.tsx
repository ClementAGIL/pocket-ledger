import { StyleSheet, Text, View } from 'react-native';

import { addMonths } from '@/domain/dates';
import { formatDuration, formatNumber, formatPercent } from '@/domain/format';
import { doublingYears, HORIZONS, MAX_YEARS, monthsToReach, project, type Plan, type ProjectionSettings } from '@/domain/projection';
import { monthOf } from '@/domain/savings';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

import { HistoryChart, type ChartPoint } from '../HistoryChart';
import { formatMonth } from '../SavingsChart';
import { Card, Row, Segmented } from '../ui';
import type { SaveProjection } from './styles';

/** Goals › the result: when the goal is reached (or the value at the horizon), with the chart. */
export function ProjectionCard({
  s,
  save,
  plan,
  goal,
  rate,
  inflation,
}: {
  s: ProjectionSettings;
  save: SaveProjection;
  /** Growth already after inflation when inflation is on. */
  plan: Plan;
  goal: number | null;
  /** Yearly rate before inflation, and the inflation removed (0 when off): for the sentence. */
  rate: number;
  inflation: number;
}) {
  const theme = useTheme();
  const now = useToday();
  const { money, hidden } = useMoney({ rounded: true });

  const points = project(plan, s.years);
  const reachIn = goal === null ? null : monthsToReach(goal, plan);
  const end = points[points.length - 1];
  const chart: ChartPoint[] = points.map((p) => ({
    date: addMonths(now, p.month),
    value: p.value,
    invested: p.contributed,
    ...(goal !== null && { benchmark: goal }),
  }));
  const assumptions = `At ${formatPercent(rate)}/yr${inflation > 0 ? ` (${formatPercent(plan.rate)} after inflation)` : ''} and ${money(plan.yearlySaving, { signed: plan.yearlySaving < 0 })}/yr`;
  const todayMoney = inflation > 0 ? ' in today’s money' : '';
  // Rule of thumb for the rate: nominal, and in purchasing power when inflation is on.
  const years = (r: number) => {
    const y = doublingYears(r);
    return y === null ? null : `~${formatNumber(Math.round(y * 10) / 10)} years`;
  };
  const doubles = years(rate);
  const doublesReal = inflation > 0 ? years(plan.rate) : null;

  return (
    <Card style={{ gap: space.md }}>
      <View style={{ gap: 4 }}>
        {goal === null ? (
          <Text style={[styles.headline, { color: theme.text }]}>
            {assumptions}, you’d have <Text style={styles.strong}>{money(end.value)}</Text>
            {todayMoney} in {s.years} years.
          </Text>
        ) : reachIn === 0 ? (
          <Text style={[styles.headline, { color: theme.text }]}>
            You’ve already reached <Text style={styles.strong}>{money(goal)}</Text> 🎉
          </Text>
        ) : reachIn === null ? (
          <Text style={[styles.headline, { color: theme.text }]}>
            {assumptions}, you won’t reach {money(goal)} within {MAX_YEARS} years.
          </Text>
        ) : (
          <Text style={[styles.headline, { color: theme.text }]}>
            {assumptions}, you’ll reach <Text style={styles.strong}>{money(goal)}</Text>
            {todayMoney} in{' '}
            <Text style={styles.strong}>{formatMonth(monthOf(addMonths(now, reachIn)), true)}</Text>
          </Text>
        )}
        {reachIn !== null && reachIn > 0 && (
          <Text style={{ color: theme.textSecondary }}>
            In {formatDuration(reachIn)}
            {s.goalMode === 'fire' ? ', then the portfolio could pay your yearly spending.' : '.'}
          </Text>
        )}
      </View>

      <HistoryChart
        points={chart}
        hidden={hidden}
        valueLabel="Projected"
        investedLabel="Put in"
        benchmarkLabel={s.goalMode === 'fire' ? 'FIRE goal' : 'Goal'}
      />
      <Segmented
        options={HORIZONS.map((y) => ({ value: String(y), label: `${y} years` }))}
        value={String(s.years)}
        onChange={(v) => save({ years: Number(v) })}
      />
      <View>
        <Row label={`In ${s.years} years`}>
          <Text style={[styles.value, { color: theme.text }]}>{money(end.value)}</Text>
        </Row>
        <Row label="Today + money put in">
          <Text style={[styles.value, { color: theme.textSecondary }]}>{money(end.contributed)}</Text>
        </Row>
        <Row label="Growth">
          <Text style={[styles.value, { color: theme.textSecondary }]}>
            {money(end.value - end.contributed, { signed: true })}
          </Text>
        </Row>
      </View>
      {doubles && (
        <Text style={{ color: theme.textSecondary }}>
          At {formatPercent(rate)}/yr, your money doubles every {doubles}
          {inflation > 0 ? (doublesReal ? ` (${doublesReal} in today’s money)` : ' (but not in today’s money)') : ''}.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headline: { fontSize: 17, lineHeight: 24 },
  strong: { fontWeight: '700' },
  value: { fontWeight: '600', fontVariant: ['tabular-nums'] },
});
