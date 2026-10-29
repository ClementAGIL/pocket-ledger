import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg';

import { AppIcon } from '@/components/AppIcon';
import { formatPercent } from '@/domain/format';
import { useTheme } from '@/theme';

import { arc, Draw, Layer, line, Piece, type PieceProps } from './scene';

/*
 * The six pictures of the introduction, one per page, each with its own choreography. Coordinates
 * are on the 280 × 220 scene canvas; `at` windows are fractions of the page's timeline.
 */

type IconName = keyof typeof Ionicons.glyphMap;

/** A round badge with an icon. */
function Chip({ icon, color, filled, size = 40, ...piece }: Omit<PieceProps, 'w' | 'h'> & { icon: IconName; color: string; filled?: boolean; size?: number }) {
  const theme = useTheme();
  return (
    <Piece {...piece} w={size} h={size}>
      <View
        style={[
          styles.chip,
          { borderRadius: size / 2 },
          filled ? { backgroundColor: color } : { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 },
        ]}>
        <Ionicons name={icon} size={size * 0.5} color={filled ? theme.onPrimary : color} />
      </View>
    </Piece>
  );
}

/** A rounded bar standing for a line of text. */
function Bar({ w, color, h = 6 }: { w: number; color: string; h?: number }) {
  return <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: color }} />;
}

/** 1. Welcome: everything you own flies into the phone. */
export function WelcomeScene() {
  const theme = useTheme();
  const c = theme.categorical;
  const links: [number, number, number, number][] = [
    [40, 38, 98, 62],
    [242, 30, 182, 62],
    [26, 118, 98, 110],
    [256, 112, 182, 110],
    [46, 192, 98, 158],
    [236, 190, 182, 158],
  ];
  return (
    <>
      <Layer>
        {links.map(([x0, y0, x1, y1], i) => {
          const l = line([
            [x0, y0],
            [x1, y1],
          ]);
          return <Draw key={i} d={l.d} length={l.length} at={[0.68 + i * 0.03, 0.85 + i * 0.03]} stroke={theme.border} strokeWidth={1.5} />;
        })}
      </Layer>
      <Piece x={98} y={14} w={84} h={164} at={[0, 0.3]} from={{ y: 300, rotate: -20 }}>
        <View style={[styles.phone, { backgroundColor: theme.surface, borderColor: theme.text }]}>
          <View style={[styles.notch, { backgroundColor: theme.text }]} />
        </View>
      </Piece>
      <Piece x={118} y={34} w={44} h={44} at={[0.25, 0.45]} from={{ scale: 0, rotate: -180 }}>
        <AppIcon size={44} />
      </Piece>
      {[c[0], c[1], c[2]].map((color, i) => (
        <Piece key={i} x={108} y={90 + i * 18} w={64} h={12} at={[0.35 + i * 0.07, 0.55 + i * 0.07]} from={{ x: i % 2 ? 220 : -220, rotate: i % 2 ? 12 : -12 }} ease="out">
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Bar w={28} color={theme.surfaceAlt} />
            <Bar w={14} color={theme.border} />
          </View>
        </Piece>
      ))}
      <Layer>
        {(() => {
          const l = line([
            [110, 160],
            [122, 154],
            [132, 157],
            [144, 148],
            [156, 151],
            [170, 140],
          ]);
          return <Draw d={l.d} length={l.length} at={[0.58, 0.8]} stroke={theme.positive} strokeWidth={2.5} />;
        })()}
      </Layer>
      <Chip icon="home" color={c[0]} x={20} y={18} at={[0.3, 0.55]} from={{ x: -160, y: -120, rotate: -120 }} bob={4} />
      <Chip icon="logo-bitcoin" color={c[3]} x={222} y={10} at={[0.36, 0.6]} from={{ x: 160, y: -140, rotate: 120 }} bob={-4} />
      <Chip icon="trending-up" color={theme.positive} x={6} y={98} at={[0.42, 0.66]} from={{ x: -200, rotate: -60 }} bob={3} />
      <Chip icon="car-sport-outline" color={c[4]} x={236} y={92} at={[0.48, 0.72]} from={{ x: 200, rotate: 60 }} bob={-3} />
      <Chip icon="wallet-outline" color={c[2]} x={26} y={172} at={[0.54, 0.78]} from={{ x: -140, y: 140 }} bob={4} />
      <Chip icon="business-outline" color={c[6]} x={216} y={170} at={[0.6, 0.84]} from={{ x: 140, y: 140 }} bob={-4} />
      <Chip icon="shield-checkmark" color={theme.positive} filled size={30} x={164} y={2} at={[0.82, 1]} from={{ scale: 0, rotate: -90 }} ease="elastic" />
    </>
  );
}

/** 2. Note every move: a ledger drops in, its lines slide in from both sides, coins fall. */
export function LedgerScene() {
  const theme = useTheme();
  const c = theme.categorical;
  const rows: { icon: IconName; color: string }[] = [
    { icon: 'cart-outline', color: c[0] },
    { icon: 'cash-outline', color: theme.positive },
    { icon: 'arrow-up-outline', color: c[1] },
    { icon: 'home-outline', color: c[6] },
  ];
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Piece key={i} x={4} y={194 - i * 12} w={36} h={14} at={[0.55 + i * 0.08, 0.75 + i * 0.08]} from={{ y: -260, rotate: 40 }} ease="bounce">
          <View style={[styles.coin, { backgroundColor: c[3], borderColor: theme.background }]} />
        </Piece>
      ))}
      <Piece x={44} y={16} w={190} h={176} at={[0, 0.3]} from={{ y: -260 }} ease="bounce">
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]} />
      </Piece>
      <Piece x={44} y={16} w={190} h={34} at={[0.2, 0.36]} from={{ scaleX: 0 }} origin="left center" ease="out">
        <View style={[styles.header, { backgroundColor: theme.primary }]}>
          <Ionicons name="book-outline" size={16} color={theme.onPrimary} />
          <Bar w={70} color={theme.onPrimary} />
        </View>
      </Piece>
      {rows.map((r, i) => (
        <Piece
          key={r.icon}
          x={54}
          y={60 + i * 31}
          w={170}
          h={24}
          at={[0.3 + i * 0.1, 0.5 + i * 0.1]}
          from={{ x: i % 2 ? 300 : -300, rotate: i % 2 ? 12 : -12 }}>
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: r.color }]}>
              <Ionicons name={r.icon} size={13} color={theme.onPrimary} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Bar w={70 - i * 8} color={theme.text} h={5} />
              <Bar w={40} color={theme.border} h={4} />
            </View>
            <Bar w={30} color={r.color} />
          </View>
        </Piece>
      ))}
      <Chip icon="repeat" color={theme.primary} filled size={36} x={214} y={4} at={[0.8, 1]} from={{ scale: 0, rotate: -360 }} />
      <Piece x={214} y={156} w={40} h={40} at={[0.62, 0.85]} from={{ x: 120, y: 140, rotate: 200 }} ease="out" sway={6} bob={3}>
        <Ionicons name="pencil" size={34} color={theme.text} />
      </Piece>
    </>
  );
}

const CHART: [number, number][] = [
  [22, 128],
  [44, 118],
  [64, 122],
  [86, 100],
  [106, 106],
  [128, 82],
  [150, 74],
  [174, 50],
];

/** 3. See how you're doing: panels swing in, the lines draw, bars grow, the donut spins. */
export function DashboardScene() {
  const theme = useTheme();
  const c = theme.categorical;
  const value = line(CHART);
  const invested = line([
    [22, 128],
    [64, 120],
    [106, 110],
    [150, 98],
    [174, 94],
  ]);
  const slices: [number, number][] = [
    [-90, 30],
    [36, 130],
    [136, 208],
    [214, 264],
  ];
  return (
    <>
      <Piece x={10} y={20} w={176} h={128} at={[0, 0.25]} from={{ scale: 0.2, rotate: -8, y: 60 }}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]} />
      </Piece>
      <Piece x={22} y={28} w={100} h={16} at={[0.15, 0.35]} from={{ x: -80 }} ease="out">
        <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '600' }}>NET WORTH</Text>
      </Piece>
      <Layer>
        {[60, 90, 120].map((gy, i) => {
          const g = line([
            [22, gy],
            [174, gy],
          ]);
          return <Draw key={gy} d={g.d} length={g.length} at={[0.2 + i * 0.04, 0.4 + i * 0.04]} stroke={theme.grid} strokeWidth={1} />;
        })}
        <Draw d={invested.d} length={invested.length} at={[0.35, 0.65]} stroke={theme.seriesInvested} strokeWidth={2} />
        <Draw d={value.d} length={value.length} at={[0.3, 0.65]} stroke={theme.seriesValue} strokeWidth={3} />
      </Layer>
      {[3, 5, 7].map((p, i) => (
        <Piece key={p} x={CHART[p][0] - 5} y={CHART[p][1] - 5} w={10} h={10} at={[0.55 + i * 0.05, 0.7 + i * 0.05]} from={{ scale: 0 }}>
          <View style={[styles.marker, { backgroundColor: theme.seriesValue, borderColor: theme.surface }]} />
        </Piece>
      ))}

      <Piece x={194} y={20} w={76} h={64} at={[0.1, 0.35]} from={{ x: 200, rotate: 20 }}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]} />
      </Piece>
      {[18, 30, 24, 40].map((bh, i) => (
        <Piece
          key={i}
          x={204 + i * 15}
          y={76 - bh}
          w={10}
          h={bh}
          at={[0.35 + i * 0.06, 0.55 + i * 0.06]}
          from={{ scaleY: 0 }}
          origin="center bottom">
          <View style={[styles.fill, { borderRadius: 3, backgroundColor: c[2] }]} />
        </Piece>
      ))}

      <Piece x={194} y={92} w={76} h={76} at={[0.18, 0.42]} from={{ x: 200, y: 120, rotate: -30 }}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]} />
      </Piece>
      <Piece x={204} y={102} w={56} h={56} at={[0.4, 0.75]} from={{ rotate: -180, scale: 0.3 }} ease="out">
        <Svg width={56} height={56}>
          {slices.map(([a0, a1], i) => {
            const s = arc(28, 28, 20, a0, a1);
            return <Draw key={i} d={s.d} length={s.length} at={[0.45 + i * 0.08, 0.6 + i * 0.08]} stroke={c[i]} strokeWidth={9} strokeLinecap="butt" />;
          })}
        </Svg>
      </Piece>

      <Piece x={24} y={162} w={140} h={34} at={[0.68, 0.9]} from={{ y: 120, rotate: -15 }} ease="bounce">
        <View style={[styles.pill, { backgroundColor: theme.positive }]}>
          <Ionicons name="trending-up" size={16} color={theme.onPrimary} />
          <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>{formatPercent(0.082)} a year</Text>
        </View>
      </Piece>
      <Chip icon="trophy" color={c[3]} filled size={36} x={196} y={176} at={[0.8, 1]} from={{ scale: 0, rotate: 180 }} ease="elastic" />
    </>
  );
}

/** 4. Stay on top: the bell drops and rings, reminders slide in from three sides, the calendar flips in. */
export function RemindersScene() {
  const theme = useTheme();
  const waves = [arc(140, 34, 40, 150, 210), arc(140, 34, 50, 150, 210), arc(140, 34, 40, -30, 30), arc(140, 34, 50, -30, 30)];
  const cards: { icon: IconName; color: string; title: string; tag: string }[] = [
    { icon: 'pricetag-outline', color: theme.staleWarning, title: 'Update 3 prices', tag: '●' },
    { icon: 'trending-down', color: theme.negative, title: 'Down 25%: review it', tag: formatPercent(-0.32) },
    { icon: 'repeat', color: theme.primary, title: '2 scheduled operations', tag: '›' },
  ];
  const from = [
    { x: 320, rotate: 8 },
    { x: -320, rotate: -8 },
    { y: 220, rotate: 6 },
  ];
  return (
    <>
      <Layer>
        {waves.map((w, i) => (
          <Draw key={i} d={w.d} length={w.length} at={[0.26 + (i % 2) * 0.05, 0.42 + (i % 2) * 0.05]} stroke={theme.primary} strokeWidth={3} />
        ))}
      </Layer>
      <Piece x={108} y={2} w={64} h={64} at={[0, 0.28]} from={{ y: -200 }} ease="bounce" sway={10} origin="center top">
        <Ionicons name="notifications" size={60} color={theme.primary} />
      </Piece>
      {cards.map((card, i) => (
        <Piece key={card.title} x={22} y={78 + i * 44} w={236} h={36} at={[0.3 + i * 0.12, 0.5 + i * 0.13]} from={from[i]}>
          <View style={[styles.notice, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.rowIcon, { width: 24, height: 24, borderRadius: 7, backgroundColor: card.color }]}>
              <Ionicons name={card.icon} size={14} color={theme.onPrimary} />
            </View>
            <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 12, fontWeight: '600' }}>
              {card.title}
            </Text>
            <Text style={{ color: card.color, fontSize: 12, fontWeight: '700' }}>{card.tag}</Text>
          </View>
        </Piece>
      ))}
      <Piece x={214} y={8} w={46} h={50} at={[0.7, 0.92]} from={{ scale: 0, rotate: -200, x: 60, y: -60 }} bob={3}>
        <View style={[styles.calendar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.calendarTop, { backgroundColor: theme.negative }]} />
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>1</Text>
        </View>
      </Piece>
      <Chip icon="checkmark" color={theme.positive} filled size={22} x={248} y={0} at={[0.88, 1]} from={{ scale: 0 }} ease="elastic" />
    </>
  );
}

/** 5. Plan ahead: mountains rise, savings stack up, the path draws to the flag, a rocket takes off. */
export function PlanScene() {
  const theme = useTheme();
  const c = theme.categorical;
  const path = 'M22 176C80 168 128 128 190 78';
  return (
    <>
      <Piece x={100} y={70} w={180} h={130} at={[0, 0.3]} from={{ y: 200 }} ease="out">
        <Svg width={180} height={130}>
          <Path d="M0 130L90 0L180 130Z" fill={theme.surfaceAlt} />
          <Path d="M70 29L90 0L110 29L100 24L90 33L80 24Z" fill={theme.surface} />
        </Svg>
      </Piece>
      <Piece x={30} y={110} w={140} h={90} at={[0.08, 0.36]} from={{ y: 200 }} ease="out">
        <Svg width={140} height={90}>
          <Path d="M0 90L70 0L140 90Z" fill={theme.border} />
        </Svg>
      </Piece>
      {[0, 1, 2, 3, 4].map((i) => (
        <Piece
          key={i}
          x={14 + i * 24}
          y={200 - (16 + i * 14)}
          w={16}
          h={16 + i * 14}
          at={[0.25 + i * 0.05, 0.42 + i * 0.05]}
          from={{ scaleY: 0 }}
          origin="center bottom">
          <View style={[styles.fill, { borderRadius: 4, backgroundColor: theme.seriesValue }]} />
        </Piece>
      ))}
      <Layer>
        <Draw d={path} length={230} at={[0.45, 0.72]} stroke={theme.positive} strokeWidth={3} />
      </Layer>
      <Piece x={186} y={34} w={40} h={46} at={[0.65, 0.82]} from={{ y: -200 }} ease="bounce" sway={5} origin="left bottom">
        <Svg width={40} height={46}>
          <Path d="M4 2V46" stroke={theme.text} strokeWidth={3} strokeLinecap="round" />
          <Path d="M5 3L34 11L5 20Z" fill={c[1]} />
        </Svg>
      </Piece>
      <Piece x={218} y={14} w={52} h={22} at={[0.8, 0.95]} from={{ scale: 0 }}>
        <View style={[styles.pill, { backgroundColor: c[1], paddingHorizontal: 0 }]}>
          <Text style={{ color: theme.onPrimary, fontSize: 11, fontWeight: '700' }}>GOAL</Text>
        </View>
      </Piece>
      <Piece x={226} y={124} w={40} h={40} at={[0.5, 0.8]} from={{ x: -220, y: 120, rotate: -30 }} ease="out" bob={5}>
        <Ionicons name="rocket" size={34} color={c[6]} />
      </Piece>
      <Chip icon="umbrella" color={c[0]} x={36} y={30} at={[0.72, 0.92]} from={{ scale: 0, rotate: -120 }} ease="elastic" bob={3} />
      {[
        [150, 20],
        [250, 84],
        [92, 64],
      ].map(([sx, sy], i) => (
        <Piece key={i} x={sx} y={sy} w={18} h={18} at={[0.82 + i * 0.05, 0.92 + i * 0.03]} from={{ scale: 0, rotate: 90 }} bob={2}>
          <Ionicons name="sparkles" size={16} color={c[3]} />
        </Piece>
      ))}
    </>
  );
}

const SHIELD = 'M56 0L112 18V64C112 102 86 122 56 132C26 122 0 102 0 64V18Z';
const QUARTERS = [
  { clip: [0, 0], from: { x: -180, y: -140, rotate: -90 }, opacity: 1 },
  { clip: [56, 0], from: { x: 180, y: -140, rotate: 90 }, opacity: 0.85 },
  { clip: [0, 66], from: { x: -180, y: 160, rotate: 90 }, opacity: 0.9 },
  { clip: [56, 66], from: { x: 180, y: 160, rotate: -90 }, opacity: 0.75 },
] as const;

/** 6. Private by design: the shield assembles from four shards, the lock drops in, guards orbit. */
export function PrivacyScene() {
  const theme = useTheme();
  const c = theme.categorical;
  const ring = arc(140, 96, 92, -90, 269.5);
  return (
    <>
      <Layer>
        <Draw d={ring.d} length={ring.length} at={[0.58, 0.9]} stroke={theme.border} strokeWidth={1.5} />
      </Layer>
      {QUARTERS.map((q, i) => (
        <Piece key={i} x={84} y={30} w={112} h={132} at={[i * 0.05, 0.3 + i * 0.05]} from={q.from}>
          <Svg width={112} height={132}>
            <Defs>
              <ClipPath id={`shard${i}`}>
                <Rect x={q.clip[0]} y={q.clip[1]} width={56} height={66} />
              </ClipPath>
            </Defs>
            <Path d={SHIELD} fill={theme.primary} opacity={q.opacity} clipPath={`url(#shard${i})`} />
          </Svg>
        </Piece>
      ))}
      <Piece x={126} y={60} w={28} h={30} at={[0.5, 0.66]} from={{ y: -260 }} ease="bounce">
        <Svg width={28} height={30}>
          <Path d="M5 30V15A9 9 0 0 1 23 15V30" stroke={theme.onPrimary} strokeWidth={5} fill="none" />
        </Svg>
      </Piece>
      <Piece x={118} y={84} w={44} h={34} at={[0.4, 0.58]} from={{ y: -220 }} ease="bounce">
        <View style={[styles.lockBody, { backgroundColor: theme.onPrimary }]}>
          <View style={[styles.keyhole, { backgroundColor: theme.primary }]} />
        </View>
      </Piece>
      <Chip icon="finger-print" color={c[2]} filled size={44} x={24} y={74} at={[0.55, 0.75]} from={{ x: -200, rotate: -180 }} bob={3} />
      <Chip icon="eye-off" color={c[4]} filled size={40} x={212} y={36} at={[0.62, 0.82]} from={{ x: 200, y: -60, rotate: 180 }} bob={-3} />
      <Chip icon="key" color={c[3]} filled size={40} x={208} y={150} at={[0.7, 0.9]} from={{ y: 200, rotate: 360 }} bob={3} />
      <Chip icon="cloud-offline" color={theme.textMuted} size={38} x={40} y={158} at={[0.76, 0.96]} from={{ x: -120, y: 160 }} bob={-3} />
      <Chip icon="checkmark" color={theme.positive} filled size={26} x={168} y={128} at={[0.86, 1]} from={{ scale: 0, rotate: -90 }} ease="elastic" />
    </>
  );
}

const styles = StyleSheet.create({
  chip: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1 },
  phone: { flex: 1, borderRadius: 18, borderWidth: 3, alignItems: 'center', paddingTop: 5 },
  notch: { width: 22, height: 4, borderRadius: 2 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  coin: { flex: 1, borderRadius: 7, borderWidth: 1 },
  card: { flex: 1, borderRadius: 14, borderWidth: 1 },
  header: { flex: 1, borderTopLeftRadius: 14, borderTopRightRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  rowIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  marker: { flex: 1, borderRadius: 5, borderWidth: 2 },
  pill: { flex: 1, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  notice: { flex: 1, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 },
  calendar: { flex: 1, borderRadius: 8, borderWidth: 1, overflow: 'hidden', alignItems: 'center' },
  calendarTop: { alignSelf: 'stretch', height: 13, marginBottom: 2 },
  lockBody: { flex: 1, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  keyhole: { width: 8, height: 12, borderRadius: 4 },
});
