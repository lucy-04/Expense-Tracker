import type { PdfPage, PdfTextItem } from './types';

export type Line = {
  page: number;
  y: number;
  /** Items sorted left→right. */
  items: PdfTextItem[];
  /** Items joined with single spaces, whitespace-normalized. */
  text: string;
};

/** pdf.js emits NUL in place of some spaces; collapse all whitespace runs. */
export function cleanText(s: string): string {
  return s.replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Groups text items into visual lines (items whose baselines are within
 * `tolerance` points), in reading order: page ascending, top→bottom, left→right.
 */
export function groupLines(pages: PdfPage[], tolerance = 2): Line[] {
  const out: Line[] = [];
  for (const { page, items } of [...pages].sort((a, b) => a.page - b.page)) {
    const sorted = items
      .map((it) => ({ ...it, str: cleanText(it.str) }))
      .filter((it) => it.str !== '')
      .sort((a, b) => b.y - a.y || a.x - b.x);

    let current: PdfTextItem[] = [];
    let currentY = Number.NaN;
    const flush = () => {
      if (current.length === 0) return;
      current.sort((a, b) => a.x - b.x);
      out.push({ page, y: currentY, items: current, text: current.map((i) => i.str).join(' ') });
      current = [];
    };
    for (const it of sorted) {
      if (current.length > 0 && Math.abs(it.y - currentY) > tolerance) flush();
      if (current.length === 0) currentY = it.y;
      current.push(it);
    }
    flush();
  }
  return out;
}
