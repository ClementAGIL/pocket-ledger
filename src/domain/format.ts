import { fromISODate } from './dates';
import type { ISODate } from './types';

const MASK = '•••••';

const euro = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});
const euroRounded = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const percent = new Intl.NumberFormat(undefined, {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatEuro(value: number, opts: { hidden?: boolean; signed?: boolean; rounded?: boolean } = {}) {
  if (opts.hidden) return `${MASK} €`;
  const fmt = opts.rounded ? euroRounded : euro;
  const text = fmt.format(opts.signed ? Math.abs(value) : value);
  if (!opts.signed) return text;
  return `${value < 0 ? '−' : '+'}${text}`;
}

/** `ratio` is a fraction: 0.182 → "+18.2%". */
export function formatPercent(ratio: number | null, opts: { signed?: boolean } = {}) {
  if (ratio === null || !Number.isFinite(ratio)) return '—';
  const text = percent.format(opts.signed ? Math.abs(ratio) : ratio);
  if (!opts.signed) return text;
  return `${ratio < 0 ? '−' : '+'}${text}`;
}

/** Short amount for chart labels: 850 €, 12k €, 1.2M €. */
export function formatCompactEuro(value: number, hidden = false) {
  if (hidden) return '••• €';
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M €`;
  if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3)}k €`;
  return `${sign}${Math.round(abs)} €`;
}

/** Quantities and unit prices: keep the precision crypto needs, trim trailing zeros. */
export function formatNumber(value: number, maxDigits = 8) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: maxDigits }).format(value);
}

export function formatDate(date: ISODate) {
  return fromISODate(date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** A whole number of months in words: "8 months", "1 year", "2 years 3 months", "less than a month". */
export function formatDuration(months: number) {
  const n = Math.max(0, Math.round(months));
  const y = Math.floor(n / 12);
  const m = n % 12;
  const parts = [y > 0 && `${y} year${y > 1 ? 's' : ''}`, m > 0 && `${m} month${m > 1 ? 's' : ''}`].filter(Boolean);
  return parts.join(' ') || 'less than a month';
}

/** Accepts "1 234,56", "1234.56", "1,5"… Returns null when not a finite number. */
export function parseNumber(input: string): number | null {
  const cleaned = input.replace(/[\s  €]/g, '').replace(',', '.');
  if (cleaned === '' || !/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
