import type { QuoteCandidate } from '@/domain/quotes';

import { runQuotes, type QuoteState } from '../fetchQuotes';

const chart = (symbol: string, price: number, currency: string) => ({
  chart: { result: [{ meta: { symbol, currency, regularMarketPrice: price, regularMarketTime: 1791576001, gmtoffset: -14400 } }], error: null },
});

/** A fake `fetch` answering from a table of URL fragments; records the URLs asked. */
function fakeFetch(routes: [string, number, unknown][]) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes.find(([fragment]) => url.includes(fragment));
    if (!route) throw new TypeError('Network request failed');
    const [, status, body] = route;
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    } as Response;
  }) as typeof fetch;
  return { impl, calls };
}

const candidate = (assetId: number, kind: QuoteCandidate['kind'], query: string): QuoteCandidate => ({
  assetId,
  name: `A${assetId}`,
  identifier: query,
  kind,
  query,
  previousPrice: 100,
  previousDate: '2026-09-01',
});

async function run(candidates: QuoteCandidate[], routes: [string, number, unknown][], signal?: AbortSignal) {
  const { impl, calls } = fakeFetch(routes);
  const states = new Map<number, QuoteState>();
  await runQuotes(candidates, { today: '2026-10-11', fetch: impl, signal, onUpdate: (id, s) => states.set(id, s) });
  return { states, calls };
}

describe('runQuotes', () => {
  it('converts foreign quotes, fetching each exchange rate once', async () => {
    const { states, calls } = await run(
      [candidate(1, 'ticker', 'GOOG'), candidate(2, 'ticker', 'MSFT'), candidate(3, 'ticker', 'ISF.L')],
      [
        ['chart/GOOG', 200, chart('GOOG', 347.86, 'USD')],
        ['chart/MSFT', 200, chart('MSFT', 448, 'USD')],
        ['chart/ISF.L', 200, chart('ISF.L', 1026.6, 'GBp')],
        ['chart/EURUSD%3DX', 200, chart('EURUSD=X', 1.12, 'USD')],
        ['chart/EURGBP%3DX', 200, chart('EURGBP=X', 0.84, 'GBP')],
      ],
    );
    expect(states.get(1)).toMatchObject({ status: 'found', sourcePrice: 347.86, sourceCurrency: 'USD', date: '2026-10-09' });
    expect((states.get(1) as { price: number }).price).toBeCloseTo(310.59, 2);
    expect((states.get(3) as { price: number }).price).toBeCloseTo(12.221, 3);
    expect(calls.filter((u) => u.includes('EURUSD')).length).toBe(1);
  });

  it('resolves ISINs and crypto, falling back to Yahoo for crypto', async () => {
    const { states } = await run(
      [candidate(1, 'isin', 'IE00B4L5Y983'), candidate(2, 'crypto', 'BTC'), candidate(3, 'crypto', 'NEWCOIN')],
      [
        ['search?q=IE00B4L5Y983', 200, { quotes: [{ exchange: 'AMS', quoteType: 'ETF', symbol: 'IWDA.AS' }] }],
        ['chart/IWDA.AS', 200, chart('IWDA.AS', 131.67, 'EUR')],
        ['search?query=BTC', 200, { coins: [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', market_cap_rank: 1 }] }],
        ['simple/price?ids=bitcoin', 200, { bitcoin: { eur: 74662 } }],
        ['search?query=NEWCOIN', 200, { coins: [] }],
        ['chart/NEWCOIN-EUR', 200, chart('NEWCOIN-EUR', 0.5, 'EUR')],
      ],
    );
    expect(states.get(1)).toMatchObject({ status: 'found', symbol: 'IWDA.AS', price: 131.67 });
    expect(states.get(2)).toMatchObject({ status: 'found', symbol: 'bitcoin', price: 74662, date: '2026-10-11' });
    expect(states.get(3)).toMatchObject({ status: 'found', symbol: 'NEWCOIN-EUR', price: 0.5 });
  });

  it('maps failures to messages', async () => {
    const { states } = await run(
      [candidate(1, 'ticker', 'NOPE'), candidate(2, 'ticker', 'BUSY'), candidate(3, 'ticker', 'OFFLINE'), candidate(4, 'ticker', 'CHFX')],
      [
        ['chart/NOPE', 404, { chart: { result: null, error: { code: 'Not Found' } } }],
        ['chart/BUSY', 429, 'Too Many Requests'],
        ['chart/CHFX', 200, chart('CHFX', 10, 'CHF')],
        ['chart/EURCHF', 404, { chart: { result: null, error: { code: 'Not Found' } } }],
      ],
    );
    expect(states.get(1)).toEqual({ status: 'failed', error: expect.stringContaining('Not found') });
    expect(states.get(2)).toEqual({ status: 'failed', error: 'Too many requests: try again in a minute' });
    expect(states.get(3)).toEqual({ status: 'failed', error: 'No connection' });
    expect(states.get(4)).toEqual({ status: 'failed', error: 'No exchange rate for CHF' });
  });

  it('does nothing more once cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const { states, calls } = await run([candidate(1, 'ticker', 'GOOG')], [['chart/GOOG', 200, chart('GOOG', 1, 'EUR')]], controller.signal);
    expect(calls).toEqual([]);
    expect(states.size).toBe(0);
  });
});
