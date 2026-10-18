import { Fragment, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { formatCompactEuro, formatEuro } from '@/domain/format';
import { chartBounds, type Month, type MonthSavings } from '@/domain/savings';
import { space, useTheme } from '@/theme';

const HEIGHT = 170;
const PAD = 6;
/** Room for the value label of a cut bar. */
const LABEL_SPACE = 16;
const MAX_BAR = 24;
const RADIUS = 4;
const MAX_LABELS = 6;

export function formatMonth(month: Month, long = false) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, long ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' });
}

/** Bar from the baseline to `top`: rounded data end, square at the baseline. */
function barPath(x: number, w: number, base: number, top: number) {
  const h = Math.abs(base - top);
  if (h < 0.5) return '';
  const r = Math.min(RADIUS, w / 2, h);
  if (top < base) {
    return `M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${x + w},${top} ${x + w},${top + r} L${x + w},${base} Z`;
  }
  return `M${x},${base} L${x},${top - r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${x + w},${top} ${x + w},${top - r} L${x + w},${base} Z`;
}

/** Non-zero parts of a month, for the tooltip. */
function breakdown(m: MonthSavings): [string, number][] {
  const parts: [string, number][] = [
    ['invested', m.added],
    ['withdrawn', m.withdrawn],
    ['borrowed', m.borrowed],
    ['repaid', m.repaid],
  ];
  return parts.filter(([, v]) => Math.abs(v) >= 0.5);
}

/** Saving effort per month: bars above zero when net worth grew from your money, below otherwise. */
export function SavingsChart({ months, average, hidden }: { months: MonthSavings[]; average: number; hidden?: boolean }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const addedColor = theme.categorical[0];
  const withdrawnColor = theme.categorical[1];

  // The scale follows "normal" months; exceptional ones are drawn cut, with their value on top.
  const values = months.map((m) => m.net);
  const { top, bottom } = chartBounds(values);
  const cutTop = values.some((v) => v > top);
  const cutBottom = values.some((v) => v < bottom);
  const yMax = top || 1;
  const yMin = bottom;
  const span = yMax - yMin || 1;
  const padTop = PAD + (cutTop ? LABEL_SPACE : 0);
  const padBottom = PAD + (cutBottom ? LABEL_SPACE : 0);
  const y = (v: number) => padTop + ((yMax - Math.min(Math.max(v, yMin), yMax)) / span) * (HEIGHT - padTop - padBottom);
  const base = y(0);
  /** Cut bars overshoot the scale a little so they read as "taller than shown". */
  const barEnd = (v: number) => (v > yMax ? padTop - 6 : v < yMin ? HEIGHT - padBottom + 6 : y(v));
  const showAverage = Math.abs(average) > 0.005 && average <= yMax && average >= yMin;

  const slot = months.length ? width / months.length : 0;
  const barWidth = Math.max(2, Math.min(MAX_BAR, slot - 2));
  const barX = (i: number) => i * slot + (slot - barWidth) / 2;

  const pick = (e: GestureResponderEvent) => {
    if (!slot) return;
    setActive(Math.max(0, Math.min(months.length - 1, Math.floor(e.nativeEvent.locationX / slot))));
  };

  const shown = active !== null ? months[active] : null;
  const labelEvery = Math.max(1, Math.ceil(months.length / MAX_LABELS));

  return (
    <View>
      {/* Legend doubles as the tooltip for the touched bar. */}
      <View style={styles.legend}>
        {shown ? (
          <>
            <Text style={{ color: theme.text, fontWeight: '600' }}>{formatMonth(shown.month, true)}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] }}>
              Saved {formatEuro(shown.net, { hidden, signed: true, rounded: true })}
              {breakdown(shown)
                .map(([label, value]) => ` · ${label} ${formatEuro(value, { hidden, rounded: true })}`)
                .join('')}
            </Text>
          </>
        ) : (
          <View style={styles.legendItems}>
            <LegendItem color={addedColor} label="Saved" />
            <LegendItem color={withdrawnColor} label="Withdrawn or borrowed" />
            <LegendItem dashed color={theme.textMuted} label={`Average ${formatEuro(average, { hidden, rounded: true })}`} />
          </View>
        )}
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
        accessibilityLabel="Monthly savings chart">
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            {months.map((m, i) => {
              const x = barX(i);
              const end = barEnd(m.net);
              const isCut = m.net > yMax || m.net < yMin;
              const up = m.net >= 0;
              // Break mark ("≈") drawn in the surface color across the cut bar.
              const breakY = up ? end + 10 : end - 10;
              return (
                <Fragment key={m.month}>
                  <Path
                    d={barPath(x, barWidth, base, end)}
                    fill={up ? addedColor : withdrawnColor}
                    opacity={active !== null && active !== i ? 0.35 : 1}
                  />
                  {isCut && (
                    <>
                      <Line x1={x - 1} x2={x + barWidth + 1} y1={breakY + 2} y2={breakY - 2} stroke={theme.surface} strokeWidth={2} />
                      <Line x1={x - 1} x2={x + barWidth + 1} y1={breakY + 6} y2={breakY + 2} stroke={theme.surface} strokeWidth={2} />
                      <SvgText
                        x={x + barWidth / 2}
                        y={up ? end - 4 : end + 12}
                        fontSize={10}
                        fontWeight="600"
                        fill={theme.textSecondary}
                        textAnchor="middle">
                        {formatCompactEuro(m.net, hidden)}
                      </SvgText>
                    </>
                  )}
                </Fragment>
              );
            })}
            <Line x1={0} x2={width} y1={base} y2={base} stroke={theme.grid} strokeWidth={1} />
            {showAverage && (
              <Line
                x1={0}
                x2={width}
                y1={y(average)}
                y2={y(average)}
                stroke={theme.textMuted}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            )}
          </Svg>
        )}
      </View>

      <View style={styles.axis}>
        {months.map((m, i) =>
          i % labelEvery === 0 ? (
            <Text
              key={m.month}
              numberOfLines={1}
              style={[styles.axisText, { color: theme.textMuted, left: i * slot, width: slot * labelEvery }]}>
              {formatMonth(m.month)}
            </Text>
          ) : null,
        )}
      </View>
    </View>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.legendItem}>
      {dashed ? (
        <View style={[styles.dash, { borderColor: color }]} />
      ) : (
        <View style={[styles.swatch, { backgroundColor: color }]} />
      )}
      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { minHeight: 40, justifyContent: 'center', marginBottom: space.sm, gap: 2 },
  legendItems: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  dash: { width: 14, borderTopWidth: 1.5, borderStyle: 'dashed' },
  axis: { height: 16, marginTop: space.xs },
  axisText: { position: 'absolute', fontSize: 11 },
});
