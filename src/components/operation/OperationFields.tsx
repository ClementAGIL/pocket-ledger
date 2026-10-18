import { StyleSheet, Switch, Text, View } from 'react-native';

import { formatDate } from '@/domain/format';
import type { EvaluatedOperation, Operation, OperationDraft, OperationErrors } from '@/domain/operations';
import type { Valuation } from '@/domain/types';
import { useMoney } from '@/hooks/useMoney';
import { space, useTheme } from '@/theme';

import { DateField } from '../DateField';
import { Field, Input, Segmented } from '../ui';
import { RepayPlanPreview } from './Preview';

/** The fields of the selected operation: date, then what that operation needs. */
export function OperationFields({
  op,
  draft,
  onChange,
  errors,
  evaluation,
  valuation,
  isLiability,
  isEdit,
}: {
  op: Operation;
  draft: OperationDraft;
  onChange: (patch: Partial<OperationDraft>) => void;
  /** Errors to display (empty until the user tries to save). */
  errors: OperationErrors;
  evaluation: EvaluatedOperation;
  valuation: Valuation | null;
  isLiability: boolean;
  isEdit: boolean;
}) {
  const theme = useTheme();
  const { money } = useMoney();
  const { loan } = evaluation;
  const isTrade = op === 'BUY' || op === 'SELL';

  return (
    <>
      <Field label="Date" error={errors.date}>
        <DateField value={draft.date} onChange={(date) => onChange({ date })} />
      </Field>

      {isTrade && (
        <>
          <Field label="Quantity" error={errors.quantity}>
            <Input value={draft.quantity} onChangeText={(quantity) => onChange({ quantity })} keyboardType="decimal-pad" placeholder="0" />
          </Field>
          <Field label={draft.priceMode === 'unit' ? 'Unit price (€)' : 'Total amount (€)'} error={errors.price}>
            <Segmented
              options={[
                { value: 'unit', label: 'Unit price' },
                { value: 'total', label: 'Total' },
              ]}
              value={draft.priceMode}
              onChange={(priceMode) => onChange({ priceMode })}
            />
            {draft.priceMode === 'unit' ? (
              <Input value={draft.unitPrice} onChangeText={(unitPrice) => onChange({ unitPrice })} keyboardType="decimal-pad" placeholder="0.00" />
            ) : (
              <Input value={draft.total} onChangeText={(total) => onChange({ total })} keyboardType="decimal-pad" placeholder="0.00" />
            )}
          </Field>
          <Field label="Fees (€, optional)" error={errors.fees}>
            <Input value={draft.fees} onChangeText={(fees) => onChange({ fees })} keyboardType="decimal-pad" placeholder="0.00" />
          </Field>
        </>
      )}

      {op === 'PRICE' && (
        <Field
          label={valuation === 'units' ? 'Current price per unit (€)' : isLiability ? 'Remaining balance (€)' : 'Current total value (€)'}
          error={errors.price}>
          <Input value={draft.unitPrice} onChangeText={(unitPrice) => onChange({ unitPrice })} keyboardType="decimal-pad" placeholder="0.00" />
        </Field>
      )}

      {op === 'WITHDRAW' && isLiability && !isEdit && (
        <Field label="Enter">
          <Segmented
            options={[
              { value: 'amount', label: 'Amount repaid' },
              { value: 'balance', label: 'New balance' },
            ]}
            value={draft.repayMode}
            onChange={(repayMode) => onChange({ repayMode })}
          />
        </Field>
      )}

      {evaluation.isRepayByBalance ? (
        <>
          <Field
            label="Current balance (€)"
            hint={loan?.date ? `Last known: ${money(loan.balance)} on ${formatDate(loan.date)}` : undefined}
            error={errors.balance}>
            <Input value={draft.newBalance} onChangeText={(newBalance) => onChange({ newBalance })} keyboardType="decimal-pad" placeholder="0.00" />
          </Field>
          <View style={styles.switchRow}>
            <Text style={{ color: theme.text, fontSize: 15, flex: 1 }}>Paid every month</Text>
            <Switch
              value={draft.monthly}
              onValueChange={(monthly) =>
                // Default the payment day to the day of the last known balance.
                onChange(monthly && !draft.payDay && loan?.date ? { monthly, payDay: String(Number(loan.date.slice(8, 10))) } : { monthly })
              }
            />
          </View>
          {draft.monthly && (
            <Field label="Payment day of the month" error={errors.payDay}>
              <Input value={draft.payDay} onChangeText={(payDay) => onChange({ payDay })} keyboardType="number-pad" placeholder="10" maxLength={2} />
            </Field>
          )}
          {evaluation.repayPlan.length > 0 && <RepayPlanPreview plan={evaluation.repayPlan} />}
        </>
      ) : (
        (op === 'DEPOSIT' || op === 'WITHDRAW' || op === 'INCOME') && (
          <Field label="Amount (€)" error={errors.amount}>
            <Input value={draft.amount} onChangeText={(amount) => onChange({ amount })} keyboardType="decimal-pad" placeholder="0.00" />
          </Field>
        )
      )}

      {op !== 'PRICE' && (
        <Field label="Note (optional)">
          <Input value={draft.note} onChangeText={(note) => onChange({ note })} placeholder="" />
        </Field>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg, minHeight: 48 },
});
