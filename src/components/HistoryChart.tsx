import { useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { txLabel } from '@/components/asset/EntryLine';
import { dayNumber } from '@/domain/dates';
import { formatDate, formatEuro, formatNumber } from '@/domain/format';
import type { ChartMark, MarkKind } from '@/domain/history';
import type { ISODate } from '@/domain/types';
import { space, useTheme, type Theme } from '@/theme';

export interface ChartPoint {
  date: ISODate;
  value: number;
  /** Omit to draw a single series. */
  invested?: number;
  /** Optional dashed comparison line ("what if"). */
  benchmark?: number;
  /** A projection after the last real point: drawn dashed, after the real ones. */
  projected?: boolean;
}

const HEIGHT = 180;
const PAD_TOP = 8;
const PAD_BOTTOM = 4;
/** Marks strip under the chart: one lane per kind of mark present. */
const LANE = 12;
/** Marks closer than this (px) are drawn as one bigger mark. */
const BUCKET = 10;
const MARK_LANES: MarkKind[] = ['in', 'out', 'income'];
const MARK_GLYPHS: Record<MarkKind, string> = { in: '▲', out: '▼', income: '●' };
const markColor = (theme: Theme, kind: MarkKind) =>
  kind === 'in' ? theme.positive : kind === 'out' ? theme.negative : theme.categorical[3];
/** At most this many operations listed in the tooltip. */
const MAX_TOOLTIP_MARKS = 3;

export function HistoryChart({
  points,
  hidden,
  valueLabel = 'Value',
  investedLabel = 'Invested',
  benchmarkLabel = 'Benchmark',
  marks = [],
  isLiability = false,
}: {
  points: ChartPoint[];
  hidden?: boolean;
  valueLabel?: string;
  investedLabel?: string;
  benchmarkLabel?: string;
  /** Buys, sells and dividends, drawn in a strip under the chart and listed when scrubbing. */
  marks?: ChartMark[];
  /** Mark labels of a loan: "Borrow" / "Repay". */
  isLiability?: boolean;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const hasInvested = points.some((p) => p.invested !== undefined);
  const hasBenchmark = points.some((p) => p.benchmark !== undefined);

  if (points.length === 0) {
    return (
      <View style={[styles.empty, { borderColor: theme.border }]}>
        <Text style={{ color: theme.textMuted }}>No history yet</Text>
      </View>
    );
  }

  const xs = points.map((p) => dayNumber(p.date));
  const xMin = xs[0];
  const xMax = Math.max(xs[xs.length - 1], xMin + 1);
  const values = points.flatMap((p) => [p.value, p.invested, p.benchmark].filter((v): v is number => v !== undefined));
  const yMax = Math.max(...values, 0) * 1.05 || 1;
  const yMin = Math.min(...values, 0);

  const x = (i: number) => (points.length === 1 ? width : ((xs[i] - xMin) / (xMax - xMin)) * width);
  const y = (v: number) => PAD_TOP + (1 - (v - yMin) / (yMax - yMin)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  // Real points, then the projected ones (dashed, starting from the last real point).
  const firstProjected = points.findIndex((p) => p.projected);
  const lastReal = firstProjected === -1 ? points.length - 1 : Math.max(firstProjected - 1, 0);
  const end = points.length - 1;

  /** Path through points `from`..`to`, skipping those without a value. */
  const linePath = (get: (p: ChartPoint) => number | undefined, from = 0, to = end) => {
    if (points.length === 1) return `M0,${y(get(points[0]) ?? 0)} L${width},${y(get(points[0]) ?? 0)}`;
    const parts: string[] = [];
    for (let i = from; i <= to; i++) {
      const v = get(points[i]);
      if (v !== undefined) parts.push(`${parts.length ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    }
    return parts.join(' ');
  };
  const valuePath = linePath((p) => p.value, 0, lastReal);
  const areaPath = `${valuePath} L${x(lastReal)},${y(yMin)} L0,${y(yMin)} Z`;
  const investedPath = hasInvested ? linePath((p) => p.invested, 0, lastReal) : null;
  const benchmarkPath = hasBenchmark ? linePath((p) => p.benchmark) : null;
  const projectedValuePath = firstProjected > 0 ? linePath((p) => p.value, lastReal) : null;
  const projectedInvestedPath = firstProjected > 0 && hasInvested ? linePath((p) => p.invested, lastReal) : null;

  const pick = (e: GestureResponderEvent) => {
    const touchX = e.nativeEvent.locationX;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - touchX) < Math.abs(x(best) - touchX)) best = i;
    setActive(best);
  };

  const shown = active !== null ? points[active] : points[points.length - 1];

  // Marks inside the chart's dates, grouped by lane and pixel bucket.
  const lastDate = points[points.length - 1].date;
  const visibleMarks = marks.filter((m) => m.date >= points[0].date && m.date <= lastDate);
  const lanes = MARK_LANES.filter((kind) => visibleMarks.some((m) => m.kind === kind));
  const stripHeight = lanes.length ? lanes.length * LANE + 4 : 0;
  const markX = (date: ISODate) =>
    points.length === 1 ? width / 2 : Math.min(width - 5, Math.max(5, ((dayNumber(date) - xMin) / (xMax - xMin)) * width));
  const buckets = new Map<string, { kind: MarkKind; x: number; count: number }>();
  for (const m of visibleMarks) {
    const px = markX(m.date);
    const key = `${m.kind}|${Math.round(px / BUCKET)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.count += m.count;
    else buckets.set(key, { kind: m.kind, x: px, count: m.count });
  }
  // While scrubbing: the operations between the previous point and the touched one.
  const activeMarks =
    active === null ? [] : visibleMarks.filter((m) => m.date <= points[active].date && (active === 0 || m.date > points[active - 1].date));
  const markText = (m: ChartMark) =>
    [
      `${txLabel(m.type, isLiability)}${m.count > 1 ? ` ×${m.count}` : ''}`,
      m.quantity !== null && m.quantity > 0 ? formatNumber(m.quantity) : null,
      formatEuro(m.amount, { hidden, rounded: m.amount >= 100 }),
      formatDate(m.date),
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <View>
      {/* Legend doubles as the tooltip: it shows the touched point, or the latest one. */}
      <View style={styles.legend}>
        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
          {formatDate(shown.date)}
          {shown.projected ? ' · projected' : ''}
        </Text>
        <View style={styles.legendItems}>
          <LegendItem color={theme.seriesValue} label={valueLabel} value={formatEuro(shown.value, { hidden, rounded: true })} />
          {hasInvested && (
            <LegendItem
              color={theme.seriesInvested}
              label={investedLabel}
              value={formatEuro(shown.invested ?? 0, { hidden, rounded: true })}
            />
          )}
          {/* No comparison value on projected points. */}
          {hasBenchmark && shown.benchmark !== undefined && (
            <LegendItem
              dashed
              color={theme.seriesBenchmark}
              label={benchmarkLabel}
              value={formatEuro(shown.benchmark ?? 0, { hidden, rounded: true })}
            />
          )}
        </View>
        {activeMarks.slice(0, MAX_TOOLTIP_MARKS).map((m) => (
          <Text key={`${m.date}${m.type}`} style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>
            <Text style={{ color: markColor(theme, m.kind) }}>{MARK_GLYPHS[m.kind]} </Text>
            {markText(m)}
          </Text>
        ))}
        {activeMarks.length > MAX_TOOLTIP_MARKS && (
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>+{activeMarks.length - MAX_TOOLTIP_MARKS} more</Text>
        )}
      </View>

      <View
        style={{ height: HEIGHT + stripHeight }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderRelease={() => setActive(null)}
        onResponderTerminate={() => setActive(null)}
        accessible
        accessibilityLabel={`${valueLabel} history chart`}>
        {width > 0 && (
          <Svg width={width} height={HEIGHT + stripHeight}>
            <Defs>
              <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={theme.seriesValue} stopOpacity={0.22} />
                <Stop offset="1" stopColor={theme.seriesValue} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Line x1={0} x2={width} y1={y(yMin)} y2={y(yMin)} stroke={theme.grid} strokeWidth={1} />
            <Path d={areaPath} fill="url(#area)" />
            {investedPath && (
              <Path d={investedPath} stroke={theme.seriesInvested} strokeWidth={2} fill="none" strokeLinejoin="round" />
            )}
            {projectedInvestedPath && (
              <Path d={projectedInvestedPath} stroke={theme.seriesInvested} strokeWidth={2} strokeDasharray="6 4" fill="none" strokeLinejoin="round" />
            )}
            {/* Today: where the real values stop and the projection starts. */}
            {firstProjected > 0 && (
              <Line x1={x(lastReal)} x2={x(lastReal)} y1={0} y2={HEIGHT} stroke={theme.textMuted} strokeWidth={1} strokeDasharray="2 3" />
            )}
            {benchmarkPath && (
              <Path
                d={benchmarkPath}
                stroke={theme.seriesBenchmark}
                strokeWidth={2}
                strokeDasharray="6 4"
                fill="none"
                strokeLinejoin="round"
              />
            )}
            <Path d={valuePath} stroke={theme.seriesValue} strokeWidth={2} fill="none" strokeLinejoin="round" />
            {projectedValuePath && (
              <Path d={projectedValuePath} stroke={theme.seriesValue} strokeWidth={2} strokeDasharray="6 4" fill="none" strokeLinejoin="round" />
            )}
            {[...buckets.values()].map((b) => {
              const cy = HEIGHT + 4 + lanes.indexOf(b.kind) * LANE + LANE / 2;
              return <MarkShape key={`${b.kind}${b.x}`} kind={b.kind} x={b.x} y={cy} r={b.count > 1 ? 5 : 3.5} color={markColor(theme, b.kind)} />;
            })}
            {active !== null && (
              <Line x1={x(active)} x2={x(active)} y1={0} y2={HEIGHT + stripHeight} stroke={theme.textMuted} strokeWidth={1} />
            )}
          </Svg>
        )}
      </View>

      <View style={styles.axis}>
        <Text style={[styles.axisText, { color: theme.textMuted }]}>{formatDate(points[0].date)}</Text>
        <Text style={[styles.axisText, { color: theme.textMuted }]}>{formatDate(points[points.length - 1].date)}</Text>
      </View>
    </View>
  );
}

/** ▲ money in, ▼ money out, ● income: told apart by shape, not only by color. */
function MarkShape({ kind, x, y, r, color }: { kind: MarkKind; x: number; y: number; r: number; color: string }) {
  if (kind === 'income') return <Circle cx={x} cy={y} r={r * 0.85} fill={color} />;
  const d = kind === 'in' ? r : -r;
  return <Path d={`M${x},${y - d} L${x + r},${y + d} L${x - r},${y + d} Z`} fill={color} />;
}

function LegendItem({ color, label, value, dashed }: { color: string; label: string; value: string; dashed?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.legendItem}>
      {dashed ? (
        <View style={[styles.dashSwatch, { borderColor: color }]} />
      ) : (
        <View style={[styles.swatch, { backgroundColor: color }]} />
      )}
      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    height: HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
  },
  legend: { marginBottom: space.sm, gap: 2 },
  legendItems: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 3, borderRadius: 2 },
  dashSwatch: { width: 14, borderTopWidth: 2, borderStyle: 'dashed' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
  axisText: { fontSize: 11 },
});
