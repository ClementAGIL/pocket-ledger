import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '@/theme';

/*
 * Confetti: two cannons fire from the bottom corners, a burst comes out of `origin` (the card
 * celebrated), a second burst follows, then it keeps raining from the top for a while. Pure
 * Reanimated: one clock, each piece's position computed from it (launch speed slowed by air drag
 * towards a fall speed, sideways flutter, spin and flip), so nothing runs on the JS thread.
 * Nothing with reduced motion.
 */

/** Seconds the whole show lasts. */
export const CONFETTI_SECONDS = 6;

interface Piece {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  /** Air drag (1/s): the launch speed fades at this rate. */
  k: number;
  /** Fall speed reached once the launch is spent (px/s). */
  fall: number;
  delay: number;
  /** Seconds visible, fading out at the end. */
  life: number;
  spin: number;
  flip: number;
  sway: number;
  swayFreq: number;
  phase: number;
  w: number;
  h: number;
  round: boolean;
  color: string;
}

/** Small seeded generator: the same pieces on every render. */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePieces(width: number, height: number, origin: { x: number; y: number }, colors: readonly string[]): Piece[] {
  const rnd = random(7);
  const between = (a: number, b: number) => a + (b - a) * rnd();
  const shape = () => {
    const r = rnd();
    // Rectangles, round dots and long ribbons.
    if (r < 0.55) return { w: between(6, 10), h: between(10, 16), round: false };
    if (r < 0.8) return { w: 8, h: 8, round: true };
    return { w: 4, h: between(16, 22), round: false };
  };
  const common = () => ({
    ...shape(),
    spin: between(-540, 540),
    flip: between(6, 14),
    sway: between(10, 30),
    swayFreq: between(2, 5),
    phase: between(0, Math.PI * 2),
    color: colors[Math.floor(rnd() * colors.length)],
  });
  const pieces: Piece[] = [];

  // Cannons: up and inwards from the bottom corners, reaching near the top before falling back.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 22; i++) {
      const angle = (between(62, 84) * Math.PI) / 180;
      const speed = height * between(2, 3);
      pieces.push({
        ...common(),
        x0: side < 0 ? -10 : width + 10,
        y0: height + 10,
        vx: -side * Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed,
        k: between(2.3, 2.9),
        fall: between(90, 170),
        delay: between(0, 0.15),
        life: between(3.8, 5),
      });
    }
  }
  // Bursts from the card: mostly upwards, the second one a bit later and wider.
  for (const [count, delay, spread] of [
    [32, 0.35, 1],
    [24, 1.7, 1.25],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const angle = (between(-170, -10) * Math.PI) / 180;
      const speed = between(500, 1300) * spread;
      pieces.push({
        ...common(),
        x0: origin.x,
        y0: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        k: between(3, 4),
        fall: between(100, 180),
        delay: delay + between(0, 0.08),
        life: between(3.4, CONFETTI_SECONDS - delay),
      });
    }
  }
  // Then it rains from the top.
  for (let i = 0; i < 24; i++) {
    const delay = between(0.9, 2.6);
    pieces.push({
      ...common(),
      x0: between(0, width),
      y0: -20 - between(0, 60),
      vx: between(-30, 30),
      vy: between(0, 60),
      k: 1,
      fall: between(110, 190),
      delay,
      life: CONFETTI_SECONDS - delay,
    });
  }
  return pieces;
}

/** Plays once when mounted (remount it, e.g. with a `key`, to play again). Doesn't catch touches. */
export function Confetti({ origin }: { origin?: { x: number; y: number } }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const time = useSharedValue(0);
  const ox = origin?.x ?? width / 2;
  const oy = origin?.y ?? height * 0.4;
  const pieces = useMemo(
    () => makePieces(width, height, { x: ox, y: oy }, [...theme.categorical, theme.positive]),
    [width, height, ox, oy, theme],
  );

  useEffect(() => {
    if (!reduceMotion) time.set(withTiming(CONFETTI_SECONDS, { duration: CONFETTI_SECONDS * 1000, easing: Easing.linear }));
  }, [reduceMotion, time]);

  if (reduceMotion) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} piece={p} time={time} />
      ))}
    </View>
  );
}

function ConfettiPiece({ piece: p, time }: { piece: Piece; time: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = time.value - p.delay;
    if (t <= 0) return { opacity: 0, transform: [{ translateX: p.x0 }, { translateY: p.y0 }, { rotate: '0deg' }, { scaleY: 1 }] };
    // Linear drag: the launch speed decays towards the fall speed.
    const decay = 1 - Math.exp(-p.k * t);
    // The flutter grows as the launch is spent.
    const flutter = p.sway * Math.sin(p.swayFreq * t + p.phase) * Math.min(1, t);
    const x = p.x0 + (p.vx * decay) / p.k + flutter;
    const y = p.y0 + p.fall * t + ((p.vy - p.fall) * decay) / p.k;
    const fadeIn = Math.min(1, t / 0.05);
    const fadeOut = Math.min(1, Math.max(0, (p.life - t) / 0.6));
    return {
      opacity: fadeIn * fadeOut,
      transform: [{ translateX: x - p.w / 2 }, { translateY: y - p.h / 2 }, { rotate: `${p.spin * t}deg` }, { scaleY: Math.cos(p.flip * t) }],
    };
  });
  return (
    <Animated.View
      style={[{ position: 'absolute', left: 0, top: 0, width: p.w, height: p.h, borderRadius: p.round ? p.w / 2 : 1.5, backgroundColor: p.color }, style]}
    />
  );
}
