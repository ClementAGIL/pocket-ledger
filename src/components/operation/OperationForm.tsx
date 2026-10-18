import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import * as repo from '@/db/repo';
import { today } from '@/domain/dates';
import { isCashCategory } from '@/domain/emergency';
import {
  canLinkCash,
  emptyDraft,
  emptyNewAsset,
  evaluateCashLink,
  evaluateOperation,
  hasTypedValue,
  NEW_ID,
  operationsFor,
  validateNewAsset,
  type NewAssetDraft,
  type Operation,
  type OperationDraft,
} from '@/domain/operations';
import type { CategoryKind, PricePoint, Transaction, Valuation } from '@/domain/types';
import { useMoney } from '@/hooks/useMoney';
import { useData, useToday } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

import { Select } from '../Select';
import { Button, Card, Chips, Field, Row, SectionTitle } from '../ui';
import { showSaveError } from '../saveError';
import { NewAssetFields, NewBadge } from './NewAssetFields';
import { OperationFields } from './OperationFields';
import { CurrentPosition, ImpactPreview } from './Preview';

/** Colors offered to a category created from this form (validated palette, in order). */
const CATEGORY_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

export interface OperationFormProps {
  /** Pre-selected asset. */
  assetId?: number;
  /** Edit an existing transaction… */
  editTransaction?: Transaction;
  /** …or an existing price update. */
  editPrice?: PricePoint;
  onSaved: (assetId: number) => void;
}

/**
 * Add (or edit) an operation: pick or create the investment, pick the operation, fill its fields,
 * check the preview, save. The rules live in `src/domain/operations.ts`; this is the screen.
 */
export function OperationForm({ assetId: initialAssetId, editTransaction, editPrice, onSaved }: OperationFormProps) {
  const theme = useTheme();
  const { snapshot, portfolio, write } = useData();
  const { money } = useMoney();
  const now = useToday();
  const isEdit = !!(editTransaction || editPrice);

  /** Buy / sell: start from the last known unit price (still editable). */
  const lastPrice = (id: number | null | undefined) => {
    const v = id ? portfolio.byAssetId.get(id) : undefined;
    return v && v.asset.valuation === 'units' && v.position.price ? String(Math.round(v.position.price * 1e6) / 1e6) : '';
  };

  const [assetId, setAssetId] = useState<number | null>(editTransaction?.assetId ?? editPrice?.assetId ?? initialAssetId ?? null);
  const [newAsset, setNewAsset] = useState<NewAssetDraft>(emptyNewAsset);
  const [op, setOp] = useState<Operation | null>(editPrice ? 'PRICE' : (editTransaction?.type ?? null));
  const [draft, setDraft] = useState<OperationDraft>(() => ({
    ...emptyDraft(editTransaction?.date ?? editPrice?.date ?? today()),
    quantity: editTransaction?.quantity != null ? String(editTransaction.quantity) : '',
    unitPrice:
      editTransaction?.unitPrice != null
        ? String(editTransaction.unitPrice)
        : editPrice
          ? String(editPrice.price)
          : isEdit
            ? ''
            : lastPrice(initialAssetId),
    amount: editTransaction && editTransaction.quantity == null ? String(editTransaction.amount) : '',
    fees: editTransaction?.fees ? String(editTransaction.fees) : '',
    note: editTransaction?.note ?? '',
  }));
  // Cash account that pays (buy) or receives (sale, dividend) the money; 0 = not tracked.
  const [cashAssetId, setCashAssetId] = useState<number>(
    () => (editTransaction?.linkedId != null ? portfolio.txById.get(editTransaction.linkedId)?.assetId : undefined) ?? 0,
  );
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const updateDraft = (patch: Partial<OperationDraft>) => setDraft((d) => ({ ...d, ...patch }));

  // The Add tab stays open across days: a date left on "today" moves to the new day.
  const [shownDay, setShownDay] = useState(now);
  if (shownDay !== now) {
    setShownDay(now);
    if (!isEdit && draft.date === shownDay) setDraft((d) => ({ ...d, date: now }));
  }
  const updateNewAsset = (patch: Partial<NewAssetDraft>) => setNewAsset((a) => ({ ...a, ...patch }));

  // --- What is being operated on ---
  const isNewAsset = assetId === NEW_ID;
  const asset = assetId ? portfolio.byAssetId.get(assetId)?.asset : undefined;
  const isNewCategory = isNewAsset && newAsset.categoryId === NEW_ID;
  const category = isNewCategory
    ? null
    : snapshot.categories.find((c) => c.id === (asset?.categoryId ?? (isNewAsset ? newAsset.categoryId : null)));
  const valuation: Valuation | null = asset?.valuation ?? (isNewCategory ? newAsset.newCategoryValuation : (category?.valuation ?? null));
  const kind: CategoryKind | null = isNewCategory ? newAsset.newCategoryKind : (category?.kind ?? null);
  const isLiability = kind === 'liability';

  const ops = valuation && kind ? operationsFor(valuation, kind, isNewAsset) : [];
  const currentOp = op && ops.some((o) => o.value === op) ? op : (ops[0]?.value ?? null);
  const opLabel = ops.find((o) => o.value === currentOp)?.label ?? '';

  // --- Rules: validation, records to save, preview ---
  const evaluation =
    currentOp && valuation && kind
      ? evaluateOperation(currentOp, draft, {
          valuation,
          kind,
          // From the per-investment index (small arrays), minus the entry being edited.
          txs: asset ? (portfolio.txByAsset.get(asset.id) ?? []).filter((t) => t.id !== editTransaction?.id) : [],
          prices: asset ? (portfolio.pricesByAsset.get(asset.id) ?? []).filter((p) => p.id !== editPrice?.id) : [],
          isNewAsset,
          isEdit,
          today: now,
          // An edited entry keeps its place in its day.
          savedAt: editTransaction?.createdAt ?? editPrice?.createdAt ?? null,
        })
      : null;
  // --- Paid from / into a cash account ---
  const linkable = canLinkCash(currentOp, valuation, kind);
  const cashOptions = portfolio.groups
    .filter((g) => !g.items[0]?.isLiability && isCashCategory(g.category.name))
    .flatMap((g) => g.items)
    .filter((v) => !v.asset.archived && v.asset.id !== assetId)
    .map((v) => ({
      value: v.asset.id,
      label: v.asset.name,
      description: `${v.account.name} · ${money(v.position.value, { rounded: true })}`,
      color: v.category.color,
    }));
  const cashView = linkable && cashAssetId ? portfolio.byAssetId.get(cashAssetId) : undefined;
  const mainTx = evaluation?.valid ? evaluation.transactions[0] : undefined;
  const cashLink =
    cashView && mainTx
      ? evaluateCashLink(mainTx, asset?.name ?? newAsset.name.trim(), {
          assetId: cashView.asset.id,
          name: cashView.asset.name,
          // Without the linked entry being edited (it is replaced).
          txs: (portfolio.txByAsset.get(cashView.asset.id) ?? []).filter((t) => t.id !== editTransaction?.linkedId),
          prices: portfolio.pricesByAsset.get(cashView.asset.id) ?? [],
          savedAt: editTransaction?.linkedId != null ? portfolio.txById.get(editTransaction.linkedId)?.createdAt : null,
        })
      : null;

  const assetError = assetId === null ? 'Choose an investment' : null;
  const newAssetErrors = isNewAsset ? validateNewAsset(newAsset) : {};
  const isValid = !assetError && Object.keys(newAssetErrors).length === 0 && !!evaluation?.valid;
  // Errors show after a first save attempt; once something is typed, the preview explains what blocks it.
  const allErrors = [assetError, ...Object.values(newAssetErrors), ...Object.values(evaluation?.errors ?? {})].filter(Boolean);
  const blockingError = hasTypedValue(draft) ? (allErrors[0] ?? null) : null;

  // --- Changing the investment or the operation starts from clean fields (the date is kept) ---
  const changeAsset = (id: number | null) => {
    if (id === assetId) return;
    setAssetId(id);
    setOp(null);
    // The first operation offered for a unit-priced asset is Buy: start from its last price.
    setDraft((d) => ({ ...emptyDraft(d.date), unitPrice: lastPrice(id) }));
    setSubmitted(false);
  };
  const changeOp = (next: Operation) => {
    if (next === currentOp) return;
    setOp(next);
    setDraft((d) => ({ ...emptyDraft(d.date), unitPrice: next === 'BUY' || next === 'SELL' ? lastPrice(assetId) : '' }));
    setSubmitted(false);
  };
  const reset = () => {
    setAssetId(initialAssetId ?? null);
    setNewAsset(emptyNewAsset());
    setOp(null);
    setDraft({ ...emptyDraft(today()), unitPrice: lastPrice(initialAssetId) });
    setCashAssetId(0);
    setSubmitted(false);
  };

  const save = async () => {
    setSubmitted(true);
    if (!isValid || !evaluation || saving) return;
    setSaving(true);
    try {
      const savedAssetId = await write((txn) =>
        repo.saveOperation(txn, {
          asset: isNewAsset ? newAssetToSave() : assetId!,
          price: evaluation.price,
          transactions: evaluation.transactions,
          cash: cashLink?.transaction ?? null,
          edit: editPrice ? { price: editPrice } : editTransaction ? { transaction: editTransaction } : undefined,
        }),
      );
      if (!isEdit) reset();
      onSaved(savedAssetId);
    } catch (e) {
      showSaveError(e, 'An account or category with this name already exists.');
    } finally {
      setSaving(false);
    }
  };

  /** The investment to create, with its new account / category if needed. */
  const newAssetToSave = (): repo.NewAssetSave => {
    const a = newAsset;
    const usedColors = new Set(snapshot.categories.map((c) => c.color));
    return {
      account: a.accountId === NEW_ID ? { name: a.newAccountName } : a.accountId!,
      category: isNewCategory
        ? {
            name: a.newCategoryName,
            kind: a.newCategoryKind,
            valuation: a.newCategoryValuation,
            color: CATEGORY_COLORS.find((c) => !usedColors.has(c)) ?? '#85847f',
          }
        : a.categoryId!,
      name: a.name,
      identifier: a.identifier || null,
      valuation: valuation!,
      note: a.note || null,
    };
  };

  const assetOptions = portfolio.groups
    .flatMap((g) => g.items)
    .filter((v) => !v.asset.archived)
    .map((v) => ({
      value: v.asset.id,
      label: v.asset.identifier ? `${v.asset.name} (${v.asset.identifier})` : v.asset.name,
      description: `${v.category.name} · ${v.account.name}`,
      color: v.category.color,
    }));

  const repayCount = evaluation?.repayPlan.length ?? 0;
  const saveTitle = saving
    ? 'Saving…'
    : isEdit
      ? 'Save changes'
      : repayCount > 1
        ? `Save ${repayCount} repayments`
        : `Save ${opLabel.toLowerCase()}`;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* 1. What */}
        {!isEdit && (
          <Field label="Investment" error={submitted ? assetError : null}>
            {isNewAsset ? (
              <NewBadge label="New investment" onCancel={() => changeAsset(initialAssetId ?? null)} />
            ) : (
              <Select
                title="Choose an investment"
                placeholder="Select or create an investment"
                options={assetOptions}
                value={assetId}
                onChange={changeAsset}
                createLabel="New investment"
                onCreate={() => changeAsset(NEW_ID)}
              />
            )}
          </Field>
        )}
        {isNewAsset && <NewAssetFields value={newAsset} onChange={updateNewAsset} errors={submitted ? newAssetErrors : {}} />}
        {asset && !isEdit && <CurrentPosition assetId={asset.id} />}

        {/* 2. Operation */}
        {ops.length > 0 && !isEdit && (
          <Field label="Operation">
            <Chips options={ops} value={currentOp!} onChange={changeOp} />
          </Field>
        )}

        {/* 3. Details, preview, save */}
        {currentOp && evaluation && (
          <>
            <OperationFields
              op={currentOp}
              draft={draft}
              onChange={updateDraft}
              errors={submitted ? evaluation.errors : {}}
              evaluation={evaluation}
              valuation={valuation}
              isLiability={isLiability}
              isEdit={isEdit}
            />

            {linkable && (
              <Field
                label={currentOp === 'BUY' ? 'Paid from' : 'Paid into'}
                hint={
                  cashOptions.length === 0
                    ? 'Add a cash account (Cash category) to keep its balance up to date automatically.'
                    : cashAssetId
                      ? undefined
                      : 'Optional: the cash account is updated with the same amount.'
                }>
                <Select
                  title={currentOp === 'BUY' ? 'Paid from' : 'Paid into'}
                  placeholder="Not tracked"
                  options={[{ value: 0, label: 'Not tracked', description: 'Only this investment changes' }, ...cashOptions]}
                  value={cashAssetId}
                  onChange={setCashAssetId}
                />
                {cashLink?.warning && <Text style={{ color: theme.staleWarning, fontSize: 12 }}>⚠ {cashLink.warning}</Text>}
              </Field>
            )}

            {evaluation.preview && valuation ? (
              <>
                <SectionTitle>After this operation</SectionTitle>
                <ImpactPreview
                  before={evaluation.preview.before}
                  after={evaluation.preview.after}
                  valuation={valuation}
                  isLiability={isLiability}
                  cash={evaluation.cash}
                />
                {cashLink && cashView && (
                  <Card style={{ marginTop: space.md }}>
                    <Row label={cashView.asset.name}>
                      <Text style={{ color: theme.text, fontVariant: ['tabular-nums'] }}>
                        {money(cashLink.before)} →{' '}
                        {money(cashLink.after)}
                      </Text>
                    </Row>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                      {cashLink.transaction.type === 'WITHDRAW' ? 'Withdrawn' : 'Deposited'}{' '}
                      {money(cashLink.transaction.amount)} · linked to this operation
                    </Text>
                  </Card>
                )}
              </>
            ) : (
              <Text style={[styles.previewHint, { color: blockingError ? theme.negative : theme.textMuted }]}>
                {blockingError ? `No preview yet: ${blockingError}` : 'Fill in the fields above to preview the impact on this investment.'}
              </Text>
            )}

            <Button title={saveTitle} onPress={save} disabled={saving || (submitted && !isValid)} style={{ marginTop: space.xl }} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl * 3 },
  previewHint: { marginTop: space.xl, textAlign: 'center', fontSize: 13 },
});
