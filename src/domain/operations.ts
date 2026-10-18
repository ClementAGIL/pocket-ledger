import { formatDate, formatEuro, formatNumber, parseNumber } from './format';
import { computePosition, NOT_SAVED_YET, replay, type Position } from './positions';
import { planRepayments, type PlannedRepayment } from './repayments';
import type { CategoryKind, ISODate, NewTransaction, PricePoint, Transaction, TxType, Valuation } from './types';

/*
 * The rules of the "Add operation" form, independent of the UI: which operations an investment
 * offers, how the typed fields are validated, what gets saved, and the before → after preview.
 */

export type Operation = TxType | 'PRICE';

/** Operations offered for an asset, with labels that match what the asset is. */
export function operationsFor(valuation: Valuation, kind: CategoryKind, isNew: boolean): { value: Operation; label: string }[] {
  if (kind === 'liability') {
    return [
      { value: 'PRICE', label: 'Update balance' },
      { value: 'DEPOSIT', label: 'Borrow' },
      ...(isNew ? [] : [{ value: 'WITHDRAW' as const, label: 'Repay' }]),
    ];
  }
  if (valuation === 'units') {
    return [
      { value: 'BUY', label: 'Buy' },
      ...(isNew
        ? []
        : [
            { value: 'SELL' as const, label: 'Sell' },
            { value: 'PRICE' as const, label: 'Update price' },
            { value: 'INCOME' as const, label: 'Dividend' },
          ]),
    ];
  }
  return [
    { value: 'DEPOSIT', label: 'Deposit' },
    { value: 'PRICE', label: 'Update value' },
    ...(isNew
      ? []
      : [
          { value: 'WITHDRAW' as const, label: 'Withdraw' },
          { value: 'INCOME' as const, label: 'Interest' },
        ]),
  ];
}

// --- Operation fields ----------------------------------------------------------

/** The operation fields exactly as typed (strings), before parsing. */
export interface OperationDraft {
  date: ISODate;
  quantity: string;
  /** BUY/SELL: the price field holds the unit price or the total amount. */
  priceMode: 'unit' | 'total';
  /** Unit price for BUY/SELL, or the new price/value/balance for PRICE. */
  unitPrice: string;
  total: string;
  amount: string;
  fees: string;
  note: string;
  /** Loan REPAY: amount repaid, or new balance (the app plans the repayments). */
  repayMode: 'amount' | 'balance';
  newBalance: string;
  monthly: boolean;
  payDay: string;
}

export const emptyDraft = (date: ISODate): OperationDraft => ({
  date,
  quantity: '',
  priceMode: 'unit',
  unitPrice: '',
  total: '',
  amount: '',
  fees: '',
  note: '',
  repayMode: 'amount',
  newBalance: '',
  monthly: false,
  payDay: '',
});

/** True once the user typed a value, so a blocking error can be explained. */
export const hasTypedValue = (d: OperationDraft) =>
  [d.quantity, d.unitPrice, d.total, d.amount, d.newBalance].some((v) => v.trim() !== '');

export interface OperationContext {
  valuation: Valuation;
  kind: CategoryKind;
  /** The asset's history, without the entry being edited. */
  txs: Transaction[];
  prices: PricePoint[];
  /** The asset doesn't exist yet: no "before" position. */
  isNewAsset: boolean;
  isEdit: boolean;
  today: ISODate;
  /** Save time of the entry being edited (it keeps it); unset for a new entry (saved now). */
  savedAt?: string | null;
}

export type OperationErrors = Partial<
  Record<'date' | 'quantity' | 'price' | 'fees' | 'amount' | 'balance' | 'payDay', string>
>;

export interface EvaluatedOperation {
  errors: OperationErrors;
  valid: boolean;
  /** Loan repaid by entering its new balance. */
  isRepayByBalance: boolean;
  /** Last known loan balance (only when repaying by new balance). */
  loan: { balance: number; date: ISODate | null } | null;
  repayPlan: PlannedRepayment[];
  /** What to save (assetId is 0: set it when saving). Empty while invalid or for PRICE. */
  transactions: NewTransaction[];
  /** PRICE: the price point to save. */
  price: { date: ISODate; price: number } | null;
  /** Money side of the operation (Total paid, Money added…). */
  cash: { label: string; value: number } | null;
  /** Before → after position, when valid. `before` is null for a new investment. */
  preview: { before: Position | null; after: Position } | null;
}

const CASH_LABELS = (kind: CategoryKind, valuation: Valuation): Record<TxType, string> => ({
  BUY: 'Total paid',
  SELL: 'Total received',
  DEPOSIT: kind === 'liability' ? 'Borrowed' : 'Money added',
  WITHDRAW: kind === 'liability' ? 'Principal repaid' : 'Money withdrawn',
  INCOME: valuation === 'units' ? 'Dividend received' : 'Interest received',
});

/** Validates the draft for `op` and computes everything the form shows and saves. */
export function evaluateOperation(op: Operation, d: OperationDraft, ctx: OperationContext): EvaluatedOperation {
  const { valuation, kind, txs, prices } = ctx;
  const errors: OperationErrors = {};

  const q = parseNumber(d.quantity);
  const fees = d.fees.trim() === '' ? 0 : parseNumber(d.fees);
  const totalValue = parseNumber(d.total);
  const unit = d.priceMode === 'unit' ? parseNumber(d.unitPrice) : totalValue !== null && q ? totalValue / q : null;
  const amount = parseNumber(d.amount);
  const priceValue = parseNumber(d.unitPrice);

  const steps = replay(valuation, txs, prices);
  const stateAt = (date: ISODate) => {
    const before = steps.filter((s) => s.lastDate! <= date);
    return before.length ? before[before.length - 1] : null;
  };

  // Loan repayment by new balance.
  const isRepayByBalance = op === 'WITHDRAW' && kind === 'liability' && !ctx.isEdit && d.repayMode === 'balance';
  const last = steps.length ? steps[steps.length - 1] : null;
  const loan = isRepayByBalance ? { balance: last?.value ?? 0, date: last?.priceDate ?? null } : null;
  const newBalance = parseNumber(d.newBalance);
  const payDay = parseNumber(d.payDay);
  const payDayValid = payDay !== null && Number.isInteger(payDay) && payDay >= 1 && payDay <= 31;
  const repayPlan =
    loan?.date && newBalance !== null && d.date > loan.date && (!d.monthly || payDayValid)
      ? planRepayments(loan.balance, newBalance, loan.date, d.date, d.monthly ? payDay : null)
      : [];

  // Validation.
  if (d.date > ctx.today) errors.date = 'The date cannot be in the future';
  if (op === 'BUY' || op === 'SELL') {
    if (q === null || q <= 0) errors.quantity = 'Enter a quantity greater than 0';
    if (unit === null || unit < 0) errors.price = d.priceMode === 'unit' ? 'Enter the unit price' : 'Enter the total amount';
    if (fees === null || fees < 0) errors.fees = 'Invalid fees';
    if (op === 'SELL' && q !== null && q > 0) {
      const held = stateAt(d.date)?.quantity ?? 0;
      if (q > held + 1e-9) errors.quantity = `You only hold ${formatNumber(held)} on this date`;
    }
  } else if (op === 'PRICE') {
    if (priceValue === null || priceValue < 0) errors.price = 'Enter a valid amount';
  } else if (isRepayByBalance && loan) {
    if (!loan.date) errors.balance = 'This loan has no balance yet: use "Update balance" first';
    else if (newBalance === null || newBalance < 0) errors.balance = 'Enter the current balance';
    else if (newBalance >= loan.balance - 0.005) errors.balance = `Must be lower than the last balance (${formatEuro(loan.balance)})`;
    if (loan.date && d.date <= loan.date) errors.date = `Must be after the last update (${formatDate(loan.date)})`;
    if (d.monthly && !payDayValid) errors.payDay = 'Enter a day between 1 and 31';
  } else {
    if (amount === null || amount <= 0) errors.amount = 'Enter an amount greater than 0';
    if (op === 'WITHDRAW' && kind !== 'liability' && amount !== null) {
      const available = stateAt(d.date)?.value ?? 0;
      if (amount > available + 0.005) errors.amount = `Only ${formatEuro(available)} available on this date`;
    }
  }
  const valid = Object.keys(errors).length === 0;

  // What to save.
  const note = d.note.trim() || null;
  let transactions: NewTransaction[] = [];
  let price: EvaluatedOperation['price'] = null;
  if (valid) {
    if (op === 'PRICE') {
      price = { date: d.date, price: priceValue! };
    } else if (op === 'BUY' || op === 'SELL') {
      transactions = [{ assetId: 0, type: op, date: d.date, quantity: q!, unitPrice: unit!, amount: q! * unit!, fees: fees ?? 0, note }];
    } else if (isRepayByBalance) {
      const defaultNote = repayPlan.length > 1 ? 'Monthly repayment (principal)' : 'Repayment (principal)';
      transactions = repayPlan.map((r) => ({
        assetId: 0,
        type: 'WITHDRAW' as const,
        date: r.date,
        quantity: null,
        unitPrice: null,
        amount: r.amount,
        fees: 0,
        note: note ?? defaultNote,
      }));
    } else {
      transactions = [{ assetId: 0, type: op, date: d.date, quantity: null, unitPrice: null, amount: amount!, fees: 0, note }];
    }
  }

  // Cash line and preview.
  let cash: EvaluatedOperation['cash'] = null;
  let preview: EvaluatedOperation['preview'] = null;
  if (valid) {
    if (op !== 'PRICE') {
      const value = transactions.reduce(
        (sum, t) => sum + (t.type === 'BUY' ? t.amount + t.fees : t.type === 'SELL' ? t.amount - t.fees : t.amount),
        0,
      );
      cash = { label: CASH_LABELS(kind, valuation)[op], value };
    }
    // Ordered like they will be once saved: now (or at their original time when edited).
    const at = ctx.savedAt ?? NOT_SAVED_YET;
    const created = transactions.map((t, i) => ({ ...t, id: Number.MAX_SAFE_INTEGER - i, createdAt: at }));
    const pricesAfter = price
      ? [
          ...prices.filter((p) => p.date !== price.date),
          { id: Number.MAX_SAFE_INTEGER, assetId: 0, source: 'manual' as const, createdAt: at, ...price },
        ]
      : prices;
    preview = {
      before: ctx.isNewAsset ? null : computePosition(valuation, txs, prices),
      after: computePosition(valuation, [...txs, ...created], pricesAfter),
    };
  }

  return { errors, valid, isRepayByBalance, loan, repayPlan, transactions, price, cash, preview };
}

// --- Paid from / paid into a cash account -----------------------------------------------

/** A buy, sale or dividend of a unit-priced asset can move money from / to a cash account. */
export const canLinkCash = (op: Operation | null, valuation: Valuation | null, kind: CategoryKind | null) =>
  kind === 'asset' && valuation === 'units' && (op === 'BUY' || op === 'SELL' || op === 'INCOME');

export interface CashAccountContext {
  assetId: number;
  name: string;
  /** The cash account's history, without the linked entry being edited. */
  txs: Transaction[];
  prices: PricePoint[];
  /** Save time of the linked entry being edited (it keeps it); unset when it is new. */
  savedAt?: string | null;
}

export interface CashLink {
  /** The withdrawal (buy) or deposit (sale, dividend) to save on the cash account. */
  transaction: NewTransaction;
  /** Cash account balance today, before and after. */
  before: number;
  after: number;
  /** Not blocking: the balance would go below zero on that date. */
  warning: string | null;
}

/**
 * The cash side of a buy / sale / dividend: same date, the money actually paid (amount + fees) or
 * received (amount − fees). Between assets, so net money added and savings don't change.
 */
export function evaluateCashLink(main: NewTransaction, investmentName: string, cash: CashAccountContext): CashLink {
  const qty = main.quantity !== null ? `${formatNumber(main.quantity)} × ` : '';
  const isBuy = main.type === 'BUY';
  const amount = isBuy ? main.amount + main.fees : main.amount - main.fees;
  const transaction: NewTransaction = {
    assetId: cash.assetId,
    type: isBuy ? 'WITHDRAW' : 'DEPOSIT',
    date: main.date,
    quantity: null,
    unitPrice: null,
    amount: Math.round(amount * 100) / 100,
    fees: 0,
    note: main.type === 'BUY' ? `Buy ${qty}${investmentName}` : main.type === 'SELL' ? `Sale of ${qty}${investmentName}` : `Dividend from ${investmentName}`,
  };
  const before = computePosition('balance', cash.txs, cash.prices).value;
  // Ordered like it will be once saved, so the preview matches the result (see positions.ts).
  const pending = { ...transaction, id: Number.MAX_SAFE_INTEGER, createdAt: cash.savedAt ?? NOT_SAVED_YET };
  const after = computePosition('balance', [...cash.txs, pending], cash.prices).value;

  let warning: string | null = null;
  if (isBuy) {
    const steps = replay('balance', cash.txs, cash.prices).filter((st) => st.lastDate! <= main.date);
    // Balance just before this entry: everything of that day already saved counts.
    const atDate = steps.length ? steps[steps.length - 1].value : 0;
    if (atDate - transaction.amount < -0.005) {
      warning = `${cash.name} would go to ${formatEuro(atDate - transaction.amount)} on ${formatDate(main.date)}: is its balance up to date?`;
    }
  }
  return { transaction, before, after, warning };
}

// --- New investment fields ---------------------------------------------------------

/** Marker for "create a new one" in the investment / category / account pickers. */
export const NEW_ID = -1;

export interface NewAssetDraft {
  name: string;
  identifier: string;
  note: string;
  categoryId: number | null;
  newCategoryName: string;
  newCategoryKind: CategoryKind;
  newCategoryValuation: Valuation;
  accountId: number | null;
  newAccountName: string;
}

export const emptyNewAsset = (): NewAssetDraft => ({
  name: '',
  identifier: '',
  note: '',
  categoryId: null,
  newCategoryName: '',
  newCategoryKind: 'asset',
  newCategoryValuation: 'units',
  accountId: null,
  newAccountName: '',
});

export type NewAssetErrors = Partial<Record<'name' | 'category' | 'account', string>>;

export function validateNewAsset(a: NewAssetDraft): NewAssetErrors {
  const errors: NewAssetErrors = {};
  if (!a.name.trim()) errors.name = 'Name is required';
  if (a.categoryId === null) errors.category = 'Choose a category';
  else if (a.categoryId === NEW_ID && !a.newCategoryName.trim()) errors.category = 'Category name is required';
  if (a.accountId === null) errors.account = 'Choose an account';
  else if (a.accountId === NEW_ID && !a.newAccountName.trim()) errors.account = 'Account name is required';
  return errors;
}
