import { Text, View } from 'react-native';

import { formatPercent } from '@/domain/format';
import type { InflationChoice, ProjectionSettings, RateChoice } from '@/domain/projection';
import type { NumberDraft } from '@/hooks/useNumberDraft';
import { space, useTheme } from '@/theme';

import { Card, Chips, Field, Input } from '../ui';
import { goalStyles, type SaveProjection } from './styles';

/** Goals › growth rate (yours, 4/7/10%, custom) and inflation. */
export function GrowthCard({
  s,
  save,
  rateDraft,
  inflationDraft,
  mine,
  rateChoice,
  rate,
  inflation,
  growth,
}: {
  s: ProjectionSettings;
  save: SaveProjection;
  rateDraft: NumberDraft;
  inflationDraft: NumberDraft;
  /** Your annualized return, null before a year of history. */
  mine: number | null;
  /** The choice shown ("Yours" falls back to 7% while it's not available). */
  rateChoice: RateChoice;
  /** Yearly rate, inflation (0 when off) and the growth after inflation. */
  rate: number;
  inflation: number;
  growth: number;
}) {
  const theme = useTheme();
  return (
    <Card>
      <Text style={[goalStyles.cardTitle, { color: theme.text }]}>Growth rate</Text>
      <View style={{ marginTop: space.md }}>
        <Chips
          options={[
            ...(mine !== null ? [{ value: 'mine' as const, label: `Yours ${formatPercent(mine)}` }] : []),
            { value: '4' as const, label: '4%' },
            { value: '7' as const, label: '7%' },
            { value: '10' as const, label: '10%' },
            { value: 'custom' as const, label: 'Custom' },
          ]}
          value={rateChoice}
          onChange={(rate) => save({ rate })}
        />
      </View>
      {rateChoice === 'custom' && (
        <Field label="Yearly rate (%)" hint="Before inflation. Can be negative.">
          <Input
            value={rateDraft.text}
            onChangeText={rateDraft.setText}
            onEndEditing={() => save({ customRate: s.customRate })}
            keyboardType="numbers-and-punctuation"
            placeholder="5"
          />
        </Field>
      )}
      <Text style={[goalStyles.hint, { color: theme.textMuted }]}>
        {mine !== null
          ? `"Yours" is your real annualized return since the start (Home › Today).`
          : 'Your own rate appears after one year of history.'}
      </Text>

      <Text style={[goalStyles.subTitle, { color: theme.text }]}>Inflation</Text>
      <View style={{ marginTop: space.sm }}>
        <Chips<InflationChoice>
          options={[
            { value: 'off', label: 'Off' },
            { value: '2', label: '2%' },
            { value: '3', label: '3%' },
            { value: 'custom', label: 'Custom' },
          ]}
          value={s.inflation}
          onChange={(inflation) => save({ inflation })}
        />
      </View>
      {s.inflation === 'custom' && (
        <Field label="Yearly inflation (%)">
          <Input
            value={inflationDraft.text}
            onChangeText={inflationDraft.setText}
            onEndEditing={() => save({ customInflation: s.customInflation })}
            keyboardType="decimal-pad"
            placeholder="2.5"
          />
        </Field>
      )}
      <Text style={[goalStyles.hint, { color: theme.textMuted }]}>
        {inflation > 0
          ? `Amounts are in today’s euros: what they would buy now. Growth is ${formatPercent(rate)} − ${formatPercent(inflation)} inflation ≈ ${formatPercent(growth)} a year, and your saving rises with prices. 2% is the ECB target.`
          : 'Amounts are in future euros: a FIRE number will buy less then than it does today.'}
      </Text>
    </Card>
  );
}
