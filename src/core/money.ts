import type { Paise } from './types';

/** Matches Indian/Western grouped amounts with exactly two decimals: 42.50, 2,345.67, 1,00,000.00 */
export const AMOUNT_RE = /^-?\d{1,3}(?:,\d{2,3})*\.\d{2}$|^-?\d+\.\d{2}$/;

export function isAmount(token: string): boolean {
  return AMOUNT_RE.test(token);
}

/** "2,345.67" → 234567. Returns null for anything that isn't a 2-decimal amount. */
export function parseAmount(token: string): Paise | null {
  const t = token.trim();
  if (!isAmount(t)) return null;
  const negative = t.startsWith('-');
  const [whole, frac] = t.replace(/^-/, '').replace(/,/g, '').split('.');
  const paise = Number(whole) * 100 + Number(frac);
  return negative ? -paise : paise;
}

/** 234567 → "₹2,345.67" using Indian digit grouping (12,34,567.89). */
export function formatPaise(paise: Paise, opts: { symbol?: boolean; decimals?: boolean } = {}): string {
  const { symbol = true, decimals = true } = opts;
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const digits = String(rupees);
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = rest ? `${rest},${last3}` : last3;
  const body = decimals ? `${grouped}.${frac}` : grouped;
  return `${negative ? '-' : ''}${symbol ? '₹' : ''}${body}`;
}
