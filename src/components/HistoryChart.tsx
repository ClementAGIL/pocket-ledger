import { useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { dayNumber } from '@/domain/dates';
import { formatDate, formatEuro } from '@/domain/format';
import type { ISODate } from '@/domain/types';
import { space, useTheme } from '@/theme';

export interface ChartPoint {
  date: ISODate;
  value: number;
  /** Omit to draw a single series. */
  invested?: number;
  /** Optional dashed comparison line ("what if"). */
  benchmark?: number;
}

const HEIGHT = 180;
const PAD_TOP = 8;
const PAD_BOTTOM = 4;

export function HistoryChart({
  points,
  hidden,
  valueLabel = 'Value',
  investedLabel = 'Invested',
  benchmarkLabel = 'Benchmark',
}: {
  points: ChartPoint[];
  hidden?: boolean;
  valueLabel?: string;
  investedLabel?: string;
  benchmarkLabel?: string;
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

  const linePath = (get: (p: ChartPoint) => number) => {
    if (points.length === 1) return `M0,${y(get(points[0]))} L${width},${y(get(points[0]))}`;
    return points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(get(p)).toFixed(1)}`).join(' ');
  };
  const valuePath = linePath((p) => p.value);
  const areaPath = `${valuePath} L${width},${y(yMin)} L0,${y(yMin)} Z`;
  const investedPath = hasInvested ? linePath((p) => p.invested ?? 0) : null;
  const benchmarkPath = hasBenchmark ? linePath((p) => p.benchmark ?? 0) : null;

  const pick = (e: GestureResponderEvent) => {
    const touchX = e.nativeEvent.locationX;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - touchX) < Math.abs(x(best) - touchX)) best = i;
    setActive(best);
  };

  const shown = active !== null ? points[active] : points[points.length - 1];

  return (
    <View>
      {/* Legend doubles as the tooltip: it shows the touched point, or the latest one. */}
      <View style={styles.legend}>
        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{formatDate(shown.date)}</Text>
        <View style={styles.legendItems}>
          <LegendItem color={theme.seriesValue} label={valueLabel} value={formatEuro(shown.value, { hidden, rounded: true })} />
          {hasInvested && (
            <LegendItem
              color={theme.seriesInvested}
              label={investedLabel}
              value={formatEuro(shown.invested ?? 0, { hidden, rounded: true })}
            />
          )}
          {hasBenchmark && (
            <LegendItem
              dashed
              color={theme.seriesBenchmark}
              label={benchmarkLabel}
              value={formatEuro(shown.benchmark ?? 0, { hidden, rounded: true })}
            />
          )}
        </View>
      </View>

      <View
        style={{ height: HEIGHT }}
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
          <Svg width={width} height={HEIGHT}>
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
            {active !== null && (
              <Line x1={x(active)} x2={x(active)} y1={0} y2={HEIGHT} stroke={theme.textMuted} strokeWidth={1} />
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
