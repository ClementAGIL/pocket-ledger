import {
  normalizeCurrency,
  parseCoinGeckoPrice,
  parseYahooChart,
  pickCoinGeckoId,
  pickYahooSymbol,
  QuoteError,
  quoteErrorMessage,
  toEuro,
  type QuoteCandidate,
} from '@/domain/quotes';
import type { ISODate } from '@/domain/types';

/*
 * The only network code of the app. Runs only when the user presses "Fetch prices online" with
 * Settings › Online prices on. Sends identifiers (tickers, ISINs, coin names), never amounts.
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
    const search = await getJson(ctx, `${YAHOO}/v1/finance/search?q=${encodeURIComponent(c.query)}&quotesCount=10&newsCount=0`);
    return yahooQuote(ctx, pickYahooSymbol(search));
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
