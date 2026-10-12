import { isAmount, parseAmount } from '../money';
import { cleanText, groupLines, type Line } from '../pdfLines';
import type { Direction, PdfPage } from '../types';
import { parseDate } from './dates';
import { classifyHeader, looksLikeHeader, type ColumnKind } from './headers';
import type { AmountColumn, TableExtract, TableRow } from './resolve';

type Cell = { kind: ColumnKind; label: string; x0: number; x1: number };
type Tok = { s: string; x0: number; x1: number };

const OPENING = /opening balance|balance b\/?f|brought forward/i;
const CLOSING = /closing balance|balance c\/?f|carried forward/i;
const TOTAL = /\b(transaction )?totals?\b/i;
const MONEY: ColumnKind[] = ['debit', 'credit', 'amount', 'balance'];

/**
 * Reads the transaction table of any bank's PDF statement from pdf.js text items.
 *
 * Nothing here assumes one bank's column positions:
 *  - the header row is found by what its labels mean (headers.ts), on each page;
 *  - each token is classified by what it *is* (a date, a 2-decimal amount, a "-"
 *    placeholder, a plain number, or text), and the right-most amount on a row is
 *    its running balance;
 *  - description fragments printed on their own lines (above, below, or both sides
 *    of the dated line, depending on the bank) join the nearest dated row.
 */
export function readPdfTable(pages: PdfPage[]): TableExtract {
  const lines = groupLines(pages);
  const meta: string[] = [];
  const rows: (TableRow & { page: number; y: number; frags: { y: number; text: string }[] })[] = [];
  const orphans: { page: number; y: number; x0: number; text: string }[] = [];
  const descStarts: number[] = [];
  const extract: TableExtract = { format: 'pdf', rows: [], metaText: '' };

  // Find every header up front (one pass). A page without its own header reuses the
  // previous page's columns; lines above a page's header are page chrome, not rows.
  const headers = new Map<number, { cells: Cell[]; usedNext: boolean }>();
  const headerPages = new Set<number>();
  lines.forEach((l, i) => {
    const h = readHeader(l, lines[i + 1]);
    if (h) {
      headers.set(i, h);
      headerPages.add(l.page);
    }
  });

  let cells: Cell[] | null = null;
  let inTable = false;
  let closingSeen = false;
  let totalsSeen = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const header = headers.get(i);
    if (header) {
      cells = header.cells;
      inTable = true;
      if (header.usedNext) i += 1;
      continue;
    }
    const prevPage = i > 0 ? lines[i - 1].page : line.page;
    if (line.page !== prevPage) inTable = !!cells && !headerPages.has(line.page);
    const ended = (closingSeen && totalsSeen) || /end of statement/i.test(line.text);
    if (ended) closingSeen = totalsSeen = true;
    // Outside the table: account details, period, footers, legal text.
    if (!cells || !inTable || ended) {
      meta.push(line.text);
      continue;
    }

    const parsed = classifyLine(line, cells);
    const text = parsed.desc.map((d) => d.s).join(' ');

    if (OPENING.test(text) && parsed.amounts.length > 0) {
      extract.openingBalance = parsed.amounts[parsed.amounts.length - 1].value;
      continue;
    }
    if (CLOSING.test(text) && parsed.amounts.length > 0) {
      extract.closingBalance = parsed.amounts[parsed.amounts.length - 1].value;
      closingSeen = true;
      continue;
    }
    if (!parsed.date && TOTAL.test(text) && parsed.amounts.length > 0) {
      extract.totals = readTotals(parsed.amounts);
      totalsSeen = true;
      continue;
    }
    if (parsed.date && parsed.amounts.length >= 1) {
      const balance = parsed.amounts[parsed.amounts.length - 1];
      const row = {
        date: parsed.date,
        description: '',
        amounts: parsed.amounts.slice(0, -1).map((a) => ({ value: a.value, column: a.column })),
        balance: balance.value,
        marker: parsed.amounts.slice(0, -1).find((a) => a.marker)?.marker,
        chqNo: parsed.chq,
        page: line.page,
        y: line.y,
        frags: text ? [{ y: line.y, text }] : [],
      };
      if (parsed.desc[0]) descStarts.push(parsed.desc[0].x0);
      rows.push(row);
      continue;
    }
    if (!parsed.date && parsed.amounts.length === 0 && text) {
      orphans.push({ page: line.page, y: line.y, x0: parsed.desc[0].x0, text });
      continue;
    }
    meta.push(line.text);
  }

  attachOrphans(rows, orphans, descStarts, meta);
  extract.rows = rows.map(({ page: _p, y: _y, frags: _f, ...r }) => r);
  extract.metaText = meta.join('\n');
  return extract;
}

// ── Header ───────────────────────────────────────────────────────────────────

/** A header is one line, or two when labels wrap ("Chq" over "No."), whose labels name the money columns. */
function readHeader(line: Line, next: Line | undefined): { cells: Cell[]; usedNext: boolean } | null {
  const first = mergeBoxes(line.items.map((it) => ({ label: cleanText(it.str), x0: it.x, x1: it.x + it.w })));
  const plain = (l: Line | undefined) =>
    !!l && l.page === line.page && Math.abs(line.y - l.y) < 16 && l.items.every((it) => !isAmount(it.str.trim()) && !parseDate(it.str));
  const candidates: { boxes: Box[]; usedNext: boolean }[] = [{ boxes: first, usedNext: false }];
  if (plain(next)) {
    const stacked = first.map((b) => ({ ...b }));
    for (const it of next!.items) {
      const x0 = it.x;
      const x1 = it.x + it.w;
      const over = stacked.find((b) => x0 < b.x1 + 2 && x1 > b.x0 - 2);
      if (over) {
        over.label = `${over.label} ${cleanText(it.str)}`;
        over.x0 = Math.min(over.x0, x0);
        over.x1 = Math.max(over.x1, x1);
      } else stacked.push({ label: cleanText(it.str), x0, x1 });
    }
    candidates.unshift({ boxes: stacked.sort((a, b) => a.x0 - b.x0), usedNext: true });
  }
  for (const c of candidates) {
    const cells = c.boxes.map((b) => ({ ...b, kind: classifyHeader(b.label) }));
    if (looksLikeHeader(cells.map((x) => x.kind))) return { cells, usedNext: c.usedNext };
  }
  return null;
}

type Box = { label: string; x0: number; x1: number };

/** Words of one label ("Transaction" + "Details") overlap or nearly touch; columns don't. */
function mergeBoxes(boxes: Box[]): Box[] {
  const out: Box[] = [];
  for (const b of [...boxes].sort((a, c) => a.x0 - c.x0)) {
    const last = out[out.length - 1];
    if (last && b.x0 - last.x1 <= 2) {
      last.label = `${last.label} ${b.label}`;
      last.x1 = Math.max(last.x1, b.x1);
    } else out.push({ ...b });
  }
  return out;
}

// ── Lines ────────────────────────────────────────────────────────────────────

type Money = { value: number; column: AmountColumn; marker?: Direction; x1: number };

function classifyLine(line: Line, cells: Cell[]) {
  const money = cells.filter((c) => MONEY.includes(c.kind));
  const zone = Math.min(...money.map((c) => c.x0)) - 12;
  const dateCell = cells.find((c) => c.kind === 'date');
  const chqCell = cells.find((c) => c.kind === 'chq');

  let date: string | undefined;
  let dateX = -Infinity;
  const amounts: Money[] = [];
  const desc: Tok[] = [];
  let chq: string | undefined;

  for (const tok of tokensOf(line)) {
    const center = (tok.x0 + tok.x1) / 2;
    const iso = parseDate(tok.s);
    if (iso && !date && (!dateCell || (center > dateCell.x0 - 40 && center < dateCell.x1 + 40))) {
      date = iso;
      dateX = tok.x0;
      continue;
    }
    if (iso && date) continue; // value date
    if (tok.x1 > zone) {
      if (isAmount(tok.s)) {
        amounts.push({ value: parseAmount(tok.s)!, column: nearestMoneyColumn(tok, money), x1: tok.x1 });
        continue;
      }
      if (/^(cr|dr)\.?$/i.test(tok.s) && amounts.length) {
        amounts[amounts.length - 1].marker = tok.s.toLowerCase().startsWith('c') ? 'credit' : 'debit';
        continue;
      }
      // Words can sit at the edge of the money columns ("Total"); keep them as text.
      // "-" placeholders, branch codes and other numbers there are dropped.
      if (!/[A-Za-z]/.test(tok.s)) continue;
    }
    if (/^\d+$/.test(tok.s)) {
      if (chqCell && center > chqCell.x0 - 15 && center < chqCell.x1 + 15) {
        chq = tok.s;
        continue;
      }
      if (tok.x0 < dateX || (!date && dateCell && tok.x1 < dateCell.x0)) continue; // serial number
    }
    if (tok.s === '-' || tok.s === '–') continue;
    desc.push(tok);
  }
  amounts.sort((a, b) => a.x1 - b.x1);
  return { date, amounts, desc, chq };
}

/** Amounts are right-aligned under their header, so compare centres. */
function nearestMoneyColumn(tok: Tok, money: Cell[]): AmountColumn {
  const c = (tok.x0 + tok.x1) / 2;
  let best: Cell | undefined;
  for (const m of money) {
    if (m.kind === 'balance') continue;
    if (!best || Math.abs(c - (m.x0 + m.x1) / 2) < Math.abs(c - (best.x0 + best.x1) / 2)) best = m;
  }
  return best ? (best.kind as AmountColumn) : null;
}

/** "1,600.00 2,509.48" or "01-09-2026 UPI/…" arrive as one item; split into tokens with estimated positions. */
function tokensOf(line: Line): Tok[] {
  const out: Tok[] = [];
  for (const it of line.items) {
    const s = cleanText(it.str);
    if (!s) continue;
    const charW = it.w / Math.max(1, it.str.length);
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      out.push({ s: m[0], x0: it.x + m.index * charW, x1: it.x + (m.index + m[0].length) * charW });
    }
  }
  return out;
}

function readTotals(amounts: Money[]) {
  const by = (col: AmountColumn) => amounts.filter((a) => a.column === col).reduce((s, a) => s + a.value, 0);
  if (amounts.length >= 2 && (by('debit') || by('credit'))) return { withdrawals: by('debit'), deposits: by('credit') };
  if (amounts.length >= 2) return { withdrawals: amounts[0].value, deposits: amounts[1].value };
  return undefined;
}

// ── Wrapped descriptions ─────────────────────────────────────────────────────

/**
 * Each undated text line joins the dated row nearest to it on the same page, if it's
 * close (within ~¾ of the row spacing) and starts in the description column. Banks
 * that put fragments *above* the dated line wrap at a fixed character width (join
 * without spaces); the rest wrap at words (join with a space).
 */
function attachOrphans(
  rows: { page: number; y: number; frags: { y: number; text: string }[]; description: string }[],
  orphans: { page: number; y: number; x0: number; text: string }[],
  descStarts: number[],
  meta: string[],
) {
  // Where descriptions start, judged from real rows when there are any: stray text
  // (legal notes, footers) must never move it.
  const starts = (descStarts.length ? descStarts : orphans.map((o) => o.x0)).sort((a, b) => a - b);
  const descX = starts.length ? starts[Math.floor(starts.length / 2)] : 0;
  let above = 0;
  for (const o of orphans) {
    const onPage = rows.filter((r) => r.page === o.page);
    const pitch = medianGap(onPage.map((r) => r.y)) || 20;
    let best: (typeof rows)[number] | undefined;
    for (const r of onPage) if (!best || Math.abs(r.y - o.y) < Math.abs(best.y - o.y)) best = r;
    if (best && Math.abs(best.y - o.y) <= pitch * 0.8 && Math.abs(o.x0 - descX) <= 40) {
      best.frags.push({ y: o.y, text: o.text });
      if (o.y > best.y + 1) above += 1;
    } else meta.push(o.text);
  }
  const joiner = above > 0 ? '' : ' ';
  for (const r of rows) {
    r.description = r.frags
      .sort((a, b) => b.y - a.y)
      .map((f) => f.text)
      .join(joiner);
  }
}

function medianGap(ys: number[]): number {
  const gaps: number[] = [];
  const sorted = [...ys].sort((a, b) => b - a);
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i - 1] - sorted[i]);
  gaps.sort((a, b) => a - b);
  return gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
}
