import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { space, useTheme } from '@/theme';

/** Building blocks shared by the Settings sections. */

type IconName = keyof typeof Ionicons.glyphMap;

export function SwitchRow({ icon, label, value, onChange }: { icon: IconName; label: string; value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <View style={[settingsStyles.row, { borderColor: theme.border }]}>
      <Ionicons name={icon} size={20} color={theme.textSecondary} />
      <Text style={[settingsStyles.rowLabel, { color: theme.text }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

export function LinkRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [settingsStyles.row, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={20} color={theme.textSecondary} />
      <Text style={[settingsStyles.rowLabel, { color: theme.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
    </Pressable>
  );
}

export function StepButton({ icon, label, disabled, onPress }: { icon: 'add' | 'remove'; label: string; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[settingsStyles.stepButton, { backgroundColor: theme.surfaceAlt, opacity: disabled ? 0.35 : 1 }]}>
      <Ionicons name={icon} size={18} color={theme.text} />
    </Pressable>
  );
}

/** Small explanation under a section card. */
export function Footnote({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[settingsStyles.footnote, { color: theme.textMuted }]}>{children}</Text>;
}

export const settingsStyles = StyleSheet.create({
  card: { paddingVertical: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { flex: 1, fontSize: 16 },
  stepButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  /** A row holding chips (no icon), separated like the other rows. */
  chipsRow: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  footnote: { fontSize: 12, marginTop: space.sm, marginHorizontal: space.xs },
});
