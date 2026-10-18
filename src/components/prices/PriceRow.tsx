import { StyleSheet, Text, TextInput, View } from 'react-native';

import { StalenessBadge } from '@/components/StalenessBadge';
import { Input, Percent } from '@/components/ui';
import { formatDate, formatNumber, parseNumber } from '@/domain/format';
import type { AssetView } from '@/domain/portfolio';
import { relativeChange } from '@/domain/priceUpdates';
import { useMoney } from '@/hooks/useMoney';
import { space, useTheme } from '@/theme';

/** Update prices: one investment, its current price and the new one typed, with the change. */
export function PriceRow({
  view,
  last,
  value,
  invalid,
  onChange,
  onSubmit,
  isLastInput,
  inputRef,
}: {
  view: AssetView;
  last: boolean;
  value: string;
  invalid: boolean;
  onChange: (text: string) => void;
  onSubmit: () => void;
  isLastInput: boolean;
  inputRef: (el: TextInput | null) => void;
}) {
  const theme = useTheme();
  const { money, hidden } = useMoney();
  const { asset, account, position: p, isLiability } = view;
  const units = asset.valuation === 'units';

  // What the field replaces: the unit price for `units` assets, the whole value otherwise.
  const current = units ? p.price : p.value;
  const entered = parseNumber(value);
  const typed = value.trim() !== '' && !invalid && entered !== null;
  const change = typed ? relativeChange(current, entered) : null;
  const newValue = typed ? (units ? p.quantity * entered : entered) : null;

  const currentLabel =
    current === null
      ? 'No price yet'
      : units
        ? `${formatNumber(current, 4)} € per unit`
        : money(current);

  return (
    <View style={[styles.row, { borderColor: theme.border }, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
          {asset.name}
          {asset.identifier ? <Text style={{ color: theme.textMuted, fontWeight: '400' }}> · {asset.identifier}</Text> : null}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={1}>
          {account.name}
          {units ? ` · ${formatNumber(p.quantity)} units` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <StalenessBadge priceDate={p.priceDate} frequency={view.category.updateReminder} />
          <Text style={{ color: theme.textSecondary, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
            {currentLabel}
            {p.priceDate ? ` · ${formatDate(p.priceDate)}` : ''}
          </Text>
        </View>
        {typed && (
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            {units && newValue !== null && (
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>→ {money(newValue, { rounded: true })}</Text>
            )}
            {!isLiability && change !== null && <Percent ratio={change} style={{ fontSize: 12 }} />}
          </View>
        )}
        {invalid && <Text style={{ color: theme.negative, fontSize: 12 }}>Invalid number</Text>}
      </View>
      <Input
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        submitBehavior={isLastInput ? 'blurAndSubmit' : 'submit'}
        returnKeyType={isLastInput ? 'done' : 'next'}
        keyboardType="decimal-pad"
        placeholder={current !== null && !(hidden && !units) ? formatNumber(current, units ? 4 : 2) : '0.00'}
        accessibilityLabel={`New ${units ? 'price' : isLiability ? 'balance' : 'value'} for ${asset.name}`}
        style={[styles.input, invalid && { borderColor: theme.negative }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: { width: 120, textAlign: 'right' },
});
