import { Text, View } from 'react-native';

import { formatPercent } from '@/domain/format';
import type { AnnualizedReturn as Return } from '@/domain/returns';
import { space, useTheme } from '@/theme';

import { Percent } from './ui';

/** "▲ 7.4%/yr", or why there is none yet (held less than a year, nothing to compare). */
export function AnnualizedReturn({ value, compareTo }: { value: Return | undefined; compareTo?: number }) {
  const theme = useTheme();
  if (!value?.meaningful) {
    return <Text style={{ color: theme.textMuted }}>{value && value.years > 0 ? 'less than 1 year' : '—'}</Text>;
  }
  if (value.rate === null) return <Text style={{ color: theme.textMuted }}>—</Text>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs }}>
      <Percent ratio={value.rate} />
      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>/yr</Text>
      {compareTo !== undefined && compareTo > 0 && (
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>vs {formatPercent(compareTo)}</Text>
      )}
    </View>
  );
}
