import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NEW_ID, type NewAssetDraft, type NewAssetErrors } from '@/domain/operations';
import { useData } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

import { Select } from '../Select';
import { Card, Field, Input, Segmented } from '../ui';

/** "+ New …" header with a Cancel link, shown instead of a picker while creating. */
export function NewBadge({ label, onCancel }: { label: string; onCancel: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.badgeRow}>
      <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 15 }}>+ {label}</Text>
      <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button">
        <Text style={{ color: theme.textSecondary }}>Cancel</Text>
      </Pressable>
    </View>
  );
}

/** Name, identifier, category (or a new one), account (or a new one) and notes of a new investment. */
export function NewAssetFields({
  value,
  onChange,
  errors,
}: {
  value: NewAssetDraft;
  onChange: (patch: Partial<NewAssetDraft>) => void;
  /** Errors to display (empty until the user tries to save). */
  errors: NewAssetErrors;
}) {
  const theme = useTheme();
  const { snapshot } = useData();

  const categoryOptions = snapshot.categories.map((c) => ({
    value: c.id,
    label: c.name,
    description: c.kind === 'liability' ? 'Debt' : c.valuation === 'units' ? 'Quantity × price' : 'Single value',
    color: c.color,
  }));
  const accountOptions = snapshot.accounts
    .filter((a) => !a.archived)
    .map((a) => ({ value: a.id, label: a.name, description: a.institution ?? undefined }));

  return (
    <Card style={{ marginTop: space.md, paddingTop: 0 }}>
      <Field label="Name" error={errors.name}>
        <Input value={value.name} onChangeText={(name) => onChange({ name })} placeholder="e.g. MSCI World, Bitcoin, Livret A" />
      </Field>
      <Field label="Identifier (optional)" hint="Ticker, ISIN, contract number…">
        <Input
          value={value.identifier}
          onChangeText={(identifier) => onChange({ identifier })}
          placeholder="e.g. CW8, BTC"
          autoCapitalize="characters"
        />
      </Field>

      <Field label="Category" error={errors.category}>
        {value.categoryId === NEW_ID ? (
          <>
            <NewBadge label="New category" onCancel={() => onChange({ categoryId: null })} />
            <Input
              value={value.newCategoryName}
              onChangeText={(newCategoryName) => onChange({ newCategoryName })}
              placeholder="Category name"
              style={{ marginTop: space.sm }}
            />
            <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Type</Text>
            <Segmented
              options={[
                { value: 'asset', label: 'Asset' },
                { value: 'liability', label: 'Debt' },
              ]}
              value={value.newCategoryKind}
              onChange={(k) => onChange(k === 'liability' ? { newCategoryKind: k, newCategoryValuation: 'balance' } : { newCategoryKind: k })}
            />
            {value.newCategoryKind === 'asset' && (
              <>
                <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Valued by</Text>
                <Segmented
                  options={[
                    { value: 'units', label: 'Quantity × price' },
                    { value: 'balance', label: 'Single value' },
                  ]}
                  value={value.newCategoryValuation}
                  onChange={(newCategoryValuation) => onChange({ newCategoryValuation })}
                />
              </>
            )}
          </>
        ) : (
          <Select
            title="Choose a category"
            placeholder="Select a category"
            options={categoryOptions}
            value={value.categoryId}
            onChange={(categoryId) => onChange({ categoryId })}
            createLabel="New category"
            onCreate={() => onChange({ categoryId: NEW_ID })}
          />
        )}
      </Field>

      <Field label="Account" error={errors.account}>
        {value.accountId === NEW_ID ? (
          <>
            <NewBadge label="New account" onCancel={() => onChange({ accountId: null })} />
            <Input
              value={value.newAccountName}
              onChangeText={(newAccountName) => onChange({ newAccountName })}
              placeholder="e.g. Boursorama PEA, Binance, Ledger"
              style={{ marginTop: space.sm }}
            />
          </>
        ) : (
          <Select
            title="Choose an account"
            placeholder="Where is it held?"
            options={accountOptions}
            value={value.accountId}
            onChange={(accountId) => onChange({ accountId })}
            createLabel="New account"
            onCreate={() => onChange({ accountId: NEW_ID })}
          />
        )}
      </Field>

      <Field label="Notes (optional)" hint="Why you buy it, your plan… You can add a review date later.">
        <Input
          value={value.note}
          onChangeText={(note) => onChange({ note })}
          multiline
          placeholder="e.g. Long-term core holding"
          style={{ minHeight: 72, paddingTop: space.md, textAlignVertical: 'top' }}
        />
      </Field>
    </Card>
  );
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
  subLabel: { fontSize: 12, marginTop: space.md, marginBottom: space.xs },
});
