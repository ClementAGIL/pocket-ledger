import { createContext, useContext, type ReactNode } from 'react';
import { useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Path, type PathProps } from 'react-native-svg';

import { space } from '@/theme';

/*
 * A tiny choreography engine for the introduction's pictures. A scene is drawn on a fixed
 * SCENE_W × SCENE_H canvas (scaled to the screen) and made of pieces; the page plays one timeline
 * (`progress` 0 → 1) and each piece flies in from its own place during its own window (`at`) of it.
 * Once in place, `bob` / `sway` keep it gently moving with the shared `float` beat.
 */

export const SCENE_W = 280;
export const SCENE_H = 220;

interface SceneValues {
  progress: SharedValue<number>;
  float: SharedValue<number>;
}

const SceneContext = createContext<SceneValues | null>(null);

function useScene() {
  const ctx = useContext(SceneContext);
  if (!ctx) throw new Error('Scene pieces must be inside <Scene>');
  return ctx;
}

export type Ease = 'back' | 'out' | 'bounce' | 'elastic';

/** Where a piece comes from (offsets, degrees, starting scale); it ends at rest. */
export interface From {
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
}

/** The piece's own progress in its window of the page's timeline. */
export function windowed(p: number, at: readonly [number, number]) {
  'worklet';
  return Math.min(1, Math.max(0, (p - at[0]) / (at[1] - at[0])));
}

export function eased(t: number, ease: Ease) {
  'worklet';
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  switch (ease) {
    case 'out':
      return 1 - (1 - t) ** 3;
    case 'back': {
      const c1 = 1.70158;
      return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2;
    }
    case 'elastic':
      return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    case 'bounce': {
      const n = 7.5625;
      const d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t - 1.5 / d) ** 2 + 0.75;
      if (t < 2.5 / d) return n * (t - 2.25 / d) ** 2 + 0.9375;
      return n * (t - 2.625 / d) ** 2 + 0.984375;
    }
  }
}

/** The canvas: scaled to the screen width, hidden from screen readers (the text says it all). */
export function Scene({ progress, float, children }: SceneValues & { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const k = Math.min(1.25, (width - 2 * space.xl) / SCENE_W);
  return (
    <SceneContext.Provider value={{ progress, float }}>
      <View style={{ width: SCENE_W * k, height: SCENE_H * k }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ width: SCENE_W, height: SCENE_H, transform: [{ scale: k }], transformOrigin: 'left top' }}>{children}</View>
      </View>
    </SceneContext.Provider>
  );
}

export interface PieceProps {
  x: number;
  y: number;
  w: number;
  h: number;
  at: readonly [number, number];
  from?: From;
  ease?: Ease;
  /** Floats up and down by this many points once in place. */
  bob?: number;
  /** Rocks by this many degrees once in place. */
  sway?: number;
  /** Pivot of the rotation / scale, e.g. 'center bottom' for a growing bar. */
  origin?: string;
  style?: ViewStyle;
  children?: ReactNode;
}

export function Piece({ x, y, w, h, at, from = {}, ease = 'back', bob = 0, sway = 0, origin = 'center', style, children }: PieceProps) {
  const { progress, float } = useScene();
  const animated = useAnimatedStyle(() => {
    const t = windowed(progress.value, at);
    const e = eased(t, ease);
    const rest = 1 - e;
    const beat = (float.value * 2 - 1) * t;
    const grow = (s: number | undefined) => (s === undefined ? 1 : s + (1 - s) * e);
    return {
      opacity: Math.min(1, t * 4),
      transform: [
        { translateX: (from.x ?? 0) * rest },
        { translateY: (from.y ?? 0) * rest + bob * beat },
        { rotate: `${(from.rotate ?? 0) * rest + sway * beat}deg` },
        { scale: grow(from.scale) },
        { scaleX: grow(from.scaleX) },
        { scaleY: grow(from.scaleY) },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: x, top: y, width: w, height: h, transformOrigin: origin }, style, animated]}>
      {children}
    </Animated.View>
  );
}

/** A full-canvas SVG layer, for lines drawn with <Draw>. */
export function Layer({ children }: { children: ReactNode }) {
  return (
    <Svg width={SCENE_W} height={SCENE_H} style={{ position: 'absolute', left: 0, top: 0 }}>
      {children}
    </Svg>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** A stroke drawn from its start to its end during `at`. `length` ≥ the path's length. */
export function Draw({ at, length, ...props }: Omit<PathProps, 'strokeDasharray' | 'strokeDashoffset'> & { at: readonly [number, number]; length: number }) {
  const { progress } = useScene();
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - windowed(progress.value, at)) }));
  return <AnimatedPath fill="none" strokeLinecap="round" strokeLinejoin="round" {...props} strokeDasharray={length} animatedProps={animatedProps} />;
}

/** SVG path through points, with its length. */
export function line(points: readonly (readonly [number, number])[]) {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return { d: points.map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py}`).join(''), length: Math.ceil(length) + 1 };
}

/** SVG arc (degrees, clockwise from 3 o'clock), with its length. */
export function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const at = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const [x0, y0] = at(from);
  const [x1, y1] = at(to);
  return { d: `M${x0} ${y0}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`, length: Math.ceil((r * (to - from) * Math.PI) / 180) + 1 };
}
