import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { useToday } from '@/state/DataProvider';
import { formatPercent } from '@/domain/format';
import { ageLabel, stalenessOf, type Staleness } from '@/domain/staleness';
import type { ISODate, UpdateFrequency } from '@/domain/types';
import { useTheme, type Theme } from '@/theme';

export function stalenessColor(theme: Theme, level: Staleness) {
  switch (level) {
    case 'mild':
      return theme.staleMild;
    case 'warning':
      return theme.staleWarning;
    case 'serious':
      return theme.staleSerious;
    default:
      return theme.staleCritical;
  }
}

export function StalenessIcon({ level, size = 14 }: { level: Staleness; size?: number }) {
  const theme = useTheme();
  return (
    <Ionicons
      name={level === 'mild' ? 'time-outline' : level === 'critical' ? 'alert-circle' : 'warning'}
      size={size}
      color={stalenessColor(theme, level)}
    />
  );
}

/**
 * "⚠ 3 mo" next to an asset whose price hasn't been updated for at least a month. Nothing when fresh.
 * The color is never the only cue: icon shape and the age label carry the meaning too.
 */
export function StalenessBadge({ priceDate, frequency }: { priceDate: ISODate | null; frequency: UpdateFrequency }) {
  const theme = useTheme();
  const now = useToday();
  const level = stalenessOf(priceDate, now, frequency);
  if (level === 'fresh') return null;
  return (
    <View
      style={styles.badge}
      accessible
      accessibilityLabel={priceDate ? `Price last updated ${ageLabel(priceDate, now)} ago` : 'No price yet'}>
      <StalenessIcon level={level} size={13} />
      <Text style={[styles.label, { color: theme.textSecondary }]}>{ageLabel(priceDate, now)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  label: { fontSize: 12, fontVariant: ['tabular-nums'] },
  loss: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});

/** "▼ −32%": an open investment down 25% or more vs what was paid (`bigLoss`). Icon + label, not only color. */
export function LossBadge({ loss }: { loss: number }) {
  const theme = useTheme();
  return (
    <View style={styles.loss} accessible accessibilityLabel={`Down ${formatPercent(-loss)} vs cost`}>
      <Ionicons name="trending-down" size={12} color={theme.negative} />
      <Text style={{ color: theme.negative, fontSize: 12, fontWeight: '600' }}>{formatPercent(loss, { signed: true })}</Text>
    </View>
  );
}
