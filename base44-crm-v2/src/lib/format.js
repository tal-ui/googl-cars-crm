/**
 * Formatting helpers — the ONE place currency/date/number formatting lives.
 * Replaces 25+ ad-hoc `₪${x.toLocaleString()}` / `.toFixed(0|2)` sites with
 * inconsistent rounding (audit I-128). RTL-safe: numbers render in an LTR island.
 */

const CURRENCY_SYMBOL = { ILS: '₪', USD: '$', EUR: '€' };

/**
 * Format money. Whole-shekel by default (Israeli convention); pass fractionDigits
 * for cents. Returns e.g. "₪ 125,000". Nullish → em dash.
 */
export function formatCurrency(amount, currency = 'ILS', fractionDigits = 0) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const sym = CURRENCY_SYMBOL[currency] || currency;
  const n = Number(amount).toLocaleString('he-IL', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${sym} ${n}`;
}

/** Parse a possibly-formatted numeric string ("125,000" / "₪ 12.5") → number. */
export function parseAmount(input) {
  if (typeof input === 'number') return input;
  if (input == null) return null;
  const cleaned = String(input).replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

/** ISO date → he-IL short date. Nullish → em dash. */
export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** ISO datetime → he-IL date + time. */
export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('he-IL', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** Days until (positive) / since (negative) a date, integer. */
export function daysUntil(value, now = new Date()) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}
