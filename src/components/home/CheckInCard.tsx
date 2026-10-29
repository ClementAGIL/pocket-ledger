import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMonth } from '@/components/SavingsChart';
import type { Month } from '@/domain/savings';
import { radius, space, useTheme } from '@/theme';

/** Home, first days of a month: last month's check-in is ready (no amounts). Opening it hides the card. */
export function CheckInCard({ month }: { month: Month }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/checkin', params: { month } })}
      accessibilityRole="button"
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Ionicons name="calendar-outline" size={22} color={theme.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Your {formatMonth(month, true)} check-in is ready</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>The month’s gain, savings, biggest movers and what to do now.</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
