import type { ISODate, PricePoint, Transaction, Valuation } from './types';

/** State of one asset after replaying its events up to some date. Money is in euros. */
export interface PositionState {
  /** Units held (always 0 for `balance` assets). */
  quantity: number;
  /** Last known unit price (`units` assets only). */
  price: number | null;
  /** Current value. For liabilities: the remaining debt, as a positive number. */
  value: number;
  /** Cost basis of what is still held. */
  invested: number;
  /** Gains locked in by sells / withdrawals, net of fees. */
  realized: number;
  /** Dividends, interest… */
  income: number;
  /** Date of the last event taken into account. */
  lastDate: ISODate | null;
  /**
   * Last date the value was actually known: price update or trade for `units` assets, any
   * valuation or cash movement for `balance` assets. Dividends don't count. Drives update reminders.
   */
  priceDate: ISODate | null;
}

export interface Position extends PositionState {
  avgCost: number | null;
  unrealized: number;
  unrealizedPct: number | null;
}

const EPSILON = 1e-9;

type Event =
  | { date: ISODate; order: 0; id: number; at: string; tx: Transaction }
  | { date: ISODate; order: 1; id: number; at: string; price: number };

/** Sorts after any save time: a price without one (test fixtures only; the database always sets it) counts as end of day. */
const END_OF_DAY = '~';

/**
 * An INCOME whose fees exceed its amount: a charge on the account (exchange connection fee,
 * negative interest). Counted like any income, net of fees, so it lowers the value and the gain.
 */
export const isCharge = (tx: Transaction) => tx.type === 'INCOME' && tx.fees > tx.amount;

/**
 * Save time of an entry not saved yet (form previews): after everything already saved, as it will
 * be once saved.
 */
export const NOT_SAVED_YET = '9999-12-31 23:59:59';

/** Position of an entry in its day: its save time (operations without one come first). */
export const timeOfTransaction = (tx: Transaction) => tx.createdAt ?? '';
export const timeOfPrice = (p: PricePoint) => p.createdAt ?? END_OF_DAY;

/**
 * The one order of entries, shared by the calculations and the investment history: by date, then
 * by the time they were saved (a price update entered after a buy on the same day comes after it,
 * and the other way round). Ties (same second): operations, then prices, then by id.
 */
export function compareEntries(
  a: { date: ISODate; at: string; order: 0 | 1; id: number },
  b: { date: ISODate; at: string; order: 0 | 1; id: number },
) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  return a.order - b.order || a.id - b.id;
}

export const emptyState = (): PositionState => ({
  quantity: 0,
  price: null,
  value: 0,
  invested: 0,
  realized: 0,
  income: 0,
  lastDate: null,
  priceDate: null,
});

/**
 * Events are applied by date, then in the order they were saved (`compareEntries`): the latest
 * entry of a day sets the price (a buy after a price update, or a price update after a buy).
 */
function sortedEvents(txs: Transaction[], prices: PricePoint[]): Event[] {
  const events: Event[] = [
    ...txs.map((tx) => ({ date: tx.date, order: 0 as const, id: tx.id, at: timeOfTransaction(tx), tx })),
    ...prices.map((p) => ({ date: p.date, order: 1 as const, id: p.id, at: timeOfPrice(p), price: p.price })),
  ];
  return events.sort(compareEntries);
}

function applyUnits(s: PositionState, e: Event) {
  if (e.order === 1) {
    s.price = e.price;
    s.priceDate = e.date;
    return;
  }
  const { tx } = e;
  if (tx.type === 'BUY' || tx.type === 'SELL') s.priceDate = e.date;
  switch (tx.type) {
    case 'BUY': {
      s.quantity += tx.quantity ?? 0;
      s.invested += tx.amount + tx.fees;
      if (tx.unitPrice !== null) s.price = tx.unitPrice;
      break;
    }
    case 'SELL': {
      const q = Math.min(tx.quantity ?? 0, s.quantity);
      const unitPrice = tx.unitPrice ?? 0;
      const costOut = s.quantity > 0 ? (s.invested / s.quantity) * q : 0;
      s.realized += q * unitPrice - tx.fees - costOut;
      s.invested -= costOut;
      s.quantity -= q;
      if (s.quantity < EPSILON) {
        s.quantity = 0;
        s.invested = 0;
      }
      s.price = unitPrice;
      break;
    }
    case 'INCOME':
      s.income += tx.amount - tx.fees;
      break;
    default:
      // DEPOSIT / WITHDRAW don't apply to unit-based assets.
      break;
  }
}

function applyBalance(s: PositionState, e: Event) {
  s.priceDate = e.date;
  if (e.order === 1) {
    s.value = e.price;
    return;
  }
  const { tx } = e;
  switch (tx.type) {
    case 'DEPOSIT':
      s.value += tx.amount - tx.fees;
      s.invested += tx.amount;
      break;
    case 'WITHDRAW': {
      // The withdrawn share of the balance takes the same share of the cost basis with it.
      const ratio = s.value > EPSILON ? Math.min(tx.amount / s.value, 1) : 1;
      const costOut = s.invested * ratio;
      s.realized += tx.amount - tx.fees - costOut;
      s.invested -= costOut;
      s.value = Math.max(s.value - tx.amount, 0);
      break;
    }
    case 'INCOME':
      s.value += tx.amount - tx.fees;
      s.income += tx.amount - tx.fees;
      break;
    default:
      // BUY / SELL don't apply to balance assets.
      break;
  }
}

/**
 * Replays an asset's history and returns its state at the end of every date that has events,
 * in chronological order. The last item is the current state.
 */
export function replay(valuation: Valuation, txs: Transaction[], prices: PricePoint[]) {
  const apply = valuation === 'units' ? applyUnits : applyBalance;
  const s = emptyState();
  const steps: PositionState[] = [];

  for (const e of sortedEvents(txs, prices)) {
    apply(s, e);
    if (valuation === 'units') s.value = s.quantity * (s.price ?? 0);
    const snapshot = { ...s, lastDate: e.date };
    if (steps.length && steps[steps.length - 1].lastDate === e.date) steps[steps.length - 1] = snapshot;
    else steps.push(snapshot);
  }
  return steps;
}

export function toPosition(state: PositionState): Position {
  const unrealized = state.value - state.invested;
  return {
    ...state,
    avgCost: state.quantity > EPSILON ? state.invested / state.quantity : null,
    unrealized,
    unrealizedPct: state.invested > EPSILON ? unrealized / state.invested : null,
  };
}

export function computePosition(valuation: Valuation, txs: Transaction[], prices: PricePoint[]): Position {
  const steps = replay(valuation, txs, prices);
  return toPosition(steps[steps.length - 1] ?? emptyState());
}
