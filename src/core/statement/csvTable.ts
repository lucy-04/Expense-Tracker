import type { Direction, Paise } from '../types';
import { parseDate } from './dates';
import { classifyHeader, looksLikeHeader, type ColumnKind } from './headers';
import type { AmountColumn, TableExtract, TableRow } from './resolve';

/** RFC-4180-ish CSV: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Spreadsheet amounts: "1,234.50", "1234.5", "500", "₹ 1,234.50 Cr". Returns paise, or null when blank/not a number. */
export function parseLooseAmount(cell: string): { value: Paise; marker?: Direction } | null {
  const t = cell.replace(/[₹,\s]|INR|Rs\.?/gi, '');
  const m = /^(-?\d+(?:\.\d{1,2})?)(cr|dr)?$/i.exec(t);
  if (!m) return null;
  const value = Math.round(Math.abs(Number(m[1])) * 100);
  const marker = m[2] ? (m[2].toLowerCase() === 'cr' ? 'credit' : 'debit') : undefined;
  return { value, marker };
}

const OPENING = /opening balance|balance b\/?f|brought forward/i;

/** Reads a bank's CSV export. Columns are found by header meaning, not position. */
export function readCsvTable(text: string): TableExtract {
  const grid = parseCsv(text);
  const extract: TableExtract = { format: 'csv', rows: [], metaText: '' };
  const meta: string[] = [];

  const headerIdx = grid.findIndex((cells) => looksLikeHeader(cells.map(classifyHeader)));
  if (headerIdx < 0) {
    extract.metaText = text;
    return extract;
  }
  const kinds = grid[headerIdx].map(classifyHeader);
  const col = (k: ColumnKind) => kinds.indexOf(k);
  const iDate = col('date');
  const iDesc = col('description');
  const iBal = col('balance');
  const iChq = col('chq');
  const iMarker = col('drcr');
  const money: [number, AmountColumn][] = [
    [col('debit'), 'debit'],
    [col('credit'), 'credit'],
    [col('amount'), 'amount'],
  ];

  grid.slice(0, headerIdx).forEach((r) => meta.push(r.join(' ')));
  for (const cells of grid.slice(headerIdx + 1)) {
    const cell = (i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');
    const desc = cell(iDesc);
    const date = parseDate(cell(iDate));
    const balance = parseLooseAmount(cell(iBal));
    if (OPENING.test(desc) && balance) {
      extract.openingBalance = balance.value;
      continue;
    }
    if (!date || !balance) {
      meta.push(cells.join(' '));
      continue;
    }
    const amounts: TableRow['amounts'] = [];
    let marker: Direction | undefined;
    for (const [i, kind] of money) {
      const a = i >= 0 ? parseLooseAmount(cell(i)) : null;
      if (a && a.value > 0) {
        amounts.push({ value: a.value, column: kind });
        marker ??= a.marker;
      }
    }
    const m = cell(iMarker).toLowerCase();
    if (m.startsWith('cr')) marker = 'credit';
    else if (m.startsWith('dr')) marker = 'debit';
    const chq = cell(iChq);
    extract.rows.push({
      date,
      description: desc,
      amounts,
      balance: balance.value,
      marker,
      ...(/^\d+$/.test(chq) ? { chqNo: chq } : {}),
    });
  }
  extract.metaText = meta.join('\n');
  return extract;
}
