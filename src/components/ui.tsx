import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode, Ref } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatEuro, formatPercent } from '@/domain/format';
import { useData } from '@/state/DataProvider';
import { radius, space, useTheme } from '@/theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>{children}</View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{children}</Text>;
}

/** Euro amount that respects the "hide amounts" setting. */
export function Money({
  value,
  signed,
  colored,
  rounded,
  style,
}: {
  value: number;
  signed?: boolean;
  /** Green when positive, red when negative. */
  colored?: boolean;
  rounded?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const theme = useTheme();
  const { settings } = useData();
  const color = colored ? gainColor(theme, value) : theme.text;
  return (
    <Text style={[{ color, fontVariant: ['tabular-nums'] }, style]}>
      {formatEuro(value, { hidden: settings.hideAmounts, signed, rounded })}
    </Text>
  );
}

export function Percent({ ratio, style }: { ratio: number | null; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  const color = ratio === null ? theme.textMuted : gainColor(theme, ratio);
  return (
    <Text style={[{ color, fontVariant: ['tabular-nums'] }, style]}>
      {ratio !== null && ratio !== 0 ? (ratio > 0 ? '▲ ' : '▼ ') : ''}
      {formatPercent(ratio === null ? null : Math.abs(ratio))}
    </Text>
  );
}

export const gainColor = (theme: ReturnType<typeof useTheme>, value: number) =>
  Math.abs(value) < 0.005 ? theme.textSecondary : value > 0 ? theme.positive : theme.negative;

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  /** outline: a clearly tappable secondary action (primary-colored border and text). */
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const bg = variant === 'primary' ? theme.primary : variant === 'outline' ? 'transparent' : theme.surfaceAlt;
  const fg =
    variant === 'primary' ? theme.onPrimary : variant === 'danger' ? theme.negative : variant === 'outline' ? theme.primary : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        variant === 'outline' && { borderWidth: 1.5, borderColor: theme.primary },
        style,
      ]}>
      <View style={styles.buttonContent}>
        {icon && <Ionicons name={icon} size={18} color={fg} />}
        <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
      </View>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.surfaceAlt }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text
              numberOfLines={1}
              style={{ color: selected ? theme.text : theme.textSecondary, fontWeight: selected ? '600' : '400' }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Wrapping row of chips: better than Segmented when there are many options. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              { borderColor: selected ? theme.primary : theme.border },
              selected && { backgroundColor: theme.primary },
            ]}>
            <Text style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: selected ? '600' : '400' }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      {children}
      {error ? (
        <Text style={[styles.hint, { color: theme.negative }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Input({ ref, ...props }: TextInputProps & { ref?: Ref<TextInput> }) {
  const theme = useTheme();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={theme.textMuted}
      {...props}
      style={[
        styles.input,
        { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
        props.style,
      ]}
    />
  );
}

/** Thin horizontal bar for a 0–1 progress (goal, emergency fund…). */
export function ProgressBar({
  progress,
  color,
  height = 8,
  style,
}: {
  progress: number;
  color?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const pct = Math.min(Math.max(progress, 0), 1) * 100;
  const shape = { height, borderRadius: height / 2 };
  return (
    <View
      style={[styles.track, shape, { backgroundColor: theme.surfaceAlt }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
      <View style={[shape, { width: `${pct}%`, backgroundColor: color ?? theme.primary }]} />
    </View>
  );
}

/** Bottom bar of a screen with one Save button, above the home indicator. Shows "Saving…" while saving. */
export function SaveBar({
  title,
  onPress,
  saving,
  disabled,
}: {
  title: string;
  onPress: () => void;
  saving: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.saveBar,
        { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: Math.max(insets.bottom, space.md) },
      ]}>
      <Button title={saving ? 'Saving…' : title} onPress={onPress} disabled={saving || disabled} />
    </View>
  );
}

/** Text-only action in the primary color ("Retry", "Equal split", "Adjust my Cash target ›"…). */
export function TextLink({
  title,
  onPress,
  size = 14,
  weight = '400',
  icon,
  chevron,
  role = 'button',
  style,
}: {
  title: string;
  onPress: () => void;
  size?: number;
  weight?: TextStyle['fontWeight'];
  /** Leading icon. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Trailing "›": the link opens another screen or section. */
  chevron?: boolean;
  role?: 'button' | 'link';
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole={role}
      style={({ pressed }) => [styles.textLink, { opacity: pressed ? 0.6 : 1 }, style]}>
      {icon && <Ionicons name={icon} size={size + 3} color={theme.primary} />}
      <Text style={{ color: theme.primary, fontSize: size, fontWeight: weight }}>{title}</Text>
      {chevron && <Ionicons name="chevron-forward" size={size} color={theme.primary} />}
    </Pressable>
  );
}

/** Icon + explanation line (status of a check, an advice…). */
export function StatusLine({
  icon,
  color,
  children,
  textColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  children: ReactNode;
  textColor?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.statusLine}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={{ color: textColor ?? theme.text, fontSize: 13, lineHeight: 18, flex: 1 }}>{children}</Text>
    </View>
  );
}

/** Small label above a value, in a row of stats. */
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={{ color: theme.textMuted, fontSize: 12 }}>{label}</Text>
      {children}
    </View>
  );
}

/**
 * Centered dialog over a dimmed background. Moves up with the keyboard, and has its own gesture
 * root (Android modals render outside the app's). `plain`: no card, for content that brings its own.
 */
export function ModalCard({
  visible,
  onClose,
  closeOnBackdrop = false,
  plain = false,
  style,
  children,
}: {
  visible: boolean;
  /** Back button (Android), and backdrop taps when `closeOnBackdrop`. */
  onClose: () => void;
  closeOnBackdrop?: boolean;
  plain?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const theme = useTheme();
  const cardStyle = [
    styles.modalCard,
    !plain && { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth, padding: space.lg },
    style,
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {closeOnBackdrop ? (
            <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              {/* Inner Pressable: taps on the card don't reach the backdrop. */}
              <Pressable onPress={() => {}} accessible={false} style={cardStyle}>
                {children}
              </Pressable>
            </Pressable>
          ) : (
            // Plain views: nothing competes with the content's own gestures (sliders, pickers).
            <View style={styles.backdrop}>
              <View style={cardStyle}>{children}</View>
            </View>
          )}
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Label / value line used in summaries. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={{ color: theme.textSecondary }}>{label}</Text>
      {typeof children === 'string' ? <Text style={{ color: theme.text }}>{children}</Text> : children}
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: space.xl,
    marginBottom: space.sm,
    marginHorizontal: space.xs,
  },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: 999, borderWidth: 1 },
  field: { marginTop: space.lg, gap: space.xs + 2 },
  label: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.xs + 2 },
  track: { overflow: 'hidden' },
  saveBar: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  textLink: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start' },
  statusLine: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  stat: { flex: 1, gap: 2 },
  backdrop: { flex: 1, justifyContent: 'center', padding: space.lg, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: space.md, borderRadius: radius.lg },
});
