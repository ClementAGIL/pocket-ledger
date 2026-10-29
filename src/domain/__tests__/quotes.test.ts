import { buildPortfolio } from '../portfolio';
import {
  classifyIdentifier,
  coinIdGuess,
  coinKey,
  isCoinSymbol,
  isISIN,
  normalizeCurrency,
  parseCoinGeckoPrice,
  parseCoinGeckoPrices,
  parseYahooChart,
  parseYahooHistory,
  pickCoinGeckoId,
  pickYahooSymbol,
  planQuoteSave,
  QuoteError,
  quoteCandidates,
  quoteErrorMessage,
  recentOnlineFetch,
  reviewQuote,
  samePrice,
  toEuro,
} from '../quotes';
import type { Snapshot } from '../types';

// Trimmed real answers (October 2026).
const YAHOO_GOOG = {
  chart: {
    result: [{ meta: { currency: 'USD', symbol: 'GOOG', regularMarketTime: 1791576001, gmtoffset: -14400, regularMarketPrice: 347.86 } }],
    error: null,
  },
};
const YAHOO_ISF = {
  chart: {
    result: [{ meta: { currency: 'GBp', symbol: 'ISF.L', regularMarketTime: 1791560103, gmtoffset: 3600, regularMarketPrice: 1026.6 } }],
    error: null,
  },
};
const YAHOO_NOT_FOUND = { chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } };

describe('identifiers', () => {
  it('validates ISIN check digits', () => {
    expect(isISIN('IE00B4L5Y983')).toBe(true);
    expect(isISIN('LU1681043599')).toBe(true);
    expect(isISIN('US0378331005')).toBe(true);
    expect(isISIN('US0378331006')).toBe(false);
    expect(isISIN('GOOG')).toBe(false);
  });

  it('reads tickers, ISINs and crypto', () => {
    expect(classifyIdentifier(' goog ', 'Stock')).toEqual({ kind: 'ticker', query: 'GOOG' });
    expect(classifyIdentifier('iwda.as', 'ETF')).toEqual({ kind: 'ticker', query: 'IWDA.AS' });
    expect(classifyIdentifier('ie00b4l5y983', 'ETF')).toEqual({ kind: 'isin', query: 'IE00B4L5Y983' });
    expect(classifyIdentifier('GC=F', 'Precious metals')).toEqual({ kind: 'ticker', query: 'GC=F' });
    expect(classifyIdentifier('BTC-EUR', 'Crypto')).toEqual({ kind: 'crypto', query: 'BTC' });
    expect(classifyIdentifier('bitcoin', 'Crypto')).toEqual({ kind: 'crypto', query: 'bitcoin' });
  });
});

describe('source answers', () => {
  it('parses a Yahoo chart, with the market day in its own time zone', () => {
    // 1791576001 = 2026-10-09 20:00 UTC = 16:00 in New York.
    expect(parseYahooChart(YAHOO_GOOG, '2026-10-11')).toEqual({ symbol: 'GOOG', price: 347.86, currency: 'USD', date: '2026-10-09' });
    expect(parseYahooChart(YAHOO_ISF, '2026-10-11')).toMatchObject({ currency: 'GBp', price: 1026.6, date: '2026-10-09' });
    // Never after today.
    expect(parseYahooChart(YAHOO_GOOG, '2026-10-01').date).toBe('2026-10-01');
  });

  it('reports unknown symbols and odd answers', () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as QuoteError).code;
      }
    };
    expect(code(() => parseYahooChart(YAHOO_NOT_FOUND, '2026-10-11'))).toBe('not-found');
    expect(code(() => parseYahooChart({ chart: { result: [{ meta: { regularMarketPrice: 0 } }] } }, '2026-10-11'))).toBe('not-found');
    expect(code(() => parseYahooChart('<html>', '2026-10-11'))).toBe('bad-data');
  });

  it('parses a monthly Yahoo history, one close per month', () => {
    // Paris bars: 2022-01-01 00:00 CET (winter) and 2022-07-01 00:00 CEST, read with today's +1h offset.
    const history = parseYahooHistory({
      chart: {
        result: [
          {
            meta: { symbol: 'CW8.PA', currency: 'EUR', gmtoffset: 3600 },
            timestamp: [1640991600, 1656626400, 1659304800, 1661983200, 1661990000],
            indicators: { quote: [{ close: [400, 380.5, null, 390, 391] }] },
          },
        ],
        error: null,
      },
    });
    expect(history.symbol).toBe('CW8.PA');
    expect([...history.months]).toEqual([
      ['2022-01', 400],
      ['2022-07', 380.5],
      ['2022-09', 391],
    ]);
    expect(() => parseYahooHistory({ chart: { result: null, error: { code: 'Not Found' } } })).toThrow(QuoteError);
  });

  it('reads the splits of a Yahoo history', () => {
    // GOOG: 20-for-1, first trading day 2022-07-18 (09:30 New York, -4h).
    const history = parseYahooHistory({
      chart: {
        result: [
          {
            meta: { symbol: 'GOOG', currency: 'USD', gmtoffset: -14400 },
            timestamp: [1656648000],
            indicators: { quote: [{ close: [116.3] }] },
            events: { splits: { '1658151000': { date: 1658151000, numerator: 20, denominator: 1, splitRatio: '20:1' }, bad: { date: 'x' } } },
          },
        ],
      },
    });
    expect(history.splits).toEqual([{ date: '2022-07-18', ratio: 20 }]);
    expect(parseYahooHistory({ chart: { result: [{ timestamp: [1656648000], indicators: { quote: [{ close: [1] }] } }] } }).splits).toEqual([]);
  });

  it('prefers a euro listing for an ISIN', () => {
    expect(pickYahooSymbol({ quotes: [{ exchange: 'LSE', quoteType: 'ETF', symbol: 'IWDA.L' }] })).toBe('IWDA.L');
    expect(
      pickYahooSymbol({
        quotes: [
          { exchange: 'LSE', quoteType: 'ETF', symbol: 'IWDA.L' },
          { exchange: 'AMS', quoteType: 'ETF', symbol: 'IWDA.AS' },
        ],
      }),
    ).toBe('IWDA.AS');
    expect(() => pickYahooSymbol({ quotes: [] })).toThrow(QuoteError);
  });

  it('finds the CoinGecko coin by symbol, id or name, largest first', () => {
    const search = {
      coins: [
        { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', market_cap_rank: 2 },
        { id: 'eth-fake', name: 'Fake', symbol: 'ETH', market_cap_rank: 900 },
        { id: 'tether', name: 'Tether', symbol: 'USDT', market_cap_rank: 3 },
      ],
    };
    expect(pickCoinGeckoId(search, 'ETH')).toBe('ethereum');
    expect(pickCoinGeckoId(search, 'Ethereum')).toBe('ethereum');
    expect(pickCoinGeckoId(search, 'tether')).toBe('tether');
    expect(() => pickCoinGeckoId({ coins: [] }, 'ZZZ')).toThrow(QuoteError);
    expect(parseCoinGeckoPrice({ bitcoin: { eur: 74662 } }, 'bitcoin')).toBe(74662);
    expect(() => parseCoinGeckoPrice({}, 'notacoin')).toThrow(QuoteError);
  });

  it('converts to euros, pence first', () => {
    expect(normalizeCurrency(1026.6, 'GBp')).toEqual({ price: expect.closeTo(10.266, 10), currency: 'GBP' });
    expect(normalizeCurrency(347.86, 'USD')).toEqual({ price: 347.86, currency: 'USD' });
    // EURUSD = 1.12: 347.86 $ = 310.59 €.
    expect(toEuro(347.86, 1.12)).toBeCloseTo(310.59, 2);
  });

  it('gives readable error messages', () => {
    expect(quoteErrorMessage(new QuoteError('network'))).toBe('No connection');
    expect(quoteErrorMessage(new QuoteError('no-fx', 'CHF'))).toBe('No exchange rate for CHF');
    expect(quoteErrorMessage(new Error('boom'))).toBe('Unexpected answer from the source');
  });
});

describe('candidates, review and save plan', () => {
  const data: Snapshot = {
    schedules: [],
    categories: [
      { id: 1, name: 'ETF', kind: 'asset', valuation: 'units', color: '#000', sortOrder: 0, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
      { id: 2, name: 'Cash', kind: 'asset', valuation: 'balance', color: '#000', sortOrder: 1, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
      { id: 3, name: 'Crypto', kind: 'asset', valuation: 'units', color: '#000', sortOrder: 2, isDefault: true, targetWeight: null, updateReminder: 'monthly' },
    ],
    accounts: [{ id: 1, name: 'Broker', institution: null, note: null, archived: false, createdAt: '' }],
    assets: [
      { id: 1, categoryId: 1, identifier: 'IWDA.AS', valuation: 'units' as const, archived: false },
      { id: 2, categoryId: 1, identifier: null, valuation: 'units' as const, archived: false },
      { id: 3, categoryId: 2, identifier: 'FR76 3000', valuation: 'balance' as const, archived: false },
      { id: 4, categoryId: 3, identifier: 'BTC', valuation: 'units' as const, archived: false },
      { id: 5, categoryId: 1, identifier: 'CW8.PA', valuation: 'units' as const, archived: true },
      { id: 6, categoryId: 1, identifier: 'SOLD', valuation: 'units' as const, archived: false },
    ].map((a) => ({ ...a, accountId: 1, name: `A${a.id}`, note: null, reviewDate: null, createdAt: '' })),
    transactions: [1, 2, 4, 5, 6].map((assetId, i) => ({
      id: i + 1,
      assetId,
      type: 'BUY' as const,
      date: '2026-01-02',
      quantity: 1,
      unitPrice: 100,
      amount: 100,
      fees: 0,
      note: null,
    })),
    prices: [{ id: 1, assetId: 1, date: '2026-10-09', price: 120, source: 'manual' }],
  };
  data.transactions.push({ id: 99, assetId: 6, type: 'SELL', date: '2026-02-01', quantity: 1, unitPrice: 110, amount: 110, fees: 0, note: null });
  data.transactions.push({ id: 98, assetId: 3, type: 'DEPOSIT', date: '2026-01-02', quantity: null, unitPrice: null, amount: 100, fees: 0, note: null });

  it('keeps open unit-priced investments with an identifier', () => {
    const list = quoteCandidates(buildPortfolio(data));
    expect(list.map((c) => [c.assetId, c.kind, c.query, c.previousPrice])).toEqual([
      [1, 'ticker', 'IWDA.AS', 120],
      [4, 'crypto', 'BTC', 100],
    ]);
  });

  it('marks the prices fetched online less than an hour ago', () => {
    const now = Date.parse('2026-10-11T10:30:00Z');
    const online = { ...data, prices: [{ id: 1, assetId: 1, date: '2026-10-11', price: 120, source: 'online' as const, createdAt: '2026-10-11 10:05:30' }] };
    expect(quoteCandidates(buildPortfolio(online), now).map((c) => c.fetchedMinutesAgo)).toEqual([24, null]);
    // An hour later, or without `now`: fetched again.
    expect(quoteCandidates(buildPortfolio(online), now + 36 * 60_000)[0].fetchedMinutesAgo).toBeNull();
    expect(quoteCandidates(buildPortfolio(online))[0].fetchedMinutesAgo).toBeNull();
  });

  it('only counts an online price that is still the current one', () => {
    const now = Date.parse('2026-10-11T10:30:00Z');
    const p = (source: 'online' | 'manual', createdAt: string | null) => [{ id: 1, assetId: 1, date: '2026-10-11', price: 120, source, createdAt }];
    expect(recentOnlineFetch(p('online', '2026-10-11 10:29:59'), 120, now)).toBe(0);
    expect(recentOnlineFetch(p('manual', '2026-10-11 10:29:59'), 120, now)).toBeNull();
    expect(recentOnlineFetch(p('online', null), 120, now)).toBeNull();
    // A trade after it changed the price.
    expect(recentOnlineFetch(p('online', '2026-10-11 10:29:59'), 125, now)).toBeNull();
    expect(recentOnlineFetch(undefined, null, now)).toBeNull();
  });

  it('reads a CoinGecko batch answer and tells symbols from names', () => {
    expect([...parseCoinGeckoPrices({ BTC: { eur: 74662 }, eth: { usd: 1 }, 'shiba-inu': { eur: 0.00001 }, bad: null })]).toEqual([
      ['btc', 74662],
      ['shiba-inu', 0.00001],
    ]);
    expect(['btc', 'bonk', '1inch', 'bitcoin', 'shiba inu'].map(isCoinSymbol)).toEqual([true, true, true, false, false]);
    expect(coinIdGuess(' Shiba  Inu ')).toBe('shiba-inu');
    expect(coinKey('BTC')).toBe('btc');
  });

  it('recognizes an unchanged price', () => {
    expect(samePrice(131.67, 131.67)).toBe(true);
    expect(samePrice(310.4213, 310.42131)).toBe(true);
    expect(samePrice(131.67, 131.68)).toBe(false);
    expect(samePrice(0.123456, 0.123457)).toBe(false);
    expect(samePrice(null, 10)).toBe(false);
  });

  it('flags big jumps and plans the undo', () => {
    expect(reviewQuote(100, 105)).toEqual({ change: expect.closeTo(0.05, 10), suspicious: false });
    expect(reviewQuote(100, 140).suspicious).toBe(true);
    expect(reviewQuote(null, 140)).toEqual({ change: null, suspicious: false });

    const plan = planQuoteSave(
      [
        { assetId: 1, date: '2026-10-09', price: 131.67 },
        { assetId: 4, date: '2026-10-11', price: 74662 },
      ],
      buildPortfolio(data).pricesByAsset,
    );
    expect(plan.replaced).toEqual([{ id: 1, assetId: 1, date: '2026-10-09', price: 120, source: 'manual' }]);
    expect(plan.created).toEqual([{ assetId: 4, date: '2026-10-11' }]);
  });
});
