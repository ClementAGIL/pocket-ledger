import {
  isISIN,
  normalizeCurrency,
  parseCoinGeckoPrice,
  parseYahooChart,
  parseYahooHistory,
  pickCoinGeckoId,
  pickYahooSymbol,
  rankYahooSymbols,
  QuoteError,
  quoteErrorMessage,
  toEuro,
  type QuoteCandidate,
  type RawHistory,
} from '@/domain/quotes';
import type { ISODate } from '@/domain/types';

/*
 * The only network code of the app. Runs only when the user presses "Fetch prices online" with
 * Settings › Online prices on. Sends identifiers (tickers, ISINs, coin names), never amounts.
 * `fetchMonthlyHistory` is used by the statement import script (scripts/import), on the computer.
 */

const YAHOO = 'https://query1.finance.yahoo.com';
const COINGECKO = 'https://api.coingecko.com/api/v3';
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 3;

export interface FetchedQuote {
  /** Symbol or coin id actually quoted (IE00B4L5Y983 → IWDA.L, BTC → bitcoin). */
  symbol: string;
  /** As quoted by the source, before conversion. */
  sourcePrice: number;
  sourceCurrency: string;
  /** Euros per unit. */
  price: number;
  /** Market day of the price (shown; the price is saved at today's date). */
  date: ISODate;
}

export type QuoteState =
  | { status: 'pending' }
  | { status: 'fetching' }
  | ({ status: 'found' } & FetchedQuote)
  | { status: 'failed'; error: string };

interface Context {
  fetch: typeof fetch;
  today: ISODate;
  signal?: AbortSignal;
  /** EUR → currency rate, fetched once per currency per run. */
  fx: Map<string, Promise<number>>;
}

async function getJson(ctx: Context, url: string): Promise<unknown> {
  if (ctx.signal?.aborted) throw new QuoteError('cancelled');
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const onCancel = () => controller.abort();
  ctx.signal?.addEventListener('abort', onCancel);
  try {
    let res: Response;
    try {
      res = await ctx.fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    } catch {
      throw new QuoteError(ctx.signal?.aborted ? 'cancelled' : timedOut ? 'timeout' : 'network');
    }
    if (res.status === 429) throw new QuoteError('rate-limited');
    // Yahoo answers an unknown symbol with a 404 and a JSON error.
    if (!res.ok && res.status !== 404) throw new QuoteError('bad-data', `HTTP ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new QuoteError(res.status === 404 ? 'not-found' : 'bad-data');
    }
  } finally {
    clearTimeout(timer);
    ctx.signal?.removeEventListener('abort', onCancel);
  }
}

const yahooChart = async (ctx: Context, symbol: string) =>
  parseYahooChart(await getJson(ctx, `${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`), ctx.today);

/** What 1 EUR costs in `currency`. */
function eurRate(ctx: Context, currency: string): Promise<number> {
  if (currency === 'EUR') return Promise.resolve(1);
  let rate = ctx.fx.get(currency);
  if (!rate) {
    rate = yahooChart(ctx, `EUR${currency}=X`).then(
      (q) => q.price,
      (e: unknown) => {
        ctx.fx.delete(currency);
        throw e instanceof QuoteError && e.code !== 'not-found' ? e : new QuoteError('no-fx', currency);
      },
    );
    ctx.fx.set(currency, rate);
  }
  return rate;
}

async function yahooQuote(ctx: Context, symbol: string): Promise<FetchedQuote> {
  const raw = await yahooChart(ctx, symbol);
  const major = normalizeCurrency(raw.price, raw.currency);
  const rate = await eurRate(ctx, major.currency);
  return { symbol: raw.symbol || symbol, sourcePrice: raw.price, sourceCurrency: raw.currency, price: toEuro(major.price, rate), date: raw.date };
}

async function coinGeckoQuote(ctx: Context, query: string): Promise<FetchedQuote> {
  const id = pickCoinGeckoId(await getJson(ctx, `${COINGECKO}/search?query=${encodeURIComponent(query)}`), query);
  const price = parseCoinGeckoPrice(
    await getJson(ctx, `${COINGECKO}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=eur`),
    id,
  );
  return { symbol: id, sourcePrice: price, sourceCurrency: 'EUR', price, date: ctx.today };
}

const yahooSearch = (ctx: Context, isin: string) =>
  getJson(ctx, `${YAHOO}/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=10&newsCount=0`);

async function fetchQuote(ctx: Context, c: QuoteCandidate): Promise<FetchedQuote> {
  if (c.kind === 'crypto') {
    try {
      return await coinGeckoQuote(ctx, c.query);
    } catch (e) {
      if (e instanceof QuoteError && e.code === 'cancelled') throw e;
      // Fallback: Yahoo's crypto pairs (BTC-EUR). Report CoinGecko's error if that fails too.
      return yahooQuote(ctx, `${c.query.toUpperCase()}-EUR`).catch(() => {
        throw e;
      });
    }
  }
  if (c.kind === 'isin') {
    return yahooQuote(ctx, pickYahooSymbol(await yahooSearch(ctx, c.query)));
  }
  return yahooQuote(ctx, c.query);
}

/**
 * Fetches every candidate, a few at a time, reporting each state change. Cancelling stops new
 * requests and aborts the running ones; candidates not started stay `pending`.
 */
export async function runQuotes(
  candidates: QuoteCandidate[],
  opts: { today: ISODate; onUpdate: (assetId: number, state: QuoteState) => void; signal?: AbortSignal; fetch?: typeof fetch },
): Promise<void> {
  const ctx: Context = { fetch: opts.fetch ?? fetch, today: opts.today, signal: opts.signal, fx: new Map() };
  let next = 0;
  const worker = async () => {
    while (next < candidates.length && !opts.signal?.aborted) {
      const c = candidates[next++];
      opts.onUpdate(c.assetId, { status: 'fetching' });
      try {
        opts.onUpdate(c.assetId, { status: 'found', ...(await fetchQuote(ctx, c)) });
      } catch (e) {
        opts.onUpdate(c.assetId, { status: 'failed', error: quoteErrorMessage(e) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker));
}

export interface MonthlyHistory {
  symbol: string;
  currency: string;
  /** Euros per unit at the close of each month ('YYYY-MM'). */
  months: Map<string, number>;
  /** Stock splits on that listing (see `RawHistory`). */
  splits: RawHistory['splits'];
}

// Fixed bounds (all of the history): range=max would switch to quarterly bars for old stocks.
const yahooHistory = async (ctx: Context, symbol: string) =>
  parseYahooHistory(await getJson(ctx, `${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?period1=0&period2=9999999999&interval=1mo&events=split`));

const firstMonth = (months: Map<string, number>) => [...months.keys()].sort()[0];

/**
 * Monthly closes of a Yahoo ticker or ISIN, in euros: a foreign month is converted at that month's
 * EUR{CUR}=X close and left out when the rate is missing. For an ISIN, the euro listings are tried
 * first, then the others, until one goes back to `from` ('YYYY-MM'; else the longest is kept).
 * Asks for the whole history, so only identifiers are sent: never dates, quantities or amounts.
 */
export async function fetchMonthlyHistory(
  identifier: string,
  opts: { from?: string; fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<MonthlyHistory> {
  const ctx: Context = { fetch: opts.fetch ?? fetch, today: '9999-12-31', signal: opts.signal, fx: new Map() };
  const id = identifier.trim();
  const symbols = isISIN(id) ? rankYahooSymbols(await yahooSearch(ctx, id)) : [id];
  let best: (Awaited<ReturnType<typeof yahooHistory>> & { symbol: string }) | null = null;
  let lastError: unknown = new QuoteError('not-found');
  for (const symbol of symbols) {
    try {
      const raw = await yahooHistory(ctx, symbol);
      if (!best || firstMonth(raw.months) < firstMonth(best.months)) best = { ...raw, symbol: raw.symbol || symbol };
      if (!opts.from || firstMonth(raw.months) <= opts.from) break;
    } catch (e) {
      if (e instanceof QuoteError && e.code === 'cancelled') throw e;
      lastError = e;
    }
  }
  if (!best) throw lastError;

  const major = normalizeCurrency(1, best.currency);
  let rates: Map<string, number> | null = null;
  if (major.currency !== 'EUR') {
    rates = (
      await yahooHistory(ctx, `EUR${major.currency}=X`).catch((e: unknown) => {
        throw e instanceof QuoteError && e.code !== 'not-found' ? e : new QuoteError('no-fx', major.currency);
      })
    ).months;
  }
  const months = new Map<string, number>();
  for (const [month, close] of best.months) {
    const rate = rates ? rates.get(month) : 1;
    if (rate) months.set(month, toEuro(close * major.price, rate));
  }
  return { symbol: best.symbol, currency: best.currency, months, splits: best.splits };
}
