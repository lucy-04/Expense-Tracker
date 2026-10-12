const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Dates as Indian banks print them, anchored at the start of a token:
 * 01-09-2026, 01/09/2026, 01.09.2026, 01-09-26, 01 Sep 2026, 01-Sep-2026, 01-Sep-26, 2026-09-01.
 */
export const DATE_AT_START =
  /^(?:(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})|(\d{1,2})[ -]([A-Za-z]{3,4})[ -](\d{2}|\d{4})|(\d{4})-(\d{2})-(\d{2}))(?![\d])/;

/** "01-09-2026" (or any supported form) → "2026-09-01"; null if it isn't a valid date. */
export function parseDate(token: string): string | null {
  const m = DATE_AT_START.exec(token.trim());
  if (!m) return null;
  let d: number;
  let mo: number;
  let y: number;
  if (m[1]) {
    d = Number(m[1]);
    mo = Number(m[2]);
    y = Number(m[3]);
  } else if (m[4]) {
    d = Number(m[4]);
    mo = MONTHS[m[5].toLowerCase()] ?? 0;
    y = Number(m[6]);
  } else {
    y = Number(m[7]);
    mo = Number(m[8]);
    d = Number(m[9]);
  }
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Length of the date at the start of `text`, or 0. */
export function dateLengthAtStart(text: string): number {
  const m = DATE_AT_START.exec(text);
  return m && parseDate(m[0]) ? m[0].length : 0;
}
