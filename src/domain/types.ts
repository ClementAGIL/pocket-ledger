/** Dates are stored and compared as local calendar days: 'YYYY-MM-DD'. */
export type ISODate = string;

export type CategoryKind = 'asset' | 'liability';

/** How often a category's prices/values are expected to be updated (drives reminders). */
export type UpdateFrequency = 'monthly' | 'yearly' | 'never';

/**
 * - units: value = quantity × unit price (stocks, ETFs, crypto, metals…)
 * - balance: a single amount that you update (cash, real estate, retirement plan, loan…)
 */
export type Valuation = 'units' | 'balance';

export type TxType = 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW' | 'INCOME';

export interface Category {
  id: number;
  name: string;
  kind: CategoryKind;
  valuation: Valuation;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  /** Target share of the rebalanced assets (0–1), or null when not part of the target allocation. */
  targetWeight: number | null;
  /** Update reminders: monthly scale, yearly scale (e.g. retirement plan), or never (e.g. real estate). */
  updateReminder: UpdateFrequency;
}

export interface Account {
  id: number;
  name: string;
  institution: string | null;
  note: string | null;
  archived: boolean;
  createdAt: string;
}

export interface Asset {
  id: number;
  accountId: number;
  categoryId: number;
  name: string;
  /** Ticker, ISIN, contract number… */
  identifier: string | null;
  valuation: Valuation;
  /** Free text: why you bought it, your plan… */
  note: string | null;
  /** When to re-evaluate this investment. */
  reviewDate: ISODate | null;
  archived: boolean;
  createdAt: string;
}

/** All money values are in euros. */
export interface Transaction {
  id: number;
  assetId: number;
  type: TxType;
  date: ISODate;
  /** BUY / SELL only. */
  quantity: number | null;
  /** BUY / SELL only. */
  unitPrice: number | null;
  /** Gross amount: quantity × unitPrice for BUY/SELL, the cash amount otherwise. */
  amount: number;
  fees: number;
  note: string | null;
  /**
   * The other half of a cash transfer: a buy paid from a cash account is linked to the withdrawal
   * from that account (and a sale or dividend to the deposit). Both rows point to each other.
   */
  linkedId?: number | null;
  /** When it was saved ('YYYY-MM-DD HH:MM:SS', UTC): orders the entries of one day. */
  createdAt?: string | null;
}

/** A transaction before it is saved (no id yet). */
export type NewTransaction = Omit<Transaction, 'id' | 'linkedId' | 'createdAt'>;

/** For `units` assets: price per unit. For `balance` assets: total value. */
/** Where a price comes from: typed by the user, or fetched with Online prices. */
export type PriceSource = 'manual' | 'online';

export interface PricePoint {
  id: number;
  assetId: number;
  date: ISODate;
  price: number;
  source: PriceSource;
  /** When it was saved (UTC): orders the entries of one day. Always set by the database. */
  createdAt?: string | null;
}

export interface Snapshot {
  categories: Category[];
  accounts: Account[];
  assets: Asset[];
  transactions: Transaction[];
  prices: PricePoint[];
}
