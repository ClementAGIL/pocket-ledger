import Animated, { useAnimatedProps, useSharedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { ClipPath, Circle, Defs, G, LinearGradient, Path, Polyline, Rect, Stop } from 'react-native-svg';

/*
 * The app icon (assets/icon-source/splash-icon.svg) drawn in SVG, for the animated splash and the
 * introduction. Its colors are the artwork's, like the PNG icons: they don't follow the theme.
 */
const ART = {
  fabricTop: '#24344d',
  fabricBottom: '#172236',
  shirt: '#cfe6f7',
  skin: '#e2ae7c',
  collar: '#ffffff',
  tie: '#e5483d',
  lapel: '#2e4263',
  lapelEdge: '#4a6290',
  dark: '#121c2e',
  phone: '#13213a',
  phoneEdge: '#e3e9f1',
  arrow: '#3cc274',
};

/** Length of the arrow's line (its 3 segments), for drawing it with a dash. */
const ARROW_LENGTH = 16;

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** `arrow`: 0 → 1 draws the rising arrow on the phone (fully drawn when omitted). */
export function AppIcon({ size, arrow }: { size: number; arrow?: SharedValue<number> }) {
  const drawn = useSharedValue(1);
  const progress = arrow ?? drawn;
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: ARROW_LENGTH * (1 - progress.value) }));
  // The head appears once the line reaches it.
  const headProps = useAnimatedProps(() => ({ opacity: Math.max(0, (progress.value - 0.8) / 0.2) }));

  return (
    <Svg width={size} height={size} viewBox="18 18 72 72">
      <Defs>
        <LinearGradient id="fabric" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={ART.fabricTop} />
          <Stop offset="1" stopColor={ART.fabricBottom} />
        </LinearGradient>
        <ClipPath id="round">
          <Rect x="18" y="18" width="72" height="72" rx="17" />
        </ClipPath>
      </Defs>
      <G clipPath="url(#round)">
        <Rect width="108" height="108" fill="url(#fabric)" />
        <Path d="M38 0H70V18L54 74L38 18Z" fill={ART.shirt} />
        <Path d="M46 0H62V26L54 32L46 26Z" fill={ART.skin} />
        <Path d="M40 14L46 14L54 32L47 39.5L38.5 24Z" fill={ART.collar} />
        <Path d="M68 14L62 14L54 32L61 39.5L69.5 24Z" fill={ART.collar} />
        <Path d="M51 31.5H57L56 36.5H52Z" fill={ART.tie} />
        <Path d="M52 36.5H56L59.5 63L54 69L48.5 63Z" fill={ART.tie} />
        <Path d="M38 0L38 18L54 74L42 62.5L31 48L37 43L26 38.5L27 0Z" fill={ART.lapel} />
        <Path d="M70 0L70 18L54 74L66 62.5L77 48L71 43L82 38.5L81 0Z" fill={ART.lapel} />
        <Path d="M38 18L54 74M70 18L54 74" fill="none" stroke={ART.lapelEdge} strokeWidth={1.2} />
        <Circle cx="54" cy="80.5" r="1.9" fill={ART.dark} />
        <Circle cx="54" cy="88" r="1.9" fill={ART.dark} />
        <Rect x="62.8" y="54.2" width="12.4" height="21" rx="1.8" fill={ART.phone} stroke={ART.phoneEdge} strokeWidth={1.4} />
        <AnimatedPolyline
          points="65,71 67.8,66.6 69.8,68.6 72.3,61.5"
          fill="none"
          stroke={ART.arrow}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={ARROW_LENGTH}
          animatedProps={lineProps}
        />
        <AnimatedPath d="M73.23 58.86L74.27 62.83L69.93 61.31Z" fill={ART.arrow} animatedProps={headProps} />
        <Rect x="59.5" y="73.8" width="19.5" height="3.4" rx="1.5" fill={ART.dark} />
      </G>
    </Svg>
  );
}
