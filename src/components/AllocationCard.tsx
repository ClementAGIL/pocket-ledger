import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import {
  ALLOCATION_VIEWS,
  buildAllocation,
  foldSlices,
  OTHER_KEY,
  type AllocationBy,
  type AllocationSlice,
} from '@/domain/allocation';
import { formatPercent } from '@/domain/format';
import { useMoney } from '@/hooks/useMoney';
import { useData } from '@/state/DataProvider';
import { space, useTheme, type Theme } from '@/theme';

import { Card, Segmented, TextLink } from './ui';

const SIZE = 200;
const OUTER = SIZE / 2;
const THICKNESS = 28;
const INNER = OUTER - THICKNESS;
/** Rows shown before "Show all". */
const COLLAPSED_ROWS = 8;

/** Colors follow the entity: a category keeps its own color, others take palette slots in order. */
function sliceColors(slices: AllocationSlice[], entityColors: Map<string, string | null>, theme: Theme) {
  const colors = new Map<string, string>();
  let slot = 0;
  for (const s of slices) {
    if (s.key === OTHER_KEY) colors.set(s.key, theme.categoricalOther);
    else colors.set(s.key, entityColors.get(s.key) ?? theme.categorical[slot++ % theme.categorical.length]);
  }
  return colors;
}

function arcPath(start: number, end: number) {
  const point = (r: number, a: number) => `${(OUTER + r * Math.sin(a)).toFixed(2)},${(OUTER - r * Math.cos(a)).toFixed(2)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M${point(OUTER, start)}`,
    `A${OUTER},${OUTER} 0 ${large} 1 ${point(OUTER, end)}`,
    `L${point(INNER, end)}`,
    `A${INNER},${INNER} 0 ${large} 0 ${point(INNER, start)}`,
    'Z',
  ].join(' ');
}

/** Part-to-whole of the assets, by category, account or investment: donut + complete table. */
export function AllocationCard() {
  const theme = useTheme();
  const { portfolio } = useData();
  const { money } = useMoney({ rounded: true });
  const [by, setBy] = useState<AllocationBy>('category');
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const allocation = buildAllocation(portfolio, by);
  const slices = foldSlices(allocation.items);
  const colors = sliceColors(slices, new Map(allocation.items.map((i) => [i.key, i.color])), theme);
  const sliceOf = new Map(slices.flatMap((s) => s.members.map((m) => [m, s.key] as const)));
  const active = slices.find((s) => s.key === selected) ?? null;

  const changeView = (v: AllocationBy) => {
    setBy(v);
    setSelected(null);
    setExpanded(false);
  };
  const toggle = (key: string) => setSelected((prev) => (prev === key ? null : key));

  if (allocation.items.length === 0) return null;

  let angle = 0;
  const rows = expanded ? allocation.items : allocation.items.slice(0, COLLAPSED_ROWS);

  return (
    <Card>
      <Segmented options={ALLOCATION_VIEWS} value={by} onChange={changeView} />

      <View style={styles.chartWrap}>
        <Svg width={SIZE} height={SIZE} accessibilityLabel="Allocation chart">
          {slices.length === 1 ? (
            <Circle
              cx={OUTER}
              cy={OUTER}
              r={OUTER - THICKNESS / 2}
              stroke={colors.get(slices[0].key)}
              strokeWidth={THICKNESS}
              fill="none"
              onPress={() => toggle(slices[0].key)}
            />
          ) : (
            slices.map((s) => {
              const start = angle;
              angle += s.weight * 2 * Math.PI;
              return (
                <Path
                  key={s.key}
                  d={arcPath(start, angle)}
                  fill={colors.get(s.key)}
                  opacity={active && active.key !== s.key ? 0.3 : 1}
                  // 2px surface gap between segments.
                  stroke={theme.surface}
                  strokeWidth={2}
                  onPress={() => toggle(s.key)}
                />
              );
            })
          )}
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Text numberOfLines={1} style={[styles.centerLabel, { color: theme.textSecondary }]}>
            {active ? active.label : 'Assets'}
          </Text>
          <Text style={[styles.centerValue, { color: theme.text }]}>
            {active ? formatPercent(active.weight) : money(allocation.total)}
          </Text>
          {active && (
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              {money(active.value)}
            </Text>
          )}
        </View>
      </View>

      {/* Complete table: also the legend. */}
      {rows.map((item) => {
        const sliceKey = sliceOf.get(item.key)!;
        const isActive = active?.key === sliceKey;
        return (
          <Pressable
            key={item.key}
            onPress={() => toggle(sliceKey)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            style={[styles.row, { borderColor: theme.border }, isActive && { backgroundColor: theme.surfaceAlt }]}>
            <View style={[styles.dot, { backgroundColor: colors.get(sliceKey) }]} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15 }}>
                {item.label}
              </Text>
              {item.sublabel && (
                <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 12 }}>
                  {item.sublabel}
                </Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.pct, { color: theme.text }]}>{formatPercent(item.weight)}</Text>
              <Text style={{ color: theme.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                {money(item.value)}
              </Text>
            </View>
          </Pressable>
        );
      })}
      {allocation.items.length > COLLAPSED_ROWS && (
        <TextLink
          title={expanded ? 'Show less' : `Show all (${allocation.items.length})`}
          weight="600"
          onPress={() => setExpanded((e) => !e)}
          style={styles.more}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  chartWrap: { alignItems: 'center', justifyContent: 'center', marginVertical: space.lg },
  center: {
    position: 'absolute',
    width: INNER * 2 - 16,
    alignItems: 'center',
  },
  centerLabel: { fontSize: 13 },
  centerValue: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  pct: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  more: { alignItems: 'center', paddingVertical: space.md },
});
