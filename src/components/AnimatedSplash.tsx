import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { AppIcon } from '@/components/AppIcon';
import { eased, windowed } from '@/components/onboarding/scene';
import { space, useTheme } from '@/theme';

/** Same size as the native splash image (app.json › expo-splash-screen › imageWidth). */
const ICON_SIZE = 120;
/** The whole choreography runs on one timeline of this length, then the splash fades out. */
const TIMELINE_MS = 1800;
/** The finished picture stays a moment before fading out. */
const HOLD_MS = 700;
const FADE_OUT_AT = TIMELINE_MS + HOLD_MS;
const FADE_OUT_MS = 350;
/** The phone in the suit's pocket and the arrow's head, from the icon's center (px at ICON_SIZE). */
const POCKET = { x: 25, y: 18 };
const ARROW_HEAD = { x: 33, y: 11 };

type IconName = keyof typeof Ionicons.glyphMap;

/** What you own, popping up around the icon before it goes into the pocket. */
const FLYERS: { icon: IconName; angle: number; radius: number; spin: number }[] = [
  { icon: 'home', angle: -150, radius: 150, spin: -200 },
  { icon: 'logo-bitcoin', angle: -100, radius: 175, spin: 160 },
  { icon: 'trending-up', angle: -45, radius: 150, spin: -140 },
  { icon: 'cash', angle: 5, radius: 165, spin: 220 },
  { icon: 'pie-chart', angle: 55, radius: 150, spin: -180 },
  { icon: 'business', angle: 100, radius: 180, spin: 200 },
  { icon: 'wallet', angle: 150, radius: 155, spin: -160 },
  { icon: 'diamond', angle: 195, radius: 175, spin: 180 },
];

const SPARKS = 10;
const NAME = 'Pocket Ledger';

/**
 * Animated splash: takes over from the native splash (same background, same icon at the center)
 * once the data is loaded (`start`). Your things pop up around the icon and fly into the phone in
 * the suit's pocket, the arrow shoots up with a ripple and a burst of sparks, a rising line draws
 * across the screen and the name drops in letter by letter, it holds a moment, then everything fades
 * out (~2.8 s, a quick fade with reduced motion). Plays once per launch: it stays in the root layout, which a switch
 * to / from the demo doesn't remount.
 */
export function AnimatedSplash({ start }: { start: boolean }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [done, setDone] = useState(false);
  const progress = useSharedValue(0);
  const exit = useSharedValue(0);
  const arrow = useDerivedValue(() => eased(windowed(progress.value, [0.5, 0.74]), 'out'));

  useEffect(() => {
    if (!start) return;
    if (reduceMotion) {
      progress.set(1);
      exit.set(withTiming(1, { duration: 250 }));
      const t = setTimeout(() => setDone(true), 250);
      return () => clearTimeout(t);
    }
    progress.set(withTiming(1, { duration: TIMELINE_MS, easing: Easing.linear }));
    exit.set(withDelay(FADE_OUT_AT, withTiming(1, { duration: FADE_OUT_MS, easing: Easing.in(Easing.quad) })));
    const t = setTimeout(() => setDone(true), FADE_OUT_AT + FADE_OUT_MS);
    return () => clearTimeout(t);
  }, [start, reduceMotion, progress, exit]);

  const coverStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  // A gulp as the things land in the pocket, a pop when the arrow is up, a zoom on the way out.
  const iconStyle = useAnimatedStyle(() => {
    const gulp = Math.sin(Math.PI * windowed(progress.value, [0.3, 0.56]));
    const pop = Math.sin(Math.PI * windowed(progress.value, [0.7, 0.86]));
    return { transform: [{ scale: 1 - 0.05 * gulp + 0.09 * pop + 0.25 * exit.value }] };
  });
  const taglineStyle = useAnimatedStyle(() => {
    const t = eased(windowed(progress.value, [0.78, 1]), 'out');
    return { opacity: t, transform: [{ translateY: 10 * (1 - t) }] };
  });

  if (done) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: theme.background }, coverStyle]} accessibilityLabel="Pocket Ledger">
      <RisingLine progress={progress} />
      <View style={styles.origin}>
        <Ripple progress={progress} at={[0.72, 1]} />
        <Ripple progress={progress} at={[0.8, 1]} />
      </View>
      <Animated.View style={iconStyle}>
        <AppIcon size={ICON_SIZE} arrow={arrow} />
      </Animated.View>
      <View style={styles.origin} pointerEvents="none">
        {FLYERS.map((f, i) => (
          <Flyer key={f.icon} {...f} color={theme.categorical[i % theme.categorical.length]} index={i} progress={progress} />
        ))}
        {Array.from({ length: SPARKS }, (_, i) => (
          <Spark key={i} index={i} color={i % 3 === 0 ? theme.positive : theme.categorical[(i * 3) % theme.categorical.length]} progress={progress} />
        ))}
      </View>
      {/* Under the icon, without moving it off the center where the native splash drew it. */}
      <View style={styles.title}>
        <View style={styles.name}>
          {[...NAME].map((ch, i) => (
            <Letter key={i} ch={ch} index={i} progress={progress} />
          ))}
        </View>
        <Animated.Text style={[{ color: theme.textSecondary }, taglineStyle]}>Your money, on your phone only.</Animated.Text>
      </View>
    </Animated.View>
  );
}

const FLYER_SIZE = 34;

/** Pops up at its place around the icon, then is pulled, spinning and shrinking, into the pocket. */
function Flyer({ icon, angle, radius, spin, color, index, progress }: (typeof FLYERS)[number] & { color: string; index: number; progress: SharedValue<number> }) {
  const theme = useTheme();
  const rad = (angle * Math.PI) / 180;
  const sx = Math.cos(rad) * radius;
  const sy = Math.sin(rad) * radius;
  // Pulled along a curve: sideways off the straight line, alternating sides.
  const len = Math.hypot(POCKET.x - sx, POCKET.y - sy);
  const nx = (-(POCKET.y - sy) / len) * (index % 2 ? 40 : -40);
  const ny = ((POCKET.x - sx) / len) * (index % 2 ? 40 : -40);
  const at = [index * 0.03, 0.32 + index * 0.03] as const;
  const style = useAnimatedStyle(() => {
    const t = windowed(progress.value, at);
    const appear = eased(windowed(t, [0, 0.3]), 'back');
    const b = windowed(t, [0.3, 1]);
    const pull = b * b;
    const arc = Math.sin(Math.PI * b);
    return {
      opacity: t <= 0 ? 0 : 1 - windowed(b, [0.8, 1]),
      transform: [
        { translateX: sx + (POCKET.x - sx) * pull + nx * arc },
        { translateY: sy + (POCKET.y - sy) * pull + ny * arc },
        { rotate: `${spin * pull}deg` },
        { scale: appear * (1 - 0.8 * pull) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.flyer, { backgroundColor: color }, style]}>
      <Ionicons name={icon} size={18} color={theme.onPrimary} />
    </Animated.View>
  );
}

/** Bursts out of the arrow's head once it's drawn. */
function Spark({ index, color, progress }: { index: number; color: string; progress: SharedValue<number> }) {
  const rad = ((-90 + (index - SPARKS / 2) * 32) * Math.PI) / 180;
  const dist = 46 + (index % 3) * 18;
  const size = 5 + (index % 3) * 2;
  const at = [0.72 + (index % 4) * 0.015, 0.98] as const;
  const style = useAnimatedStyle(() => {
    const t = windowed(progress.value, at);
    const e = eased(t, 'out');
    return {
      opacity: t <= 0 ? 0 : 1 - t * t,
      transform: [{ translateX: ARROW_HEAD.x + Math.cos(rad) * dist * e }, { translateY: ARROW_HEAD.y + Math.sin(rad) * dist * e }, { scale: 1 - 0.5 * t }],
    };
  });
  return <Animated.View style={[{ position: 'absolute', left: -size / 2, top: -size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

/** A ring in the icon's shape, spreading out and fading. */
function Ripple({ progress, at }: { progress: SharedValue<number>; at: readonly [number, number] }) {
  const theme = useTheme();
  const style = useAnimatedStyle(() => {
    const t = windowed(progress.value, at);
    return { opacity: t <= 0 ? 0 : 0.6 * (1 - t), transform: [{ scale: 1 + 0.9 * eased(t, 'out') }] };
  });
  return <Animated.View style={[styles.ripple, { borderColor: theme.positive }, style]} />;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const LINE_LENGTH = 4000;

/** A faint rising chart drawn across the whole screen behind the icon, its area filling in after. */
function RisingLine({ progress }: { progress: SharedValue<number> }) {
  const theme = useTheme();
  const { width: w, height: h } = useWindowDimensions();
  const ys = [0.8, 0.74, 0.77, 0.66, 0.69, 0.56, 0.6, 0.45, 0.48, 0.34, 0.28];
  const points = ys.map((y, i) => `${(w * i) / (ys.length - 1)} ${h * y}`);
  const d = `M${points.join('L')}`;
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: LINE_LENGTH * (1 - eased(windowed(progress.value, [0.08, 0.7]), 'out')) }));
  const areaProps = useAnimatedProps(() => ({ fillOpacity: 0.07 * windowed(progress.value, [0.55, 0.9]) }));
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <AnimatedPath d={`${d}L${w} ${h}L0 ${h}Z`} fill={theme.positive} animatedProps={areaProps} />
      <AnimatedPath
        d={d}
        fill="none"
        stroke={theme.positive}
        strokeOpacity={0.25}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={LINE_LENGTH}
        animatedProps={lineProps}
      />
    </Svg>
  );
}

/** One letter of the name, dropping in on its own beat. */
function Letter({ ch, index, progress }: { ch: string; index: number; progress: SharedValue<number> }) {
  const theme = useTheme();
  const at = [0.42 + index * 0.025, 0.62 + index * 0.025] as const;
  const style = useAnimatedStyle(() => {
    const t = windowed(progress.value, at);
    const e = eased(t, 'back');
    return { opacity: Math.min(1, t * 3), transform: [{ translateY: -22 * (1 - e) }, { rotate: `${(index % 2 ? 14 : -14) * (1 - e)}deg` }] };
  });
  return <Animated.Text style={[styles.letter, { color: theme.text }, style]}>{ch}</Animated.Text>;
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  /** A point at the screen's center: the icon's center, for pieces placed around it. */
  origin: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  flyer: {
    position: 'absolute',
    left: -FLYER_SIZE / 2,
    top: -FLYER_SIZE / 2,
    width: FLYER_SIZE,
    height: FLYER_SIZE,
    borderRadius: FLYER_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Same rounded square as the icon (17 / 72 of its size).
  ripple: { position: 'absolute', left: -ICON_SIZE / 2, top: -ICON_SIZE / 2, width: ICON_SIZE, height: ICON_SIZE, borderRadius: (ICON_SIZE * 17) / 72, borderWidth: 3 },
  title: { position: 'absolute', top: '50%', marginTop: ICON_SIZE / 2 + space.xl, alignItems: 'center', gap: space.xs },
  name: { flexDirection: 'row' },
  letter: { fontSize: 26, fontWeight: '700' },
});
