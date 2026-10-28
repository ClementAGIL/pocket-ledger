import type { Portfolio, AssetView } from './portfolio';
import { relativeChange } from './priceUpdates';
import type { ISODate, PricePoint } from './types';

/*
 * Online prices (opt-in, user-triggered): which investments can be fetched, how their identifier
 * is read, and how the sources' answers become a price in euros. No I/O here: see src/quotes/.
 */

export type IdentifierKind = 'isin' | 'crypto' | 'ticker';

export interface QuoteCandidate {
  assetId: number;
  name: string;
  identifier: string;
  kind: IdentifierKind;
  /** What is sent to the source: ticker (GOOG), ISIN, or crypto symbol / CoinGecko id. */
  query: string;
  /** Current unit price, null when there is none yet. */
  previousPrice: number | null;
  /** Date of that price (or of the last trade). */
  previousDate: ISODate | null;
}

export type QuoteErrorCode = 'not-found' | 'network' | 'timeout' | 'rate-limited' | 'bad-data' | 'no-fx' | 'cancelled';

export class QuoteError extends Error {
  constructor(
    public code: QuoteErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
  }
}

export function quoteErrorMessage(error: unknown): string {
  const code = error instanceof QuoteError ? error.code : 'bad-data';
  switch (code) {
    case 'not-found':
      return 'Not found: check the ticker (e.g. GOOG, IWDA.AS), ISIN or coin';
    case 'network':
      return 'No connection';
    case 'timeout':
      return 'The source did not answer in time';
    case 'cancelled':
      return 'Cancelled';
    case 'rate-limited':
      return 'Too many requests: try again in a minute';
    case 'no-fx':
      return `No exchange rate for ${(error as QuoteError).message}`;
    default:
      return 'Unexpected answer from the source';
  }
}

/** ISIN: 2 letters, 9 alphanumerics, 1 check digit (Luhn on the letters expanded to numbers). */
export function isISIN(value: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value)) return false;
  const digits = value.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** How an identifier is read. Crypto is decided by the category (the default "Crypto"). */
export function classifyIdentifier(identifier: string, categoryName: string): { kind: IdentifierKind; query: string } {
  const value = identifier.trim();
  if (/crypto/i.test(categoryName)) {
    // "BTC", "BTC-EUR" (Yahoo style), "bitcoin" or "Bitcoin": all searched on CoinGecko.
    return { kind: 'crypto', query: value.replace(/-(EUR|USD|USDT)$/i, '') };
  }
  const upper = value.toUpperCase();
  if (isISIN(upper)) return { kind: 'isin', query: upper };
  return { kind: 'ticker', query: upper };
}

/** Open unit-priced investments (not debts, not archived) with an identifier, in list order. */
export function quoteCandidates(portfolio: Portfolio): QuoteCandidate[] {
  const list: QuoteCandidate[] = [];
  const add = (v: AssetView) => {
    const identifier = v.asset.identifier?.trim();
    if (!identifier || v.isLiability || v.isClosed || v.asset.archived || v.asset.valuation !== 'units') return;
    const { kind, query } = classifyIdentifier(identifier, v.category.name);
    list.push({ assetId: v.asset.id, name: v.asset.name, identifier, kind, query, previousPrice: v.position.price, previousDate: v.position.priceDate });
  };
  for (const g of portfolio.groups) g.items.forEach(add);
  return list;
}

export interface RawQuote {
  symbol: string;
  price: number;
  currency: string;
  date: ISODate;
}

/** Local trading day of the market (its own time zone), never after today. */
function marketDate(epochSeconds: number, gmtOffsetSeconds: number, today: ISODate): ISODate {
  const d = new Date((epochSeconds + gmtOffsetSeconds) * 1000);
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return date > today ? today : date;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Yahoo `v8/finance/chart/{symbol}` answer. */
export function parseYahooChart(json: unknown, today: ISODate): RawQuote {
  const chart = isRecord(json) && isRecord(json.chart) ? json.chart : null;
  if (!chart) throw new QuoteError('bad-data');
  const result = Array.isArray(chart.result) ? chart.result[0] : null;
  if (!result) throw new QuoteError(chart.error ? 'not-found' : 'bad-data');
  const meta = isRecord(result) && isRecord(result.meta) ? result.meta : null;
  const price = meta?.regularMarketPrice;
  if (!meta || typeof price !== 'number' || !(price > 0)) throw new QuoteError('not-found');
  const time = typeof meta.regularMarketTime === 'number' ? meta.regularMarketTime : null;
  const offset = typeof meta.gmtoffset === 'number' ? meta.gmtoffset : 0;
  return {
    symbol: typeof meta.symbol === 'string' ? meta.symbol : '',
    price,
    currency: typeof meta.currency === 'string' ? meta.currency : 'EUR',
    date: time === null ? today : marketDate(time, offset, today),
  };
}

export interface RawHistory {
  symbol: string;
  currency: string;
  /** Close of each month ('YYYY-MM'), split-adjusted, in the listing's currency. */
  months: Map<string, number>;
  /** Stock splits (first day at the new price, local to the exchange), oldest first: 20 for 20-for-1. */
  splits: { date: ISODate; ratio: number }[];
}

/**
 * Yahoo `v8/finance/chart/{symbol}?period1=0&period2=…&interval=1mo` answer. Bars start on the 1st of the
 * month (exchange time); half a day is added so a summer-time offset can't move one to the
 * previous month. The current month can appear twice (partial bar + latest quote): the last wins.
 */
export function parseYahooHistory(json: unknown): RawHistory {
  const chart = isRecord(json) && isRecord(json.chart) ? json.chart : null;
  if (!chart) throw new QuoteError('bad-data');
  const result = Array.isArray(chart.result) ? chart.result[0] : null;
  if (!isRecord(result)) throw new QuoteError(chart.error ? 'not-found' : 'bad-data');
  const meta = isRecord(result.meta) ? result.meta : {};
  const offset = typeof meta.gmtoffset === 'number' ? meta.gmtoffset : 0;
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const indicators = isRecord(result.indicators) && Array.isArray(result.indicators.quote) ? result.indicators.quote[0] : null;
  const closes = isRecord(indicators) && Array.isArray(indicators.close) ? indicators.close : [];
  // Midday at the exchange, read in UTC: the exchange's calendar day.
  const day = (t: number): ISODate => {
    const d = new Date((t + offset + 43_200) * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };
  const months = new Map<string, number>();
  timestamps.forEach((t, i) => {
    const close = closes[i];
    if (typeof t !== 'number' || typeof close !== 'number' || !(close > 0)) return;
    months.set(day(t).slice(0, 7), close);
  });
  if (months.size === 0) throw new QuoteError('not-found');
  const events = isRecord(result.events) && isRecord(result.events.splits) ? Object.values(result.events.splits) : [];
  const splits = events
    .flatMap((e) =>
      isRecord(e) && typeof e.date === 'number' && typeof e.numerator === 'number' && typeof e.denominator === 'number' && e.numerator > 0 && e.denominator > 0
        ? [{ date: day(e.date), ratio: e.numerator / e.denominator }]
        : [],
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    symbol: typeof meta.symbol === 'string' ? meta.symbol : '',
    currency: typeof meta.currency === 'string' ? meta.currency : 'EUR',
    months,
    splits,
  };
}

/** Euro-area exchanges, preferred when an ISIN is listed in several places. */
const EURO_EXCHANGES = new Set(['PAR', 'AMS', 'GER', 'FRA', 'MIL', 'MCE', 'BRU', 'LIS', 'VIE', 'HEL', 'ISE', 'DUS', 'MUN', 'STU', 'HAM', 'BER', 'EBS']);
const EURO_SUFFIXES = ['.PA', '.AS', '.DE', '.F', '.MI', '.MC', '.BR', '.LS', '.VI', '.HE', '.IR'];
const SEARCH_TYPES = new Set(['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX', 'CURRENCY', 'FUTURE', 'CRYPTOCURRENCY']);

/** Yahoo `v1/finance/search` answer for an ISIN: its listings, euro ones first, then Yahoo's order. */
export function rankYahooSymbols(json: unknown): string[] {
  const quotes = isRecord(json) && Array.isArray(json.quotes) ? json.quotes.filter(isRecord) : [];
  const usable = quotes.filter((q) => typeof q.symbol === 'string' && (!q.quoteType || SEARCH_TYPES.has(String(q.quoteType))));
  const isEuro = (q: Record<string, unknown>) => EURO_EXCHANGES.has(String(q.exchange)) || EURO_SUFFIXES.some((s) => String(q.symbol).endsWith(s));
  return [...usable.filter(isEuro), ...usable.filter((q) => !isEuro(q))].map((q) => String(q.symbol));
}

/** The symbol to quote for an ISIN: a euro listing if there is one. */
export function pickYahooSymbol(json: unknown): string {
  const pick = rankYahooSymbols(json)[0];
  if (!pick) throw new QuoteError('not-found');
  return pick;
}

/**
 * CoinGecko `search` answer: the coin whose symbol (BTC), id (bitcoin) or name (Bitcoin) matches
 * exactly; several coins share a symbol, so the largest one wins.
 */
export function pickCoinGeckoId(json: unknown, query: string): string {
  const coins = isRecord(json) && Array.isArray(json.coins) ? json.coins.filter(isRecord) : [];
  const q = query.trim().toLowerCase();
  const rank = (c: Record<string, unknown>) => (typeof c.market_cap_rank === 'number' ? c.market_cap_rank : Infinity);
  const match = coins
    .filter((c) => typeof c.id === 'string' && [c.symbol, c.id, c.name].some((v) => String(v).toLowerCase() === q))
    .sort((a, b) => rank(a) - rank(b))[0];
  if (!match) throw new QuoteError('not-found');
  return String(match.id);
}

/** CoinGecko `simple/price?ids=…&vs_currencies=eur` answer. */
export function parseCoinGeckoPrice(json: unknown, id: string): number {
  const entry = isRecord(json) ? json[id] : undefined;
  const eur = isRecord(entry) ? entry.eur : undefined;
  if (typeof eur !== 'number' || !(eur > 0)) throw new QuoteError('not-found');
  return eur;
}

/** Quotes in a currency's minor unit (pence…): divide to get the major unit. */
const MINOR_UNITS: Record<string, [string, number]> = {
  GBp: ['GBP', 100],
  GBX: ['GBP', 100],
  ZAc: ['ZAR', 100],
  ILA: ['ILS', 100],
};

/** Price in the major unit of its currency: 1026.6 GBp → 10.266 GBP. */
export function normalizeCurrency(price: number, currency: string): { price: number; currency: string } {
  const minor = MINOR_UNITS[currency];
  return minor ? { price: price / minor[1], currency: minor[0] } : { price, currency: currency.toUpperCase() };
}

/** `eurRate`: what 1 EUR costs in `currency` (Yahoo EUR{CUR}=X, e.g. EURUSD=X = 1.12). */
export const toEuro = (price: number, eurRate: number) => price / eurRate;

/** Above this change a fetched price is flagged for a second look (wrong listing, split…). */
export const SUSPICIOUS_CHANGE = 0.3;

/** Same price as shown in the list (4 decimals, 6 below 1 €): nothing to save. */
export function samePrice(previousPrice: number | null, price: number): boolean {
  if (previousPrice === null) return false;
  const digits = Math.abs(price) < 1 ? 6 : 4;
  return previousPrice.toFixed(digits) === price.toFixed(digits);
}

export function reviewQuote(previousPrice: number | null, price: number) {
  const change = relativeChange(previousPrice, price);
  return { change, suspicious: change !== null && Math.abs(change) > SUSPICIOUS_CHANGE };
}

export interface FetchedPrice {
  assetId: number;
  date: ISODate;
  price: number;
}

export interface QuoteSavePlan {
  rows: FetchedPrice[];
  /** Price rows overwritten by the save: put back by undo. */
  replaced: PricePoint[];
  /** Prices with no row on that day before: deleted by undo. */
  created: { assetId: number; date: ISODate }[];
}

/** What to write, and what undo needs to put things back as they were. */
export function planQuoteSave(rows: FetchedPrice[], pricesByAsset: Map<number, PricePoint[]>): QuoteSavePlan {
  const replaced: PricePoint[] = [];
  const created: QuoteSavePlan['created'] = [];
  for (const row of rows) {
    const existing = pricesByAsset.get(row.assetId)?.find((p) => p.date === row.date);
    if (existing) replaced.push(existing);
    else created.push({ assetId: row.assetId, date: row.date });
  }
  return { rows, replaced, created };
}
