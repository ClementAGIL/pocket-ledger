import { StyleSheet, Text, View } from 'react-native';

import type { Performance } from '@/domain/performance';
import { space, useTheme } from '@/theme';

import { Money, Percent, Row } from './ui';

/**
 * Where the gain comes from: price gains, dividends, interest (they add up to the gain).
 * A composition bar is shown only when every part is positive: a part-to-whole bar can't
 * represent a loss next to gains.
 */
export function GainBreakdown({ perf }: { perf: Performance }) {
  const theme = useTheme();
  const parts = [
    { key: 'price', label: 'Price gains', value: perf.priceGain, color: theme.categorical[0] },
    { key: 'dividends', label: 'Dividends', value: perf.dividends, color: theme.categorical[1] },
    { key: 'interest', label: 'Interest', value: perf.interest, color: theme.categorical[2] },
  ];
  const visible = parts.filter((p) => Math.abs(p.value) >= 0.005);
  const showBar = perf.gain > 0.005 && visible.length > 1 && visible.every((p) => p.value > 0);

  return (
    <View style={[styles.wrap, { borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.textSecondary }]}>Gain breakdown</Text>
      {showBar && (
        <View
          style={styles.bar}
          accessible
          accessibilityLabel={visible.map((p) => `${p.label} ${Math.round((p.value / perf.gain) * 100)}%`).join(', ')}>
          {visible.map((p) => (
            <View key={p.key} style={{ flex: p.value / perf.gain, backgroundColor: p.color }} />
          ))}
        </View>
      )}
      {parts.map((p) => (
        <Row key={p.key} label={p.label}>
          <View style={styles.value}>
            <View style={[styles.swatch, { backgroundColor: p.color }]} />
            <Money value={p.value} signed colored />
          </View>
        </Row>
      ))}
      <View style={[styles.total, { borderColor: theme.border }]}>
        <Row label="Total gain">
          <View style={styles.value}>
            <Money value={perf.gain} signed colored style={{ fontWeight: '600' }} />
            <Percent ratio={perf.pct} style={{ fontWeight: '600' }} />
          </View>
        </Row>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.xs },
  // 2px surface gaps between segments.
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2, marginVertical: space.sm },
  value: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  total: { marginTop: space.xs, paddingTop: space.xs, borderTopWidth: StyleSheet.hairlineWidth },
});
