import type { SQLiteDatabase } from 'expo-sqlite';

import { addMonths, today } from '@/domain/dates';

import { seedDefaultCategories } from './migrations';
import * as repo from './repo';

/*
 * Development helper: a realistic, reproducible sample portfolio (~5 years of monthly history) that
 * exercises every screen: all default categories plus a custom one, gains and losses, partial and
 * full sells, dividends/interest, withdrawals, a closed and an archived position, and two loans.
 */

const MONTHS = 60;

/** Deterministic PRNG so every reset produces the same data. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Monthly price path: `prices[m]` is the price `m` months ago. Starts at `start` MONTHS ago and
 * moves by `drift` ± `volatility` per month; `shocks` multiply the price at a given month.
 */
function pricePath(seed: number, start: number, drift: number, volatility: number, shocks: Record<number, number> = {}) {
  const rand = mulberry32(seed);
  const prices: number[] = [];
  let p = start;
  for (let m = MONTHS; m >= 0; m--) {
    if (m < MONTHS) p *= 1 + drift + (rand() * 2 - 1) * volatility;
    if (shocks[m]) p *= shocks[m];
    prices[m] = Math.round(p * 100) / 100;
  }
  return prices;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Removes all financial data and restores the default categories. Settings are kept. */
export async function clearAllData(db: SQLiteDatabase) {
  await repo.clearData(db);
  await db.execAsync("DELETE FROM sqlite_sequence WHERE name IN ('transactions','prices','assets','accounts','categories')");
  await seedDefaultCategories(db);
}

export async function resetWithDemoData(db: SQLiteDatabase) {
  await clearAllData(db);

  const ago = (months: number) => addMonths(today(), -months);
  const cat = async (name: string) =>
    (await db.getFirstAsync<{ id: number }>('SELECT id FROM categories WHERE name = ?', [name]))!.id;
  const account = (name: string, institution?: string) => repo.insertAccount(db, { name, institution });
  const asset = async (accountId: number, category: string, name: string, identifier: string | null) => {
    const categoryId = await cat(category);
    const { valuation } = (await db.getFirstAsync<{ valuation: 'units' | 'balance' }>(
      'SELECT valuation FROM categories WHERE id = ?',
      [categoryId],
    ))!;
    return repo.insertAsset(db, { accountId, categoryId, name, identifier, valuation });
  };

  const trade = (assetId: number, type: 'BUY' | 'SELL', months: number, quantity: number, unitPrice: number, fees = 0, note: string | null = null) =>
    repo.insertTransaction(db, {
      assetId,
      type,
      date: ago(months),
      quantity,
      unitPrice,
      amount: round2(quantity * unitPrice),
      fees,
      note,
    });
  const cash = (assetId: number, type: 'DEPOSIT' | 'WITHDRAW' | 'INCOME', months: number, amount: number, note: string | null = null) =>
    repo.insertTransaction(db, { assetId, type, date: ago(months), quantity: null, unitPrice: null, amount: round2(amount), fees: 0, note });
  const price = (assetId: number, months: number, value: number) => repo.upsertPrice(db, { assetId, date: ago(months), price: round2(value) });
  /** Monthly price updates between two dates (inclusive), so charts look continuous. */
  const monthlyPrices = async (assetId: number, prices: number[], from = MONTHS, to = 0) => {
    for (let m = from; m >= to; m--) await price(assetId, m, prices[m]);
  };

  // --- Accounts -------------------------------------------------------------
  const pea = await account('Boursorama PEA', 'Boursorama');
  const cto = await account('Trade Republic', 'Trade Republic');
  const binance = await account('Binance', 'Binance');
  const ledger = await account('Ledger wallet');
  const livret = await account('Livret A', 'Crédit Agricole');
  const current = await account('Current account', 'Crédit Agricole');
  const per = await account('PER Linxea', 'Linxea');
  const home = await account('Home');
  const safe = await account('Home safe');
  const enerfip = await account('Enerfip');

  // --- ETFs: monthly DCA ------------------------------------------------------
  const cw8Prices = pricePath(1, 330, 0.009, 0.035, { 40: 0.88 });
  const cw8 = await asset(pea, 'ETF', 'Amundi MSCI World', 'CW8.PA');
  for (let m = MONTHS; m >= 1; m--) await trade(cw8, 'BUY', m, 1, cw8Prices[m], 0.99);
  await monthlyPrices(cw8, cw8Prices);

  const espPrices = pricePath(2, 19, 0.011, 0.04, { 40: 0.85 });
  const esp = await asset(pea, 'ETF', 'BNP S&P 500', 'ESE.PA');
  for (let m = 48; m >= 1; m -= 2) await trade(esp, 'BUY', m, 15, espPrices[m], 0.99);
  await monthlyPrices(esp, espPrices, 48);

  // --- Stocks ---------------------------------------------------------------
  const aaplPrices = pricePath(3, 120, 0.008, 0.06);
  const aapl = await asset(cto, 'Stock', 'Apple', 'AAPL');
  await trade(aapl, 'BUY', 56, 10, aaplPrices[56], 1);
  await trade(aapl, 'BUY', 36, 5, aaplPrices[36], 1);
  await trade(aapl, 'SELL', 14, 6, aaplPrices[14], 1, 'Took some profit');
  for (let m = 54; m >= 0; m -= 3) await cash(aapl, 'INCOME', m, 2.1, 'Quarterly dividend');
  await monthlyPrices(aapl, aaplPrices, 56);

  const ttePrices = pricePath(4, 38, 0.006, 0.05);
  const tte = await asset(pea, 'Stock', 'TotalEnergies', 'TTE.PA');
  await trade(tte, 'BUY', 44, 40, ttePrices[44], 2);
  for (let m = 42; m >= 0; m -= 6) await cash(tte, 'INCOME', m, 40 * 0.79, 'Dividend');
  await monthlyPrices(tte, ttePrices, 44, 5); // last price 5 months ago → orange (dividends don't refresh it)

  // A losing position.
  const ptonPrices = pricePath(5, 110, -0.035, 0.09, { 30: 0.6 });
  const pton = await asset(cto, 'Stock', 'Peloton', 'PTON');
  await trade(pton, 'BUY', 50, 12, ptonPrices[50], 1);
  await trade(pton, 'BUY', 28, 10, ptonPrices[28], 1, 'Averaging down');
  await monthlyPrices(pton, ptonPrices, 50);

  // A closed position (fully sold with a gain): only visible with "Show closed".
  const nokPrices = pricePath(6, 3.2, 0.012, 0.07);
  const nok = await asset(cto, 'Stock', 'Nokia', 'NOKIA.HE');
  await trade(nok, 'BUY', 52, 500, nokPrices[52], 1);
  await trade(nok, 'SELL', 20, 500, nokPrices[20], 1, 'Closed position');
  await monthlyPrices(nok, nokPrices, 52, 20);

  // --- Crypto -----------------------------------------------------------------
  const btcPrices = pricePath(7, 30000, 0.02, 0.12, { 42: 0.55, 30: 0.7 });
  const btc = await asset(binance, 'Crypto', 'Bitcoin', 'BTC');
  for (let m = 48; m >= 1; m--) await trade(btc, 'BUY', m, round8(100 / btcPrices[m]), btcPrices[m], 0.1);
  await monthlyPrices(btc, btcPrices, 48);

  const ethPrices = pricePath(8, 2800, 0.004, 0.14, { 40: 0.6 });
  const eth = await asset(ledger, 'Crypto', 'Ethereum', 'ETH');
  await trade(eth, 'BUY', 46, 1.2, ethPrices[46], 2);
  await trade(eth, 'BUY', 25, 0.8, ethPrices[25], 2);
  await trade(eth, 'SELL', 8, 0.5, ethPrices[8], 1);
  await monthlyPrices(eth, ethPrices, 46);

  // Archived: hidden from lists unless "Show closed & archived" is on, still counted in totals.
  const dogePrices = pricePath(9, 0.25, -0.01, 0.15);
  const doge = await asset(binance, 'Crypto', 'Dogecoin', 'DOGE');
  await trade(doge, 'BUY', 40, 800, dogePrices[40], 0.5, 'Just for fun');
  await monthlyPrices(doge, dogePrices, 40);
  await db.runAsync('UPDATE assets SET archived = 1 WHERE id = ?', [doge]);

  // --- Bonds & funds ------------------------------------------------------------
  const oatPrices = pricePath(10, 98, 0.0005, 0.006);
  const oat = await asset(pea, 'Bonds', 'OAT 2032', 'FR0014007L00');
  await trade(oat, 'BUY', 34, 20, oatPrices[34], 5);
  for (let m = 34; m >= 0; m -= 12) await cash(oat, 'INCOME', m, 20 * 100 * 0.02, 'Coupon');
  await monthlyPrices(oat, oatPrices, 34, 3); // 3 months → yellow

  const fundPrices = pricePath(11, 150, 0.005, 0.025);
  const fund = await asset(pea, 'Funds', 'Comgest Monde', 'FR0000284689');
  for (let m = 30; m >= 6; m -= 6) await trade(fund, 'BUY', m, 3, fundPrices[m]);
  await monthlyPrices(fund, fundPrices, 30, 1); // 1 month → gray

  // --- Cash ---------------------------------------------------------------------
  const livretA = await asset(livret, 'Cash', 'Livret A', null);
  await cash(livretA, 'DEPOSIT', MONTHS, 8000, 'Opening balance');
  for (let m = 54; m >= 6; m -= 6) await cash(livretA, 'DEPOSIT', m, 1000);
  for (let m = 49; m >= 1; m -= 12) await cash(livretA, 'INCOME', m, 180 + (49 - m) * 8, 'Yearly interest');
  await cash(livretA, 'WITHDRAW', 18, 5000, 'Car down payment');

  const checking = await asset(current, 'Cash', 'Checking account', null);
  const checkingRand = mulberry32(12);
  for (let m = MONTHS; m >= 0; m--) await price(checking, m, 1500 + checkingRand() * 2500);

  // --- Retirement (PER): yearly deposits, value updated twice a year -----------
  const perAsset = await asset(per, 'Retirement (PER)', 'PER Linxea Spirit', null);
  let perValue = 0;
  const perRand = mulberry32(13);
  for (let m = 58; m >= 0; m -= 6) {
    if ((58 - m) % 12 === 0) {
      await cash(perAsset, 'DEPOSIT', m, 3000, 'Yearly contribution');
      perValue += 3000;
    }
    perValue *= 1 + 0.02 + (perRand() * 2 - 1) * 0.05;
    await price(perAsset, m, perValue);
  }

  // --- Real estate + mortgage -------------------------------------------------
  const flat = await asset(home, 'Real estate', 'Apartment Lyon 7e', null);
  await cash(flat, 'DEPOSIT', 57, 245000, 'Purchase price incl. notary fees');
  for (const [i, value] of [262000, 255000, 268000, 271000].entries()) await price(flat, 45 - i * 12, value);

  const mortgage = await asset(home, 'Loan', 'Mortgage', null);
  // Last balance 4 months ago: try Add › Mortgage › Repay › "New balance" + "Paid every month".
  for (let m = 57; m >= 4; m--) await price(mortgage, m, 196000 * (1 - (57 - m) / 300));

  // A loan tracked with Borrow / Repay operations instead of balance updates.
  const carLoan = await asset(home, 'Loan', 'Car loan', null);
  await cash(carLoan, 'DEPOSIT', 18, 15000, 'Borrowed');
  for (let m = 15; m >= 0; m -= 3) await cash(carLoan, 'WITHDRAW', m, 750, 'Quarterly repayment');

  // --- Precious metals ----------------------------------------------------------
  const goldPrices = pricePath(14, 360, 0.012, 0.03);
  const gold = await asset(safe, 'Precious metals', 'Gold Napoléon 20F', null);
  await trade(gold, 'BUY', 52, 3, goldPrices[52], 15);
  await trade(gold, 'BUY', 26, 2, goldPrices[26], 10);
  for (let m = 52; m >= 0; m -= 3) await price(gold, m, goldPrices[m]);

  // --- Notes & review dates (two reviews already due) -----------------------------
  const notes = async (assetId: number, note: string, reviewInMonths: number | null) =>
    repo.updateAssetNotes(db, assetId, { note, reviewDate: reviewInMonths === null ? null : addMonths(today(), reviewInMonths) });
  await notes(cw8, 'Core long-term holding. Buy 1 share every month, never sell before retirement.', 6);
  await notes(pton, 'Bet on connected fitness after 2021. Thesis broken? Decide whether to sell and use the tax loss.', -1);
  await notes(aapl, 'Quality company, keep while margins stay high. Took profits once in 2025.', 0);
  await notes(btc, 'Max 10% of the portfolio. DCA 100 € / month, no trading.', 12);
  await notes(esp, 'US exposure on top of MSCI World. Check overlap and fees: maybe merge into CW8?', -2);
  await notes(eth, 'Held on Ledger. Sold 0.5 ETH to rebalance; decide on a target weight.', -3);
  await notes(flat, 'Main residence. Re-estimate the value every year with notary price data.', null);

  // --- Target allocation (real estate, retirement, metals, crowdfunding left out) ----
  const targets: [string, number][] = [
    ['ETF', 0.5],
    ['Stock', 0.15],
    ['Cash', 0.15],
    ['Crypto', 0.1],
    ['Bonds', 0.05],
    ['Funds', 0.05],
  ];
  await repo.setCategoryTargets(db, new Map(await Promise.all(targets.map(async ([name, w]) => [await cat(name), w] as [number, number]))));

  // --- Custom category ------------------------------------------------------------
  const crowdCategory = await repo.insertCategory(db, { name: 'Crowdfunding', kind: 'asset', valuation: 'balance', color: '#1baf7a' });
  const solar = await repo.insertAsset(db, {
    accountId: enerfip,
    categoryId: crowdCategory,
    name: 'Solar farm Occitanie',
    identifier: null,
    valuation: 'balance',
  });
  await cash(solar, 'DEPOSIT', 36, 2000);
  for (let m = 30; m >= 0; m -= 6) await cash(solar, 'INCOME', m, 60, 'Interest');
  await cash(solar, 'WITHDRAW', 12, 500, 'Partial capital repayment');

  // --- Paid from a cash account: the last 3 Amundi buys were paid from the checking account ---
  const cw8Buys = await db.getAllAsync<{ id: number; date: string; amount_cents: number; fees_cents: number; quantity: number }>(
    "SELECT id, date, amount_cents, fees_cents, quantity FROM transactions WHERE asset_id = ? AND type = 'BUY' ORDER BY date DESC LIMIT 3",
    [cw8],
  );
  for (const b of cw8Buys) {
    await repo.syncLinkedCash(db, b.id, null, {
      assetId: checking,
      type: 'WITHDRAW',
      date: b.date,
      quantity: null,
      unitPrice: null,
      amount: (b.amount_cents + b.fees_cents) / 100,
      fees: 0,
      note: `Buy ${b.quantity} × Amundi MSCI World`,
    });
  }

  // --- Online prices: the last 3 monthly prices of these were fetched, not typed (history tag) ---
  await db.runAsync(`UPDATE prices SET source = 'online' WHERE asset_id IN (?, ?, ?) AND date >= ?`, [cw8, btc, eth, ago(2)]);
}

function round8(n: number) {
  return Math.round(n * 1e8) / 1e8;
}
