/** Large deterministic dataset shared by the benchmarks (~113k rows over 10 years). */
import { toISODate } from '@/domain/dates';
import type { Snapshot } from '@/domain/types';

export const YEARS = 10;
const DAILY_ASSETS = 15;
const MONTHLY_ASSETS = 15;
export const TODAY = '2026-10-10';

/** Deterministic dataset: half the investments get a buy and a price every day, the rest monthly; 2 loans. */
export function syntheticSnapshot(): Snapshot {
  const start = new Date(2016, 9, 10);
  const days: string[] = [];
  for (let d = new Date(start); toISODate(d) <= TODAY; d.setDate(d.getDate() + 1)) days.push(toISODate(d));

  const s: Snapshot = {
    categories: [
      { id: 1, name: 'ETF', kind: 'asset', valuation: 'units', color: '#000', sortOrder: 0, isDefault: true, targetWeight: 0.7, updateReminder: 'monthly' },
      { id: 2, name: 'Cash', kind: 'asset', valuation: 'balance', color: '#000', sortOrder: 1, isDefault: true, targetWeight: 0.3, updateReminder: 'monthly' },
      { id: 3, name: 'Loan', kind: 'liability', valuation: 'balance', color: '#000', sortOrder: 2, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    ],
    accounts: [{ id: 1, name: 'Broker', institution: null, note: null, archived: false, createdAt: '' }],
    assets: [],
    transactions: [],
    prices: [],
  };
  let txId = 1;
  let priceId = 1;
  const addAsset = (id: number, categoryId: number, valuation: 'units' | 'balance') =>
    s.assets.push({ id, accountId: 1, categoryId, name: `A${id}`, identifier: null, valuation, note: null, reviewDate: null, archived: false, createdAt: '' });

  for (let a = 1; a <= DAILY_ASSETS + MONTHLY_ASSETS; a++) {
    const daily = a <= DAILY_ASSETS;
    const units = a % 3 !== 0;
    addAsset(a, units ? 1 : 2, units ? 'units' : 'balance');
    days.forEach((date, i) => {
      if (!daily && !date.endsWith('-10')) return;
      const price = 100 + a + i * 0.01;
      if (units) {
        s.transactions.push({ id: txId++, assetId: a, type: 'BUY', date, quantity: 0.1, unitPrice: price, amount: 0.1 * price, fees: 0, note: null });
      } else {
        s.transactions.push({ id: txId++, assetId: a, type: 'DEPOSIT', date, quantity: null, unitPrice: null, amount: 10, fees: 0, note: null });
      }
      s.prices.push({ id: priceId++, assetId: a, date, price: units ? price : 10 * (i + 1) * 1.01, source: 'manual' });
    });
  }
  for (const loan of [101, 102]) {
    addAsset(loan, 3, 'balance');
    days.forEach((date, i) => {
      if (date.endsWith('-10')) s.prices.push({ id: priceId++, assetId: loan, date, price: 200000 - i * 20, source: 'manual' });
    });
  }
  return s;
}

