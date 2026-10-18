import {
  emptyDraft,
  canLinkCash,
  emptyNewAsset,
  evaluateCashLink,
  evaluateOperation,
  NEW_ID,
  operationsFor,
  validateNewAsset,
  type OperationContext,
  type OperationDraft,
} from '../operations';
import type { PricePoint, Transaction } from '../types';

const TODAY = '2026-06-30';
let id = 1;
const tx = (fields: Partial<Transaction> & Pick<Transaction, 'type' | 'date'>): Transaction => ({
  id: id++,
  assetId: 1,
  quantity: null,
  unitPrice: null,
  amount: 0,
  fees: 0,
  note: null,
  ...fields,
});
const draft = (fields: Partial<OperationDraft> = {}): OperationDraft => ({ ...emptyDraft('2026-06-15'), ...fields });

// 10 units bought at 100 on 1 Jan.
const etf: OperationContext = {
  valuation: 'units',
  kind: 'asset',
  txs: [tx({ type: 'BUY', date: '2026-01-01', quantity: 10, unitPrice: 100, amount: 1000 })],
  prices: [],
  isNewAsset: false,
  isEdit: false,
  today: TODAY,
};
// Savings account with 1 000 €.
const savings: OperationContext = { ...etf, valuation: 'balance', txs: [tx({ type: 'DEPOSIT', date: '2026-01-01', amount: 1000 })] };
// Loan at 200 000 € on 12 Jan.
const loanPrices: PricePoint[] = [{ id: 99, assetId: 1, date: '2026-01-12', price: 200000, source: 'manual' }];
const loan: OperationContext = { ...etf, valuation: 'balance', kind: 'liability', txs: [], prices: loanPrices };

describe('operationsFor', () => {
  it('offers operations that fit the investment', () => {
    expect(operationsFor('units', 'asset', false).map((o) => o.label)).toEqual(['Buy', 'Sell', 'Update price', 'Dividend']);
    expect(operationsFor('units', 'asset', true).map((o) => o.label)).toEqual(['Buy']);
    expect(operationsFor('balance', 'asset', false).map((o) => o.label)).toEqual(['Deposit', 'Update value', 'Withdraw', 'Interest']);
    expect(operationsFor('balance', 'liability', false).map((o) => o.label)).toEqual(['Update balance', 'Borrow', 'Repay']);
  });
});

describe('evaluateOperation: buy & sell', () => {
  it('builds a buy with fees, its cash line and preview', () => {
    const r = evaluateOperation('BUY', draft({ quantity: '10', unitPrice: '120', fees: '2' }), etf);
    expect(r.valid).toBe(true);
    expect(r.transactions).toEqual([
      { assetId: 0, type: 'BUY', date: '2026-06-15', quantity: 10, unitPrice: 120, amount: 1200, fees: 2, note: null },
    ]);
    expect(r.cash).toEqual({ label: 'Total paid', value: 1202 });
    expect(r.preview!.before!.quantity).toBe(10);
    expect(r.preview!.after.quantity).toBe(20);
    expect(r.preview!.after.avgCost).toBeCloseTo(2202 / 20);
  });

  it('derives the unit price from a total amount', () => {
    const r = evaluateOperation('BUY', draft({ quantity: '4', priceMode: 'total', total: '1 000,00' }), etf);
    expect(r.transactions[0].unitPrice).toBe(250);
  });

  it('refuses selling more than held on that date', () => {
    const r = evaluateOperation('SELL', draft({ quantity: '11', unitPrice: '130' }), etf);
    expect(r.valid).toBe(false);
    expect(r.errors.quantity).toMatch(/only hold 10/);
    expect(r.transactions).toEqual([]);
    expect(r.preview).toBeNull();
    // Before the purchase date, nothing is held.
    expect(evaluateOperation('SELL', draft({ date: '2025-12-31', quantity: '1', unitPrice: '1' }), etf).errors.quantity).toMatch(
      /only hold 0/,
    );
  });

  it('reports missing fields, bad fees and future dates', () => {
    const r = evaluateOperation('BUY', draft({ date: '2026-07-01', fees: '-1' }), etf);
    expect(Object.keys(r.errors).sort()).toEqual(['date', 'fees', 'price', 'quantity']);
  });
});

describe('evaluateOperation: price, deposit, withdraw, income', () => {
  it('updates a price', () => {
    const r = evaluateOperation('PRICE', draft({ unitPrice: '130' }), etf);
    expect(r.price).toEqual({ date: '2026-06-15', price: 130 });
    expect(r.cash).toBeNull();
    expect(r.preview!.after.value).toBe(1300);
  });

  it('caps a withdrawal at the balance, but not a loan repayment', () => {
    expect(evaluateOperation('WITHDRAW', draft({ amount: '1500' }), savings).errors.amount).toMatch(/Only 1/);
    expect(evaluateOperation('WITHDRAW', draft({ amount: '400' }), savings).cash).toEqual({ label: 'Money withdrawn', value: 400 });
    expect(evaluateOperation('WITHDRAW', draft({ amount: '5000' }), loan).cash).toEqual({ label: 'Principal repaid', value: 5000 });
  });

  it('labels the cash line for each kind of investment', () => {
    expect(evaluateOperation('INCOME', draft({ amount: '3' }), etf).cash!.label).toBe('Dividend received');
    expect(evaluateOperation('INCOME', draft({ amount: '3' }), savings).cash!.label).toBe('Interest received');
    expect(evaluateOperation('DEPOSIT', draft({ amount: '3' }), loan).cash!.label).toBe('Borrowed');
  });

  it('has no "before" for a new investment', () => {
    const r = evaluateOperation('BUY', draft({ quantity: '1', unitPrice: '10' }), { ...etf, txs: [], isNewAsset: true });
    expect(r.preview!.before).toBeNull();
  });
});

describe('evaluateOperation: loan repaid by new balance', () => {
  const byBalance = (fields: Partial<OperationDraft>) =>
    evaluateOperation('WITHDRAW', draft({ date: '2026-05-10', repayMode: 'balance', ...fields }), loan);

  it('plans monthly repayments and saves one Repay per month', () => {
    const r = byBalance({ newBalance: '196000', monthly: true, payDay: '10' });
    expect(r.valid).toBe(true);
    expect(r.loan).toEqual({ balance: 200000, date: '2026-01-12' });
    expect(r.transactions.map((t) => [t.date, t.amount, t.note])).toEqual([
      ['2026-02-10', 1000, 'Monthly repayment (principal)'],
      ['2026-03-10', 1000, 'Monthly repayment (principal)'],
      ['2026-04-10', 1000, 'Monthly repayment (principal)'],
      ['2026-05-10', 1000, 'Monthly repayment (principal)'],
    ]);
    expect(r.cash).toEqual({ label: 'Principal repaid', value: 4000 });
    expect(r.preview!.after.value).toBe(196000);
  });

  it('explains what blocks the plan', () => {
    expect(byBalance({ newBalance: '200000' }).errors.balance).toMatch(/lower than the last balance/);
    expect(byBalance({ date: '2026-01-12', newBalance: '1' }).errors.date).toMatch(/after the last update/);
    expect(byBalance({ newBalance: '196000', monthly: true, payDay: '32' }).errors.payDay).toBeDefined();
    const noBalance = evaluateOperation('WITHDRAW', draft({ repayMode: 'balance', newBalance: '1' }), { ...loan, prices: [] });
    expect(noBalance.errors.balance).toMatch(/no balance yet/);
  });

  it('is not used when editing an existing repayment', () => {
    const r = evaluateOperation('WITHDRAW', draft({ repayMode: 'balance', amount: '500' }), { ...loan, isEdit: true });
    expect(r.isRepayByBalance).toBe(false);
    expect(r.transactions[0].amount).toBe(500);
  });
});

describe('validateNewAsset', () => {
  it('requires a name, a category and an account (new ones need a name)', () => {
    expect(Object.keys(validateNewAsset(emptyNewAsset())).sort()).toEqual(['account', 'category', 'name']);
    const draftAsset = { ...emptyNewAsset(), name: 'World', categoryId: NEW_ID, accountId: NEW_ID };
    expect(validateNewAsset(draftAsset)).toEqual({ category: 'Category name is required', account: 'Account name is required' });
    expect(validateNewAsset({ ...draftAsset, newCategoryName: 'ETF', newAccountName: 'PEA' })).toEqual({});
  });
});

describe('paid from / into a cash account', () => {
  const livret = {
    assetId: 7,
    name: 'Livret A',
    txs: [tx({ assetId: 7, type: 'DEPOSIT', date: '2026-01-01', amount: 2000 })],
    prices: [],
  };
  const buy = { assetId: 0, type: 'BUY' as const, date: '2026-06-15', quantity: 2, unitPrice: 500, amount: 1000, fees: 2, note: null };

  it('is offered for buys, sales and dividends of unit-priced assets', () => {
    expect(canLinkCash('BUY', 'units', 'asset')).toBe(true);
    expect(canLinkCash('INCOME', 'units', 'asset')).toBe(true);
    expect(canLinkCash('PRICE', 'units', 'asset')).toBe(false);
    expect(canLinkCash('DEPOSIT', 'balance', 'asset')).toBe(false);
    expect(canLinkCash('DEPOSIT', 'balance', 'liability')).toBe(false);
  });

  it('withdraws what a buy cost, fees included', () => {
    const link = evaluateCashLink(buy, 'MSCI World', livret);
    expect(link.transaction).toEqual({
      assetId: 7,
      type: 'WITHDRAW',
      date: '2026-06-15',
      quantity: null,
      unitPrice: null,
      amount: 1002,
      fees: 0,
      note: 'Buy 2 × MSCI World',
    });
    expect([link.before, link.after]).toEqual([2000, 998]);
    expect(link.warning).toBeNull();
  });

  it('deposits what a sale or a dividend brought, fees deducted', () => {
    expect(evaluateCashLink({ ...buy, type: 'SELL' }, 'MSCI World', livret).transaction).toMatchObject({ type: 'DEPOSIT', amount: 998, note: 'Sale of 2 × MSCI World' });
    const dividend = { ...buy, type: 'INCOME' as const, quantity: null, unitPrice: null, amount: 30, fees: 0 };
    expect(evaluateCashLink(dividend, 'MSCI World', livret)).toMatchObject({ transaction: { type: 'DEPOSIT', amount: 30, note: 'Dividend from MSCI World' }, after: 2030 });
  });

  it('warns (without blocking) when the cash account would go below zero on that date', () => {
    const link = evaluateCashLink({ ...buy, amount: 3000, quantity: 6 }, 'MSCI World', livret);
    // Balances never go below 0 (positions.ts); the warning tells the real gap.
    expect(link.after).toBe(0);
    expect(link.warning).toContain('Livret A would go to');
    // Before the money was on the account.
    expect(evaluateCashLink({ ...buy, date: '2025-12-01' }, 'MSCI World', livret).warning).not.toBeNull();
  });
});

describe('preview = result once saved (same-day order)', () => {
  it('a deposit counts after a balance update saved earlier that day', () => {
    // Checking account updated to 1 574.63 € this morning, then a sale of 2 147.40 € paid into it.
    const checking = {
      assetId: 8,
      name: 'Checking',
      txs: [],
      prices: [{ id: 50, assetId: 8, date: '2026-06-15', price: 1574.63, source: 'manual' as const, createdAt: '2026-06-15 08:00:00' }],
    };
    const sale = { assetId: 0, type: 'SELL' as const, date: '2026-06-15', quantity: 10, unitPrice: 214.74, amount: 2147.4, fees: 0, note: null };
    const link = evaluateCashLink(sale, 'World', checking);
    expect(link.before).toBeCloseTo(1574.63, 2);
    expect(link.after).toBeCloseTo(3722.03, 2);
  });

  it("a buy entered after the day's price update sets the price in the preview", () => {
    const ctx: OperationContext = {
      ...etf,
      prices: [{ id: 60, assetId: 1, date: '2026-06-15', price: 90, source: 'manual', createdAt: '2026-06-15 08:00:00' }],
    };
    const result = evaluateOperation('BUY', draft({ quantity: '1', unitPrice: '120' }), ctx);
    expect(result.preview!.after.price).toBe(120);
    // Editing keeps the original time: a buy saved before that price update stays before it.
    const edited = evaluateOperation('BUY', draft({ quantity: '1', unitPrice: '120' }), { ...ctx, isEdit: true, savedAt: '2026-06-15 07:00:00' });
    expect(edited.preview!.after.price).toBe(90);
  });
});
