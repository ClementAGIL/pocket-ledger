import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cashValue, emergencyFund, goalProgress } from '@/domain/emergency';
import { formatPercent } from '@/domain/format';
import { goalOf } from '@/domain/projection';
import { useMoney } from '@/hooks/useMoney';
import { useData } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

import { Card, ProgressBar } from './ui';

type IconName = keyof typeof Ionicons.glyphMap;

/** Opens Insights on a section (`at` makes a repeated tap switch again); Savings scrolls to the emergency fund. */
const openInsights = (section: 'goals' | 'savings') =>
  router.push({
    pathname: '/insights',
    params: section === 'savings' ? { section, focus: 'emergency', at: String(Date.now()) } : { section, at: String(Date.now()) },
  });

/** Home: progress towards the goal and the emergency fund, each opening its Insights section. */
export function GoalsCard() {
  const theme = useTheme();
  const { portfolio, settings } = useData();
  const { money } = useMoney({ rounded: true });
  const p = settings.projection;
  const goal = goalOf(p);
  const fund = emergencyFund(p.yearlySpending / 12, p.emergencyMonths, cashValue(portfolio));

  if (goal === null && fund === null) {
    return (
      <Card style={styles.card}>
        <Line
          icon="flag-outline"
          label="Set a goal or an emergency fund"
          detail="See when you'll get there"
          onPress={() => openInsights('goals')}
        />
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      {goal !== null && (
        <Line
          icon="flag-outline"
          label={`${p.goalMode === 'fire' ? 'FIRE' : 'Goal'} ${money(goal)}`}
          value={formatPercent(goalProgress(portfolio.summary.assetsValue, goal))}
          progress={goalProgress(portfolio.summary.assetsValue, goal)}
          color={theme.primary}
          onPress={() => openInsights('goals')}
        />
      )}
      {fund !== null && (
        <Line
          icon="umbrella-outline"
          label="Emergency fund"
          value={fund.covered ? `Covered · ${Math.round(fund.ratio * 100)}%` : `${fund.monthsCovered.toFixed(1)} / ${p.emergencyMonths} months`}
          valueIcon={fund.covered ? 'checkmark-circle' : undefined}
          progress={fund.progress}
          color={fund.covered ? theme.positive : theme.staleWarning}
          onPress={() => openInsights('savings')}
          divider={goal !== null}
        />
      )}
    </Card>
  );
}

function Line({
  icon,
  label,
  detail,
  value,
  valueIcon,
  progress,
  color,
  divider,
  onPress,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  value?: string;
  valueIcon?: IconName;
  progress?: number;
  color?: string;
  divider?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[label, value].filter(Boolean).join(', ')}
      style={({ pressed }) => [
        styles.line,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
        { opacity: pressed ? 0.6 : 1 },
      ]}>
      <View style={styles.head}>
        <Ionicons name={icon} size={16} color={theme.textSecondary} />
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '500', flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        {valueIcon && <Ionicons name={valueIcon} size={14} color={color} />}
        {value && <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{value}</Text>}
        <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
      </View>
      {detail && <Text style={{ color: theme.textMuted, fontSize: 12, marginLeft: 22 }}>{detail}</Text>}
      {progress !== undefined && <ProgressBar progress={progress} color={color} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space.xs, marginTop: space.lg },
  line: { paddingVertical: space.sm + 2, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
