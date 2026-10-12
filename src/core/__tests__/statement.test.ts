import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseStatementPdf } from '../statement';
import type { PdfDump, PdfPage, StatementParse } from '../types';
import { SYNTHETIC_PAGES } from './syntheticStatement';

const clone = (pages: PdfPage[]): PdfPage[] => JSON.parse(JSON.stringify(pages));

describe('parseStatementPdf — synthetic statement', () => {
  const result = parseStatementPdf(SYNTHETIC_PAGES);

  it('validates cleanly', () => {
    expect(result.issues).toEqual([]);
  });

  it('reads the period, balances and Total row', () => {
    expect(result.periodFrom).toBe('2026-09-01');
    expect(result.periodTo).toBe('2026-09-30');
    expect(result.openingBalance).toBe(500000);
    expect(result.closingBalance).toBe(513950);
    expect(result.totals).toEqual({ withdrawals: 216050, deposits: 230000 });
  });

  it('finds every row across both pages', () => {
    expect(result.txns.map((t) => [t.date, t.direction, t.amount])).toEqual([
      ['2026-09-01', 'debit', 12000],
      ['2026-09-01', 'debit', 45050],
      ['2026-09-02', 'debit', 9000],
      ['2026-09-03', 'credit', 200000],
      ['2026-09-05', 'debit', 150000],
      ['2026-09-07', 'credit', 30000],
    ]);
  });

  it('joins wrapped narration lines', () => {
    expect(result.txns[2].narration).toBe('UPI/P2M/100000000003/TASTY FOODS CITY /UPI/YES BANK LIMITED YBS');
  });

  it('detects a credit even when pdf.js merges amount and balance', () => {
    expect(result.txns[3]).toMatchObject({ direction: 'credit', amount: 200000, balance: 633950 });
  });

  it('ignores page footers and the header "No." line', () => {
    expect(result.txns.some((t) => /Page|No\./.test(t.narration))).toBe(false);
  });

  it('reports a broken balance chain instead of silently importing', () => {
    const pages = clone(SYNTHETIC_PAGES);
    pages[0].items.find((i) => i.str === '4,880.00')!.str = '4,870.00';
    expect(parseStatementPdf(pages).issues.length).toBeGreaterThan(0);
  });

  it('reports a Total row that disagrees with the rows', () => {
    const pages = clone(SYNTHETIC_PAGES);
    pages[1].items.find((i) => i.str === '2,160.50')!.str = '2,160.00';
    expect(parseStatementPdf(pages).issues.join('\n')).toMatch(/Withdrawals add up to/);
  });

  it('flags an unrecognized document', () => {
    const r = parseStatementPdf([{ page: 1, items: [{ str: 'Hello world', x: 10, y: 10, w: 50 }] }]);
    expect(r.txns).toEqual([]);
    expect(r.issues[0]).toMatch(/No transactions found/);
  });
});

// Optional check against your own real statement. The fixture holds real bank data and
// is gitignored, so this block only runs on a machine that has it. Assertions are
// structural on purpose: no real names or amounts live in this file. Regenerate with:
//   node scripts/dump-pdf-items.mjs "bankStatements/<file>.pdf" src/core/__tests__/fixtures/axis-2026-09.json
const fixturePath = join(__dirname, 'fixtures', 'axis-2026-09.json');
const describeIfFixture = existsSync(fixturePath) ? describe : describe.skip;

describeIfFixture('parseStatementPdf — real statement fixture (local only)', () => {
  let result: StatementParse;
  beforeAll(() => {
    const dump: PdfDump = JSON.parse(readFileSync(fixturePath, 'utf8'));
    result = parseStatementPdf(dump.pages);
  });

  it('validates cleanly: balances chain and totals match the Total row', () => {
    expect(result.issues).toEqual([]);
    expect(result.txns.length).toBeGreaterThan(0);
    expect(result.totals).toBeDefined();
  });

  it('leaves no wrapped "…LIMITED" + "YBS" line unjoined', () => {
    for (const t of result.txns) expect(t.narration).not.toMatch(/YES BANK LIMITED$/);
  });
});
