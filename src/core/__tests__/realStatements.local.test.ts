import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseStatementCsv, parseStatementPdf } from '../statement';
import type { PdfPage, StatementParse } from '../types';

// Local-only checks against real statements. Every input here is gitignored
// (src/core/__tests__/fixtures/, bankStatements/, masked/), so on a fresh clone
// these suites skip. Assertions are structural on purpose: no names, amounts or
// account numbers are written into this file or printed.

const root = join(__dirname, '..', '..', '..');
const fixture = (name: string) => join(__dirname, 'fixtures', name);
const firstMatching = (dir: string, re: RegExp) =>
  existsSync(dir) ? readdirSync(dir).find((f) => re.test(f)) : undefined;

function expectValid(r: StatementParse) {
  expect(r.issues).toEqual([]);
  expect(r.txns.length).toBeGreaterThan(0);
  expect(r.openingBalance).toBeDefined();
  expect(r.closingBalance).toBeDefined();
  for (const t of r.txns) {
    expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(t.amount).toBeGreaterThan(0);
    expect(t.narration.length).toBeGreaterThan(0);
  }
}

const describeIf = (cond: boolean) => (cond ? describe : describe.skip);

describeIf(existsSync(fixture('axis-2026-09.json')))('Axis emailed PDF', () => {
  it('parses and balances', () => {
    const r = parseStatementPdf(JSON.parse(readFileSync(fixture('axis-2026-09.json'), 'utf8')).pages);
    expectValid(r);
    expect(r.bank).toBe('AXIS');
    expect(r.totals).toBeDefined();
  });
});

describeIf(existsSync(fixture('axis-app-export.json')))('Axis app-export PDF', () => {
  it('parses and balances, joining descriptions printed above their row', () => {
    const r = parseStatementPdf(JSON.parse(readFileSync(fixture('axis-app-export.json'), 'utf8')).pages);
    expectValid(r);
    expect(r.bank).toBe('AXIS');
    expect(r.accountLast4).toMatch(/^\d{4}$/);
    expect(r.periodFrom).toBeDefined();
    // Every UPI row should carry its full reference path, i.e. both halves were joined.
    for (const t of r.txns.filter((x) => x.narration.startsWith('UPI/'))) expect(t.narration).toMatch(/^UPI\/P2[AM]\/\d{12}\//);
  });
});

const csvName = firstMatching(join(root, 'bankStatements'), /\.csv$/i);
describeIf(!!csvName)('Axis CSV export', () => {
  it('parses and balances, even with no opening row and swapped DR/CR labels', () => {
    const r = parseStatementCsv(readFileSync(join(root, 'bankStatements', csvName!), 'utf8'));
    expectValid(r);
    expect(r.bank).toBe('AXIS');
    expect(r.format).toBe('csv');
  });
});

describeIf(existsSync(fixture('axis-app-export.json')) && !!csvName)('Same month, two formats', () => {
  it('finds the same rows in the app-export PDF and the CSV', () => {
    const pdf = parseStatementPdf(JSON.parse(readFileSync(fixture('axis-app-export.json'), 'utf8')).pages);
    const csv = parseStatementCsv(readFileSync(join(root, 'bankStatements', csvName!), 'utf8'));
    const key = (t: StatementParse['txns'][number]) => `${t.date}|${t.direction}|${t.amount}|${t.balance}`;
    const inPdf = new Set(pdf.txns.map(key));
    const overlap = csv.txns.filter((t) => inPdf.has(key(t))).length;
    // The exports were taken on different days, so one may hold a few more rows.
    expect(overlap).toBeGreaterThanOrEqual(Math.min(pdf.txns.length, csv.txns.length));
  });
});

describeIf(existsSync(fixture('bob.json')))('Bank of Baroda emailed PDF', () => {
  it('parses and balances', () => {
    const r = parseStatementPdf(JSON.parse(readFileSync(fixture('bob.json'), 'utf8')).pages);
    expectValid(r);
    expect(r.bank).toBe('BOB');
  });
});

// The masked BOB layout (digits → 9) can't balance, but it proves the table is found
// and every description fragment lands on a row.
const maskedBob = firstMatching(join(root, 'masked'), /7565.*\.masked\.json$/);
describeIf(!!maskedBob)('Bank of Baroda layout (masked)', () => {
  it('finds the table, rows and their descriptions', () => {
    const pages = JSON.parse(readFileSync(join(root, 'masked', maskedBob!), 'utf8')).pages as PdfPage[];
    // Masking turns dates into "99-99-9999"; put back a valid placeholder of the same shape.
    for (const p of pages) for (const it of p.items) it.str = it.str.replace(/\b99([-/.])99\1(9999|99)\b/g, (_m, sep, y) => `01${sep}01${sep}${y.length === 4 ? '2000' : '00'}`);
    const r = parseStatementPdf(pages);
    expect(r.bank).toBe('BOB');
    // Amounts are all 9s, so the chain can't balance; every row should still be found…
    expect(r.txns.length).toBeGreaterThan(20);
    // …each with a description assembled from the fragments above and below it.
    for (const t of r.txns) expect(t.narration).toMatch(/^UPI\/\d{12}\/|[A-Za-z]/);
    expect(r.openingBalance).toBeDefined();
  });
});
