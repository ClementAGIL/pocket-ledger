import { parseAmount, parseCsv, parseDayFirstDate } from './csv';
import type { ImportedAccount, ImportedAsset, ImportedOperation } from './ledger';

/*
 * DEGIRO "Account" statement (Compte › Relevé, CSV, French), newest line first:
 *   Date, Heure, Date de valeur, Produit, Code ISIN, Description, FX, Mouvements (devise, montant),
 *   Solde (devise, montant), ID Ordre
 *
 * - Trades: the lines of one order share its ID: "Achat/Vente N Name@price CUR", DEGIRO fees (EUR)
 *   and, for a foreign currency, the two "Opération de change" lines, whose EUR side is what was
 *   really paid or received.
 * - Dividends (and their tax, capital returns, ADR fees, corrections) arrive in their currency and
 *   are converted to EUR later by "Opération de change" lines without an order: each conversion
 *   shares its EUR among the pending amounts, so the euros match the statement to the cent.
 * - Deposits, interest and exchange connection fees go to the account's cash ("DEGIRO cash").
 *   Cash sweeps and transfers to/from the flatexDEGIRO bank account move money inside the account:
 *   ignored.
 * - A split ("Ajustement fractionnement") rewrites the earlier quantities and prices (no fake sale).
 * - A delisting with a cash settlement becomes a sale at the settled amount.
 */

export interface ConvertResult {
  account: ImportedAccount;
  warnings: string[];
}

interface Line {
  /** 1-based line in the file, for warnings. */
  n: number;
  date: string;
  time: string;
  product: string;
  isin: string;
  description: string;
  fx: number | null;
  currency: string;
  amount: number | null;
  orderId: string;
}

const CASH = 'cash';
const ETF_NAME = /\b(ETF|UCITS|iShares|Vanguard|Amundi|Lyxor|Xtrackers|SPDR)\b/i;

type PendingKind = 'dividend' | 'tax' | 'capital' | 'adr' | 'settlement' | 'other';
interface Pending {
  isin: string;
  kind: PendingKind;
  amount: number;
}

const PENDING_KINDS: [RegExp, PendingKind][] = [
  [/^Dividende/i, 'dividend'],
  [/^Imp[ôo]ts? sur dividende/i, 'tax'],
  [/^Remboursement de capital/i, 'capital'],
  [/^Frais de d[ée]tention/i, 'adr'],
  [/^R[èe]glement esp[èe]ces/i, 'settlement'],
];

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const isChange = (l: Line) => /^Op[ée]ration de change/i.test(l.description);

export function convertDegiro(text: string, accountName = 'DEGIRO'): ConvertResult {
  const warnings: string[] = [];
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header || !/^Date$/i.test(header[0]?.trim() ?? '') || header.length < 11) {
    throw new Error('This is not a DEGIRO account statement (expected the "Date,Heure,Date de,Produit,Code ISIN,…" header).');
  }

  const lines: Line[] = [];
  rows.forEach((r, i) => {
    const date = parseDayFirstDate(r[0] ?? '');
    if (!date) {
      warnings.push(`Line ${i + 2}: unreadable date "${r[0]}", skipped.`);
      return;
    }
    lines.push({
      n: i + 2,
      date,
      time: (r[1] ?? '00:00').trim() || '00:00',
      product: (r[3] ?? '').trim(),
      isin: (r[4] ?? '').trim(),
      description: (r[5] ?? '').trim(),
      fx: parseAmount(r[6] ?? ''),
      currency: (r[7] ?? '').trim(),
      amount: parseAmount(r[8] ?? ''),
      orderId: (r[11] ?? '').trim(),
    });
  });
  // Oldest first; lines of the same minute keep the order DEGIRO wrote them in, reversed.
  lines.reverse();

  const assets = new Map<string, ImportedAsset>();
  const operations: ImportedOperation[] = [];
  const held = new Map<string, number>();
  const cash: ImportedAsset = { key: CASH, name: `${accountName} cash`, category: 'Cash', valuation: 'balance', identifier: null };

  const assetFor = (isin: string, product: string, niceName?: string) => {
    let asset = assets.get(isin);
    if (!asset) {
      const name = niceName || product || isin;
      asset = { key: isin, name, category: ETF_NAME.test(name) ? 'ETF' : 'Stock', valuation: 'units', identifier: isin };
      assets.set(isin, asset);
    } else if (niceName && asset.name === (asset.identifier ?? '')) asset.name = niceName;
    return asset;
  };
  const nameOf = (isin: string, product: string) => assetFor(isin, product).name;

  const cashOp = (l: Line, type: 'DEPOSIT' | 'WITHDRAW' | 'INCOME', amount: number, fees: number, note: string | null) =>
    operations.push({ asset: CASH, type, date: l.date, time: l.time, quantity: null, unitPrice: null, amount, fees, note });

  // --- Trades (lines grouped by order ID) ---------------------------------------------------
  const byOrder = new Map<string, Line[]>();
  for (const l of lines) if (l.orderId) byOrder.set(l.orderId, [...(byOrder.get(l.orderId) ?? []), l]);
  const doneOrders = new Set<string>();

  const TRADE = /^(Achat|Vente) ([\d\s .,]+) (.+)@([\d\s .,]+) ([A-Z]{3})/i;

  const trade = (group: Line[]) => {
    const first = group[0];
    const fills = group.map((l) => ({ l, m: TRADE.exec(l.description) })).filter((x) => x.m);
    if (!fills.length) {
      warnings.push(`Line ${first.n}: order ${first.orderId} has no "Achat"/"Vente" line, skipped (${first.description}).`);
      return;
    }
    const isBuy = /^Achat/i.test(fills[0].m![1]);
    if (fills.some((f) => /^Achat/i.test(f.m![1]) !== isBuy)) warnings.push(`Line ${first.n}: order ${first.orderId} mixes buys and sells.`);
    const tradeCurrency = fills[0].m![5].toUpperCase();
    let quantity = 0;
    let foreign = 0;
    for (const f of fills) {
      quantity += parseAmount(f.m![2]) ?? 0;
      foreign += Math.abs(f.l.amount ?? 0);
    }
    const isin = fills[0].l.isin;
    const asset = assetFor(isin, fills[0].l.product, fills[0].m![3].trim());

    let fees = 0;
    let eur = tradeCurrency === 'EUR' ? foreign : 0;
    let rate: number | null = null;
    for (const l of group) {
      if (fills.some((f) => f.l === l)) continue;
      if (/^Frais/i.test(l.description) && l.currency === 'EUR') fees -= l.amount ?? 0;
      else if (isChange(l)) {
        if (l.currency === 'EUR') eur += Math.abs(l.amount ?? 0);
        if (l.fx) rate = l.fx;
      } else warnings.push(`Line ${l.n}: unknown line in order ${l.orderId}, ignored: ${l.description}`);
    }
    if (eur === 0 && foreign > 0) {
      if (rate) {
        eur = foreign / rate;
        warnings.push(`Line ${first.n}: no EUR amount for order ${first.orderId}, converted at ${rate}.`);
      } else {
        warnings.push(`Line ${first.n}: no EUR amount nor rate for order ${first.orderId} (${tradeCurrency}), skipped.`);
        return;
      }
    }
    eur = round2(eur);
    const price = fills[0].m![4].trim();
    const note =
      tradeCurrency === 'EUR'
        ? `DEGIRO: ${quantity} @ ${price} EUR`
        : `DEGIRO: ${quantity} @ ${price} ${tradeCurrency}${rate ? `, ${tradeCurrency}/EUR ${rate}` : ''}`;
    const before = held.get(isin) ?? 0;
    if (!isBuy && quantity > before + 1e-9) warnings.push(`Line ${first.n}: sells ${quantity} ${asset.name} but only ${before} held.`);
    held.set(isin, before + (isBuy ? quantity : -quantity));
    operations.push({
      asset: isin,
      type: isBuy ? 'BUY' : 'SELL',
      date: first.date,
      time: first.time,
      quantity,
      unitPrice: eur / quantity,
      amount: eur,
      fees: round2(fees),
      note,
      cash: CASH,
    });
  };

  // --- Amounts waiting for a conversion to EUR, by currency -----------------------------------
  const pending = new Map<string, Pending[]>();
  const delisted = new Map<string, number>();
  const lastRate = new Map<string, number>();

  const settle = (l: Line, currency: string, foreignAmount: number, eurAmount: number) => {
    const items = pending.get(currency) ?? [];
    pending.set(currency, []);
    const total = items.reduce((s, p) => s + p.amount, 0);
    if (!items.length || Math.abs(total) < 0.005) {
      warnings.push(`Line ${l.n}: conversion of ${fmt(foreignAmount)} ${currency} with nothing pending, ignored.`);
      return;
    }
    if (Math.abs(total - foreignAmount) > 0.015) {
      warnings.push(`Line ${l.n}: converts ${fmt(foreignAmount)} ${currency} but ${fmt(total)} ${currency} were pending; shared pro rata.`);
    }

    // One entry per investment and kind of money (income, or sale for a delisting).
    const groups = new Map<string, { isin: string; sale: boolean; items: Pending[]; foreign: number }>();
    for (const p of items) {
      const sale = p.kind === 'settlement';
      const key = `${p.isin}|${sale}`;
      const g = groups.get(key) ?? { isin: p.isin, sale, items: [], foreign: 0 };
      g.items.push(p);
      g.foreign += p.amount;
      groups.set(key, g);
    }
    // Split the EUR pro rata; the last group takes the rounding so the cents add up.
    const list = [...groups.values()];
    let left = round2(eurAmount);
    list.forEach((g, i) => {
      const eur = i === list.length - 1 ? left : round2((eurAmount * g.foreign) / total);
      left = round2(left - eur);
      if (Math.abs(eur) < 0.005) return;
      const name = nameOf(g.isin, '');
      if (g.sale) {
        const quantity = delisted.get(g.isin) ?? held.get(g.isin) ?? 0;
        if (quantity <= 0) {
          warnings.push(`Line ${l.n}: cash settlement for ${name} without shares held, booked as income.`);
        } else {
          held.set(g.isin, 0);
          operations.push({
            asset: g.isin,
            type: 'SELL',
            date: l.date,
            time: l.time,
            quantity,
            unitPrice: eur / quantity,
            amount: eur,
            fees: 0,
            note: `DEGIRO: delisting, cash settlement ${fmt(g.foreign)} ${currency}`,
            cash: CASH,
          });
          return;
        }
      }
      const parts = describe(g.items, currency);
      if (eur > 0) {
        operations.push({ asset: g.isin, type: 'INCOME', date: l.date, time: l.time, quantity: null, unitPrice: null, amount: eur, fees: 0, note: `DEGIRO: ${parts}`, cash: CASH });
      } else {
        // Net cost (an ADR fee alone, a correction): paid by the cash.
        cashOp(l, 'INCOME', 0, -eur, `${name}: ${parts}`);
      }
    });
  };

  // --- One pass, oldest first --------------------------------------------------------------
  const doneChanges = new Set<Line>();
  const splits = new Map<string, Line[]>();

  for (const l of lines) {
    if (l.orderId) {
      if (!doneOrders.has(l.orderId)) {
        doneOrders.add(l.orderId);
        trade(byOrder.get(l.orderId)!);
      }
      continue;
    }
    const d = l.description;
    const amount = l.amount ?? 0;

    if (isChange(l)) {
      if (doneChanges.has(l)) continue;
      // Both sides of a conversion: same minute, no order ID.
      const pair = lines.filter((o) => !o.orderId && isChange(o) && o.date === l.date && o.time === l.time && !doneChanges.has(o));
      pair.forEach((o) => doneChanges.add(o));
      const eurSide = pair.filter((o) => o.currency === 'EUR');
      const foreignSide = pair.filter((o) => o.currency && o.currency !== 'EUR');
      const currencies = new Set(foreignSide.map((o) => o.currency));
      if (eurSide.length !== 1 || currencies.size !== 1) {
        warnings.push(`Line ${l.n}: currency conversion not understood (${pair.length} lines), ignored.`);
        continue;
      }
      const currency = foreignSide[0].currency;
      const rate = foreignSide.find((o) => o.fx)?.fx;
      if (rate) lastRate.set(currency, rate);
      // Selling the currency (−) converts pending income (+); buying it covers pending costs.
      settle(l, currency, -foreignSide.reduce((s, o) => s + (o.amount ?? 0), 0), eurSide[0].amount ?? 0);
      continue;
    }
    if (/Cash Sweep|^Virement (vers|depuis) votre Compte Esp[èe]ces/i.test(d)) continue;
    if (/^(D[ée]p[ôo]t|Deposit)\b/i.test(d) && l.currency === 'EUR') {
      if (amount > 0) cashOp(l, 'DEPOSIT', amount, 0, 'DEGIRO: deposit');
      continue;
    }
    if (/^(Retrait|Withdrawal)\b/i.test(d) && l.currency === 'EUR') {
      if (amount !== 0) cashOp(l, 'WITHDRAW', Math.abs(amount), 0, 'DEGIRO: withdrawal');
      continue;
    }
    if (/Interest/i.test(d) && !l.isin && l.currency === 'EUR') {
      if (amount > 0) cashOp(l, 'INCOME', amount, 0, `DEGIRO: ${d}`);
      else if (amount < 0) cashOp(l, 'INCOME', 0, -amount, `DEGIRO: ${d}`);
      continue;
    }
    if (/^Frais/i.test(d) && !l.isin && l.currency === 'EUR') {
      if (amount < 0) cashOp(l, 'INCOME', 0, -amount, `DEGIRO: ${d}`);
      else if (amount > 0) cashOp(l, 'INCOME', amount, 0, `DEGIRO: ${d}`);
      continue;
    }
    if (/^Ajustement fractionnement/i.test(d) && l.isin) {
      splits.set(`${l.isin}|${l.date}`, [...(splits.get(`${l.isin}|${l.date}`) ?? []), l]);
      const pair = splits.get(`${l.isin}|${l.date}`)!;
      if (pair.length === 2) applySplit(pair, operations, held, warnings);
      continue;
    }
    const delisting = /^Delisting: Vente ([\d\s .,]+) /i.exec(d);
    if (delisting && l.isin) {
      delisted.set(l.isin, parseAmount(delisting[1]) ?? 0);
      assetFor(l.isin, l.product);
      if (amount !== 0) pending.set(l.currency, [...(pending.get(l.currency) ?? []), { isin: l.isin, kind: 'settlement', amount }]);
      continue;
    }
    const kind = PENDING_KINDS.find(([re]) => re.test(d))?.[1];
    if (kind && l.isin) {
      assetFor(l.isin, l.product);
      if (amount === 0) continue;
      if (l.currency === 'EUR') {
        // Already in euros: booked right away.
        settleEur(l, kind, amount);
      } else pending.set(l.currency, [...(pending.get(l.currency) ?? []), { isin: l.isin, kind, amount }]);
      continue;
    }
    warnings.push(`Line ${l.n}: not understood, ignored: ${l.date} ${d} ${l.currency} ${l.amount ?? ''}`.trim());
  }

  function settleEur(l: Line, kind: PendingKind, amount: number) {
    const name = nameOf(l.isin, l.product);
    if (kind === 'settlement') {
      const quantity = delisted.get(l.isin) ?? held.get(l.isin) ?? 0;
      if (quantity > 0) {
        held.set(l.isin, 0);
        operations.push({ asset: l.isin, type: 'SELL', date: l.date, time: l.time, quantity, unitPrice: amount / quantity, amount, fees: 0, note: 'DEGIRO: cash settlement', cash: CASH });
        return;
      }
    }
    const note = `DEGIRO: ${describe([{ isin: l.isin, kind, amount }], 'EUR')}`;
    if (amount > 0) operations.push({ asset: l.isin, type: 'INCOME', date: l.date, time: l.time, quantity: null, unitPrice: null, amount, fees: 0, note, cash: CASH });
    else cashOp(l, 'INCOME', 0, -amount, `${name}: ${note}`);
  }

  // Money still in a foreign currency at the end of the statement: not in EUR yet.
  for (const [currency, items] of pending) {
    const total = items.reduce((s, p) => s + p.amount, 0);
    if (Math.abs(total) >= 0.005) {
      const rate = lastRate.get(currency);
      warnings.push(
        `${fmt(total)} ${currency} not converted to EUR yet (${[...new Set(items.map((p) => nameOf(p.isin, '')))].join(', ')}): left out` +
          (rate ? ` (≈ ${fmt(total / rate)} €).` : '.'),
      );
    }
  }
  for (const [key, pair] of splits) if (pair.length !== 2) warnings.push(`Split ${key}: expected 2 lines, found ${pair.length}; not applied.`);

  return {
    account: {
      name: accountName,
      institution: 'flatexDEGIRO',
      assets: [cash, ...assets.values()],
      operations,
    },
    warnings,
  };
}

const KIND_LABELS: Record<PendingKind, string> = {
  dividend: 'dividend',
  tax: 'tax withheld',
  capital: 'capital return',
  adr: 'ADR fee',
  settlement: 'cash settlement',
  other: 'other',
};

/** "dividend 25.30 USD, tax withheld -3.80 USD" (corrections net out with the line they fix). */
function describe(items: Pending[], currency: string) {
  const sums = new Map<PendingKind, number>();
  for (const p of items) sums.set(p.kind, (sums.get(p.kind) ?? 0) + p.amount);
  const kinds = Object.keys(KIND_LABELS) as PendingKind[];
  const parts = kinds
    .filter((k) => Math.abs(sums.get(k) ?? 0) >= 0.005)
    .map((k) => `${KIND_LABELS[k]} ${fmt(sums.get(k)!)} ${currency}`);
  return parts.length ? parts.join(', ') : `corrections ${currency}`;
}

/**
 * "Ajustement fractionnement": the old shares go out (+ cash), the new ones come in (− cash) for
 * the same total. The app has no split operation, so the earlier entries are restated in new
 * shares: same money, quantity × ratio, unit price ÷ ratio.
 */
function applySplit(pair: Line[], operations: ImportedOperation[], held: Map<string, number>, warnings: string[]) {
  const qty = (l: Line) => parseAmount(/^Ajustement fractionnement: ([\d\s .,]+) /i.exec(l.description)?.[1] ?? '') ?? 0;
  const out = pair.find((l) => (l.amount ?? 0) > 0);
  const into = pair.find((l) => (l.amount ?? 0) < 0);
  const isin = pair[0].isin;
  if (!out || !into || qty(out) <= 0) {
    warnings.push(`Line ${pair[0].n}: split not understood, not applied.`);
    return;
  }
  const ratio = qty(into) / qty(out);
  const before = held.get(isin) ?? 0;
  if (Math.abs(before - qty(out)) > 1e-9) warnings.push(`Line ${out.n}: split of ${qty(out)} shares but ${before} held.`);
  for (const op of operations) {
    if (op.asset !== isin || op.quantity === null) continue;
    op.quantity *= ratio;
    if (op.unitPrice !== null) op.unitPrice /= ratio;
    op.note = `${op.note ?? ''} (before the ${pair[0].date} split: ×${+ratio.toFixed(6)})`.trim();
  }
  held.set(isin, before * ratio);
}
