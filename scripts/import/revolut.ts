import type { ISODate } from '@/domain/types';

import { parseCsv } from './csv';
import type { ConvertResult } from './degiro';
import type { ImportedAsset, ImportedOperation } from './ledger';

/*
 * Revolut "consolidated statement" (CSV, French): one file with a section per product (current
 * accounts, Investment Services, Cryptos, Matière première), each made of titled tables.
 *
 * Revolut writes it with two quirks, worked around here:
 * - the text is encoded twice ("RelevÃ©", "â‚¬"): only digits and plain ASCII words are read;
 * - crypto quantities lose their decimal point ("3,20529034" is written "320,529,034"): the
 *   decimals are found per coin from the € values and prices next to them (`cryptoQuantities`).
 *
 * - Money put in: euros changed into another currency on the EUR current account ("Change en USD")
 *   or sent to an investment pocket go to "Revolut cash", the investment account's cash (tracked in
 *   euros). The current accounts themselves are not imported.
 * - Stocks: "Autres transactions de compte de courtier" are the buys (EUR gross = net + fees), paid
 *   from the cash; dividends (net of tax, in EUR) are paid into it.
 * - Crypto received for free (Learn & Earn, staking) becomes buys at 0 € with the market unit price:
 *   their value is a gain, not money put in. Staking (thousands of tiny lines) is summed into one
 *   entry per coin and year, then matched to the holdings at the end of the statement.
 * - Sales and commodities aren't handled yet: their lines are reported as warnings.
 */

const CASH = 'cash';
const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const round10 = (n: number) => Math.round(n * 1e10) / 1e10;

/** Plain ASCII, so the double-encoded text reads like the correct one ("RelevÃ©s" and "Relevés" → "Relevs" / "Releves"). */
const ascii = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[^\x20-\x7e]/g, '')
    .trim();

const MONTHS: [RegExp, number][] = [
  [/^ja/, 1],
  [/^f/, 2],
  [/^mar/, 3],
  [/^a[vp]/, 4],
  [/^ma[iy]/, 5],
  [/^ju[in]n?$|^juin|^jun/, 6],
  [/^ju[il]/, 7],
  [/^a[ou]/, 8],
  [/^s/, 9],
  [/^o/, 10],
  [/^n/, 11],
  [/^d/, 12],
];

/** "26 avr. 2020", "29 aoÃ»t 2020", "23 Oct. 2020" or "16.07.22" → ISO date. */
export function parseRevolutDate(input: string): ISODate | null {
  const s = ascii(input).toLowerCase();
  const pad = (n: number | string) => String(n).padStart(2, '0');
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s);
  if (dotted) return `${dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3]}-${pad(dotted[2])}-${pad(dotted[1])}`;
  const named = /^(\d{1,2}) ([a-z]+)\.? (\d{4})$/.exec(s);
  if (!named) return null;
  const month = MONTHS.find(([re]) => re.test(named[2]))?.[1];
  return month ? `${named[3]}-${pad(month)}-${pad(named[1])}` : null;
}

/** "1 990,00€", "â‚¬430.18", "US$1.18", "-810,00€" → number (null when there is no digit). */
export function parseMoney(input: string): number | null {
  let s = input.replace(/[^\d,.-]/g, '');
  if (!/\d/.test(s)) return null;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (comma >= 0) s = (s.match(/,/g)!.length === 1 ? s.replace(',', '.') : s.replace(/,/g, ''));
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// --- Crypto quantities ------------------------------------------------------------------------

export interface CryptoLine {
  kind: 'learn' | 'staking';
  date: ISODate;
  symbol: string;
  /** The quantity as written ("320,529,034", or "2 182,833696" when Revolut got it right). */
  raw: string;
  /** Unit price and value in €, rounded to the cent by Revolut. */
  price: number;
  value: number;
}

export interface CryptoHolding {
  symbol: string;
  raw: string;
  price: number;
  value: number;
}

type RawQuantity = { exact: number } | { digits: number };

/** Only digits and commas: the decimal point was lost. Anything else (a thousands space): a real number. */
function readQuantity(raw: string): RawQuantity {
  const s = raw.trim();
  if (/[^\d,]/.test(s)) return { exact: Number(s.replace(/[^\d,]/g, '').replace(',', '.')) };
  return { digits: Number(s.replace(/\D/g, '')) };
}

/** Does quantity × price (price and value rounded to the cent) give the value? */
const fits = (q: number, price: number, value: number) =>
  q * Math.max(price - 0.005, 0) <= value + 0.005 && q * (price + 0.005) >= value - 0.005;

/**
 * The quantity with `decimals` decimals, × 10 for each trailing zero Revolut dropped ("0,1521338"
 * for 0,15213380) while it is too small for its value; null when nothing fits.
 */
function scaled(r: { raw: string; price: number; value: number }, decimals: number): { q: number; zeros: number } | null {
  const x = readQuantity(r.raw);
  if ('exact' in x) return { q: x.exact, zeros: 0 };
  let q = x.digits / 10 ** decimals;
  for (let zeros = 0; zeros <= 4; zeros++, q *= 10) if (fits(q, r.price, r.value)) return { q, zeros };
  return null;
}

/**
 * Rebuilds the quantities of the received lines (same order as `lines`). Each coin has a fixed
 * number of decimals: the one where the € values agree with the fewest dropped zeros (8 when
 * nothing tells, e.g. prices shown as 0,00 €), and the holding at the end must match the lines.
 * Staking values are all 0,00 €, so their dropped zeros can't be seen: the staking quantities are
 * scaled so the coin adds up to the holding.
 */
export function cryptoQuantities(lines: CryptoLine[], holdings: CryptoHolding[], warnings: string[]): number[] {
  const quantities = lines.map(() => 0);
  const symbols = [...new Set([...lines.map((l) => l.symbol), ...holdings.map((h) => h.symbol)])];
  for (const symbol of symbols) {
    const indexes = lines.flatMap((l, i) => (l.symbol === symbol ? [i] : []));
    const holding = holdings.find((h) => h.symbol === symbol);
    const exactHolding = holding && 'exact' in readQuantity(holding.raw) ? (readQuantity(holding.raw) as { exact: number }).exact : null;
    if (!indexes.length) {
      warnings.push(`${symbol}: held at the end of the statement but never received in it (bought or transferred in?): not imported.`);
      continue;
    }

    let best = { decimals: 8, cost: Infinity };
    for (let decimals = 0; decimals <= 12; decimals++) {
      let cost = 0;
      let sum = 0;
      for (const r of [...indexes.map((i) => lines[i]), ...(holding ? [holding] : [])]) {
        const s = scaled(r, decimals);
        if (!s) cost += 100;
        else {
          cost += s.zeros;
          if (r !== holding) sum += s.q;
        }
      }
      if (exactHolding !== null && (sum < exactHolding / 3 || sum > exactHolding * 3)) cost += 100;
      if (cost < best.cost || (cost === best.cost && Math.abs(decimals - 8) < Math.abs(best.decimals - 8))) best = { decimals, cost };
    }

    for (const i of indexes) {
      const s = scaled(lines[i], best.decimals);
      quantities[i] = s?.q ?? (readQuantity(lines[i].raw) as { digits: number }).digits / 10 ** best.decimals;
    }
    const received = indexes.reduce((sum, i) => sum + quantities[i], 0);
    if (!holding) {
      warnings.push(`${symbol}: not in the holdings at the end of the statement (sold or sent?): imported as still held (${round10(received)}).`);
      continue;
    }
    const held = scaled(holding, best.decimals)?.q ?? exactHolding ?? (readQuantity(holding.raw) as { digits: number }).digits / 10 ** best.decimals;
    const staking = indexes.filter((i) => lines[i].kind === 'staking');
    const staked = staking.reduce((sum, i) => sum + quantities[i], 0);
    const gap = held - received;
    if (Math.abs(gap) <= 1e-9 * Math.max(1, held)) continue;
    const factor = staked > 0 ? (staked + gap) / staked : 0;
    if (factor >= 0.5 && factor <= 2) {
      for (const i of staking) quantities[i] *= factor;
    } else {
      warnings.push(`${symbol}: the statement says ${round10(held)} held, the received lines add up to ${round10(received)}: kept the lines.`);
    }
  }
  return quantities.map(round10);
}

// --- Statement --------------------------------------------------------------------------------

type Table = 'current' | 'dividends' | 'trades' | 'sales' | 'learn' | 'staking' | 'holdings';
type Section = 'current' | 'invest' | 'crypto' | 'commodity' | null;

export function convertRevolut(text: string, accountName = 'Revolut'): ConvertResult {
  const warnings: string[] = [];
  const rows = parseCsv(text).map((r) => r.map((c) => c.trim()));
  if (!rows.some((r) => /^(Comptes courants|Investment Services|Cryptos) R/i.test(ascii(r[0] ?? '')))) {
    throw new Error('This is not a Revolut consolidated statement (expected sections like "Comptes courants Relevés de transactions").');
  }

  const assets = new Map<string, ImportedAsset>();
  const operations: ImportedOperation[] = [];
  const cash: ImportedAsset = { key: CASH, name: `${accountName} cash`, category: 'Cash', valuation: 'balance', identifier: null };
  const crypto: CryptoLine[] = [];
  const holdings: CryptoHolding[] = [];

  const stock = (isin: string, symbol: string, name?: string) => {
    let asset = assets.get(isin);
    if (!asset) {
      asset = { key: isin, name: name || symbol || isin, category: 'Stock', valuation: 'units', identifier: isin };
      assets.set(isin, asset);
    } else if (name && asset.name !== name) asset.name = name;
    return asset;
  };
  // Same day: money in first, then the buys, then the dividends.
  const cashOp = (date: ISODate, type: 'DEPOSIT' | 'WITHDRAW', amount: number, note: string) =>
    operations.push({ asset: CASH, type, date, time: '09:00', quantity: null, unitPrice: null, amount, fees: 0, note });

  let section: Section = null;
  let currency = 'EUR';
  let title = '';
  let table: Table | null = null;

  for (const r of rows) {
    const first = ascii(r[0] ?? '');
    const cell = (i: number) => r[i] ?? '';
    if (first.startsWith('---') || first === 'Total') {
      table = null;
      continue;
    }
    if (first && r.slice(1).every((c) => c === '')) {
      // A title: a section, an account, or the name of the next table.
      table = null;
      title = first;
      if (/^Comptes courants/i.test(first)) section = 'current';
      else if (/^Investment Services/i.test(first)) section = 'invest';
      else if (/^Cryptos/i.test(first)) section = 'crypto';
      else if (/^Mati/i.test(first)) section = 'commodity';
      const account = /\(([A-Z]{3})\)$/.exec(first);
      if (account) currency = account[1];
      continue;
    }

    // Table headers.
    const second = ascii(cell(1));
    if (first === 'Date' && second === 'Description') table = 'current';
    else if (first === 'Date' && /^Description et symbole/.test(second) && cell(2) === 'ISIN' && ascii(cell(3)) === 'Pays') table = 'dividends';
    else if (first === 'Date' && cell(2) === 'ISIN' && /^Quantit/.test(ascii(cell(3)))) table = 'trades';
    else if (/^Date \(de la vente\)/.test(first)) table = 'sales';
    else if (/^Date du re/.test(first)) table = /staking/i.test(title) ? 'staking' : /Apprendre/i.test(title) ? 'learn' : null;
    else if (first === 'Description et symbole' && /^Unit/.test(second)) table = 'holdings';
    else {
      // A data line.
      if (table === 'holdings') {
        holdings.push({ symbol: first, raw: cell(1), price: parseMoney(cell(2)) ?? 0, value: parseMoney(cell(3)) ?? 0 });
        continue;
      }
      const date = parseRevolutDate(r[0] ?? '');
      if (!date) continue; // account details, summaries
      const line = r.map(ascii).filter(Boolean).join(', ');

      if (table === 'current') {
        const amount = parseMoney(cell(3)) ?? 0;
        const isPocket = /pocket|poche/i.test(second);
        if (currency === 'EUR') {
          if ((/^Change\b/i.test(second) || isPocket) && amount !== 0) {
            const note = `${accountName}: ${second} (${fmt(Math.abs(amount))} €)`;
            cashOp(date, amount < 0 ? 'DEPOSIT' : 'WITHDRAW', Math.abs(amount), note);
          }
        } else if (!/^Change\b/i.test(second) && !isPocket) {
          warnings.push(`${currency} account, ${line}: ignored (only conversions and transfers to the investment account are expected; money spent from it isn't taken out of the cash).`);
        }
      } else if (table === 'dividends') {
        const net = parseMoney(cell(13)) ?? 0;
        const name = second.replace(/\s+dividend$/i, '');
        stock(cell(2), name, name);
        if (net <= 0) {
          warnings.push(`Dividend without a net amount, ignored: ${line}`);
          continue;
        }
        const note = `${accountName}: dividend ${fmt(parseMoney(cell(5)) ?? 0)} €, tax withheld ${fmt(parseMoney(cell(7)) ?? 0)} €`;
        operations.push({ asset: cell(2), type: 'INCOME', date, time: '18:00', quantity: null, unitPrice: null, amount: net, fees: 0, note, cash: CASH });
      } else if (table === 'trades') {
        const quantity = parseMoney(cell(3)) ?? 0;
        const gross = parseMoney(cell(6)) ?? 0;
        const fees = parseMoney(cell(12)) ?? 0;
        const net = parseMoney(cell(14)) ?? gross - fees;
        if (quantity <= 0 || net <= 0) {
          warnings.push(`Broker line not understood (not a buy?), ignored: ${line}`);
          continue;
        }
        if (Math.abs(net + fees - gross) > 0.015) warnings.push(`${line}: gross ≠ net + fees, booked the net and the fees.`);
        const asset = stock(cell(2), second);
        operations.push({
          asset: asset.key,
          type: 'BUY',
          date,
          time: '12:00',
          quantity,
          unitPrice: net / quantity,
          amount: net,
          fees,
          note: `${accountName}: ${quantity} ${second} for ${ascii(cell(13)) || ascii(cell(5))}`,
          cash: CASH,
        });
      } else if (table === 'learn' || table === 'staking') {
        crypto.push({ kind: table, date, symbol: second, raw: cell(2), price: parseMoney(cell(3)) ?? 0, value: parseMoney(cell(4)) ?? 0 });
      } else if (table === 'sales') {
        warnings.push(`Sale not imported (not supported yet${section === 'commodity' ? ' for commodities' : ''}): ${line}`);
      } else {
        warnings.push(`Line not understood, ignored: ${line}`);
      }
    }
  }

  operations.push(...cryptoOperations(crypto, holdings, accountName, assets, warnings));

  // The investment account's cash isn't in the statement: say what it adds up to.
  let balance = 0;
  let negative: ISODate | null = null;
  const cashMoves = [...operations].sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
  for (const op of cashMoves) {
    if (op.asset === CASH) balance += op.type === 'DEPOSIT' ? op.amount : -op.amount;
    else if (op.cash === CASH) balance += op.type === 'BUY' ? -(op.amount + op.fees) : op.amount - op.fees;
    if (balance < -0.005 && !negative) negative = op.date;
  }
  if (negative) warnings.push(`${cash.name} goes below 0 on ${negative}: some money put in is missing from the statement.`);
  warnings.push(
    `${cash.name} ends at ${fmt(balance)} €: an estimate (the statement doesn't show the investment account's cash, and it is counted in euros at each operation's rate). Check it in Revolut and correct it with "Update balance".`,
  );

  return {
    account: { name: accountName, institution: 'Revolut', assets: [cash, ...assets.values()], operations },
    warnings,
  };
}

/** Learn & Earn: one buy per coin and day. Staking: one buy per coin and year, on its last reward. All at 0 €. */
function cryptoOperations(
  lines: CryptoLine[],
  holdings: CryptoHolding[],
  accountName: string,
  assets: Map<string, ImportedAsset>,
  warnings: string[],
): ImportedOperation[] {
  const quantities = cryptoQuantities(lines, holdings, warnings);
  const groups = new Map<string, { kind: CryptoLine['kind']; symbol: string; date: ISODate; quantity: number; value: number; count: number; lastPrice: number }>();
  lines.forEach((l, i) => {
    const key = `${l.symbol}|${l.kind}|${l.kind === 'staking' ? l.date.slice(0, 4) : l.date}`;
    const g = groups.get(key) ?? { kind: l.kind, symbol: l.symbol, date: l.date, quantity: 0, value: 0, count: 0, lastPrice: 0 };
    g.quantity += quantities[i];
    // Learn & Earn values are real amounts (0,10 € and up); staking ones round to 0,00 €.
    g.value += l.kind === 'learn' ? l.value : quantities[i] * l.price;
    g.count++;
    if (l.date >= g.date) {
      g.date = l.date;
      if (l.price > 0) g.lastPrice = l.price;
    }
    groups.set(key, g);
  });

  const operations: ImportedOperation[] = [];
  for (const g of groups.values()) {
    if (g.quantity <= 0) continue;
    const key = `crypto:${g.symbol}`;
    if (!assets.has(key)) assets.set(key, { key, name: g.symbol, category: 'Crypto', valuation: 'units', identifier: g.symbol });
    const holding = holdings.find((h) => h.symbol === g.symbol);
    const unitPrice =
      g.kind === 'learn' && g.value > 0 ? g.value / g.quantity : g.lastPrice || (g.value > 0 ? g.value / g.quantity : holding?.price ?? 0);
    const worth = `worth ${fmt(g.value)} € when received`;
    operations.push({
      asset: key,
      type: 'BUY',
      date: g.date,
      time: '12:00',
      quantity: round10(g.quantity),
      unitPrice,
      amount: 0,
      fees: 0,
      note:
        g.kind === 'learn'
          ? `${accountName} Learn & Earn: ${worth}`
          : `${accountName} staking ${g.date.slice(0, 4)}: ${g.count} reward${g.count > 1 ? 's' : ''}, ${worth}`,
    });
  }
  return operations;
}
