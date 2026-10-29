import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Button, TextLink } from '@/components/ui';
import type { Snapshot } from '@/domain/types';
import { currentValues, milestones, newlyReached, withCelebrated, type Milestone, type MilestoneValues } from '@/domain/milestones';
import { useMoney } from '@/hooks/useMoney';
import { useData } from '@/state/DataProvider';
import { radius, space, useTheme } from '@/theme';

import { Confetti } from './Confetti';

/** Lets a closing form (the Add / Edit modal) go away before the celebration shows. */
const SHOW_DELAY_MS = 700;

/**
 * Watches the data: when a change (an operation, a price update) crosses the goal or completes the
 * emergency fund, a full-screen celebration plays (once per milestone). Loading the data, a demo
 * switch or changing the goal itself never celebrates: only a change of the data does.
 */
export function GoalCelebrations() {
  const { snapshot, portfolio, settings, updateSettings } = useData();
  const prev = useRef<{ snapshot: Snapshot; values: MilestoneValues } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shown, setShown] = useState<Milestone[] | null>(null);

  useEffect(() => {
    const before = prev.current;
    const values = currentValues(portfolio);
    prev.current = { snapshot, values };
    if (!before || before.snapshot === snapshot) return;
    const reached = newlyReached(milestones(settings.projection), before.values, values, settings.celebratedGoals);
    if (reached.length === 0) return;
    updateSettings({ celebratedGoals: withCelebrated(settings.celebratedGoals, reached) });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(reached), SHOW_DELAY_MS);
  }, [snapshot, portfolio, settings.projection, settings.celebratedGoals, updateSettings]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  if (!shown) return null;
  return <Celebration reached={shown} onClose={() => setShown(null)} />;
}

/** The text of a reached milestone (amounts respect "hide amounts"). */
export function useMilestoneText() {
  const { money } = useMoney({ rounded: true });
  return (m: Milestone) =>
    m.kind === 'emergency'
      ? { icon: 'umbrella' as const, title: 'Emergency fund complete', text: `Your cash now covers ${m.months} months of expenses.` }
      : m.fire
        ? { icon: 'flame' as const, title: 'FIRE number reached', text: `Your assets have reached ${money(m.target)}: 25 years of your spending.` }
        : { icon: 'flag' as const, title: 'Goal reached', text: `Your assets have reached your goal of ${money(m.target)}.` };
}

function Celebration({ reached, onClose }: { reached: Milestone[]; onClose: () => void }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const describe = useMilestoneText();
  const lines = reached.map(describe);
  const title = `${lines.length > 1 ? 'Two goals reached' : lines[0].title}!`;

  const enter = useSharedValue(reduceMotion ? 1 : 0);
  const spin = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    enter.set(withSpring(1, { damping: 11, stiffness: 140 }));
    spin.set(withRepeat(withTiming(360, { duration: 12000, easing: Easing.linear }), -1));
    glow.set(withDelay(300, withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true)));
  }, [reduceMotion, enter, spin, glow]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 2),
    transform: [{ translateY: 60 * (1 - enter.value) }, { scale: 0.7 + 0.3 * enter.value }],
  }));
  const raysStyle = useAnimatedStyle(() => ({ opacity: 0.35 + 0.25 * glow.value, transform: [{ rotate: `${spin.value}deg` }, { scale: enter.value }] }));
  const trophyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -120 * (1 - enter.value) }, { rotate: `${-25 * (1 - enter.value)}deg` }, { scale: 1 + 0.06 * glow.value }] }));

  const close = () => onClose();
  const openGoals = () => {
    onClose();
    const section = reached[0].kind === 'emergency' ? 'savings' : 'goals';
    router.push({
      pathname: '/insights',
      params: section === 'savings' ? { section, focus: 'emergency', at: String(Date.now()) } : { section, at: String(Date.now()) },
    });
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, cardStyle]} accessibilityViewIsModal>
          <View style={styles.badge}>
            <Animated.View style={[styles.rays, raysStyle]}>
              <Rays color={theme.categorical[3]} />
            </Animated.View>
            <Animated.View style={[styles.trophy, { backgroundColor: theme.categorical[3] }, trophyStyle]}>
              <Ionicons name="trophy" size={46} color={theme.onPrimary} />
            </Animated.View>
            {SPARKLES.map((s, i) => (
              <Sparkle key={i} {...s} glow={glow} color={i % 2 ? theme.categorical[3] : theme.primary} />
            ))}
          </View>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            {title}
          </Text>
          {lines.map((l) => (
            <View key={l.title} style={styles.line}>
              {lines.length > 1 && <Ionicons name={l.icon} size={18} color={theme.positive} />}
              <Text style={[styles.text, { color: theme.textSecondary }]}>{l.text}</Text>
            </View>
          ))}
          <Button title="Wonderful!" onPress={close} style={{ alignSelf: 'stretch', marginTop: space.sm }} />
          <TextLink title={reached[0].kind === 'emergency' ? 'See my savings' : 'Set the next goal'} onPress={openGoals} />
        </Animated.View>
        <Confetti origin={{ x: width / 2, y: height / 2 - 110 }} />
      </View>
    </Modal>
  );
}

const RAYS = 12;

/** A sunburst behind the trophy. */
function Rays({ color }: { color: string }) {
  const c = 80;
  const d = Array.from({ length: RAYS }, (_, i) => {
    const a0 = ((i * 360) / RAYS - 7) * (Math.PI / 180);
    const a1 = ((i * 360) / RAYS + 7) * (Math.PI / 180);
    return `M${c} ${c}L${c + c * Math.cos(a0)} ${c + c * Math.sin(a0)}L${c + c * Math.cos(a1)} ${c + c * Math.sin(a1)}Z`;
  }).join('');
  return (
    <Svg width={c * 2} height={c * 2}>
      <Path d={d} fill={color} />
    </Svg>
  );
}

const SPARKLES = [
  { x: -62, y: -40, size: 18, beat: 0 },
  { x: 58, y: -50, size: 22, beat: 0.5 },
  { x: 66, y: 30, size: 14, beat: 0.25 },
  { x: -70, y: 34, size: 16, beat: 0.75 },
];

/** Twinkles around the trophy, each on its own beat. */
function Sparkle({ x, y, size, beat, glow, color }: (typeof SPARKLES)[number] & { glow: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => {
    const t = (glow.value + beat) % 1;
    return { opacity: 0.4 + 0.6 * t, transform: [{ scale: 0.6 + 0.5 * t }, { rotate: `${90 * t}deg` }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: 80 + x - size / 2, top: 80 + y - size / 2 }, style]}>
      <Ionicons name="sparkles" size={size} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: space.lg, backgroundColor: 'rgba(0,0,0,0.5)' },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    paddingTop: 0,
  },
  badge: { width: 160, height: 160, marginTop: -60, alignItems: 'center', justifyContent: 'center' },
  rays: { position: 'absolute', left: 0, top: 0 },
  trophy: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  text: { fontSize: 16, lineHeight: 22, textAlign: 'center', flexShrink: 1 },
});
