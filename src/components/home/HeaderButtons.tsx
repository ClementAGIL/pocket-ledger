import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StalenessIcon } from '@/components/StalenessBadge';
import type { StalenessSummary } from '@/domain/staleness';
import { useTheme } from '@/theme';

/**
 * Header button: icon of the most urgent thing (price level, then a flag for reviews, then a compass
 * for the plan to set up), with the number of things to do.
 */
export function ReminderButton({
  summary,
  reviews,
  setup,
  onPress,
}: {
  summary: StalenessSummary;
  reviews: number;
  /** Goal / emergency fund not set yet. */
  setup: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const count = summary.stale + reviews + setup;
  const label = [
    summary.stale > 0 && `${summary.stale} ${summary.stale > 1 ? 'prices need' : 'price needs'} an update`,
    reviews > 0 && `${reviews} ${reviews > 1 ? 'reviews' : 'review'} due`,
    setup > 0 && 'plan to set up',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.iconButton, { backgroundColor: theme.surfaceAlt }]}>
      {summary.stale > 0 ? (
        <StalenessIcon level={summary.worst} size={22} />
      ) : reviews > 0 ? (
        <Ionicons name="flag" size={20} color={theme.staleWarning} />
      ) : (
        <Ionicons name="compass-outline" size={21} color={theme.primary} />
      )}
      <View style={[styles.counter, { backgroundColor: theme.text, borderColor: theme.background }]}>
        <Text style={[styles.counterText, { color: theme.background }]}>{count > 99 ? '99+' : count}</Text>
      </View>
    </Pressable>
  );
}

/** Round icon button of the Home header. */
export function IconButton({
  name,
  label,
  muted,
  onPress,
}: {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Feature turned off: drawn grayed, still tappable. */
  muted?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.iconButton, { backgroundColor: theme.surfaceAlt }]}>
      <Ionicons name={name} size={20} color={muted ? theme.textMuted : theme.text} style={muted && { opacity: 0.6 }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  counter: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterText: { fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
