import { Text, View } from 'react-native';

import type { ProjectionSettings, SavingPace } from '@/domain/projection';
import { useMoney } from '@/hooks/useMoney';
import type { NumberDraft } from '@/hooks/useNumberDraft';
import { space, useTheme } from '@/theme';

import { Card, Field, Input, Segmented } from '../ui';
import { goalStyles, type SaveProjection } from './styles';

/** Goals › yearly saving: your recent pace, or a custom amount. */
export function SavingCard({
  s,
  save,
  savingDraft,
  pace,
}: {
  s: ProjectionSettings;
  save: SaveProjection;
  savingDraft: NumberDraft;
  pace: SavingPace;
}) {
  const theme = useTheme();
  const { money, hidden } = useMoney({ rounded: true });
  return (
    <Card>
      <Text style={[goalStyles.cardTitle, { color: theme.text }]}>Yearly saving</Text>
      <View style={{ marginTop: space.md }}>
        <Segmented
          options={[
            { value: 'mine', label: `Your pace ${money(pace.yearly)}` },
            { value: 'custom', label: 'Custom' },
          ]}
          value={s.saving}
          onChange={(saving) => {
            // Start the custom amount from the current pace rather than from zero.
            if (saving === 'custom' && savingDraft.text === '') {
              const suggested = Math.round(pace.yearly / 100) * 100;
              savingDraft.reset(suggested);
              save({ saving, customSaving: suggested });
            } else save({ saving });
          }}
        />
      </View>
      {s.saving === 'custom' ? (
        <Field label="Amount per year (€)" hint="Added every month (1/12 each). Negative to withdraw.">
          <Input
            value={savingDraft.text}
            onChangeText={savingDraft.setText}
            onEndEditing={() => save({ customSaving: s.customSaving })}
            keyboardType="numbers-and-punctuation"
            placeholder="12000"
            secureTextEntry={hidden}
          />
        </Field>
      ) : (
        <Text style={[goalStyles.hint, { color: theme.textMuted }]}>
          {pace.months === 0
            ? 'No saving yet: add operations to see your pace.'
            : `Money put into your investments minus what you took out, averaged over the last ${pace.months} month${pace.months > 1 ? 's' : ''}${
                pace.excluded ? ` (${pace.excluded} exceptional month${pace.excluded > 1 ? 's' : ''} left out)` : ''
              }. Loan repayments are not counted.`}
        </Text>
      )}
    </Card>
  );
}
