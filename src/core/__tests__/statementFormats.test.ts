import { parseNarration } from '../narration';
import { parseStatementCsv, parseStatementPdf } from '../statement';
import { parseCsv } from '../statement/csvTable';
import { parseDate } from '../statement/dates';
import { classifyHeader } from '../statement/headers';
import { detectMeta } from '../statement/meta';
import { SYNTHETIC_AXIS_APP_PAGES, SYNTHETIC_AXIS_CSV, SYNTHETIC_BOB_PAGES } from './syntheticStatement';

// All statements here are fictional, built to the exact geometry of real exports.

const summary = (txns: { date: string; direction: string; amount: number }[]) => txns.map((t) => [t.direction, t.amount]);

describe('Bank of Baroda layout', () => {
  const r = parseStatementPdf(SYNTHETIC_BOB_PAGES);

  it('validates and finds the bank, account and period', () => {
    expect(r.issues).toEqual([]);
    expect(r.bank).toBe('BOB');
    expect(r.accountLast4).toBe('5565');
    expect([r.periodFrom, r.periodTo]).toEqual(['2026-09-01', '2026-09-30']);
    expect(r.openingBalance).toBe(500000);
    expect(r.closingBalance).toBe(633950);
  });

  it('skips the serial number, value date and "-" placeholders', () => {
    expect(summary(r.txns)).toEqual([
      ['debit', 12000],
      ['debit', 45050],
      ['credit', 200000],
      ['debit', 9000],
    ]);
  });

  it('joins description fragments printed above and below the row, without inventing spaces', () => {
    expect(r.txns[1].narration).toBe('UPI/100000000002/12:01:10/UPI/swiggy@icici/Food');
    expect(r.txns[2].narration).toBe('UPI/100000000003/18:20:00/UPI/rohan.m-9876@ybl');
  });

  it('ignores the footer even though it contains a date', () => {
    expect(r.txns.some((t) => /computer-generated/.test(t.narration))).toBe(false);
  });

  it('reads the UPI ID as the payee', () => {
    expect(parseNarration(r.txns[1].narration)).toMatchObject({ channel: 'UPI', ref: '100000000002', counterparty: 'swiggy@icici', note: 'Food' });
    expect(parseNarration(r.txns[2].narration).counterparty).toBe('rohan.m-9876@ybl');
  });
});

describe('Axis app-export layout', () => {
  const r = parseStatementPdf(SYNTHETIC_AXIS_APP_PAGES);

  it('validates against the TRANSACTION TOTAL and CLOSING BALANCE rows', () => {
    expect(r.issues).toEqual([]);
    expect(r.bank).toBe('AXIS');
    expect(r.accountLast4).toBe('5432');
    expect(r.totals).toEqual({ withdrawals: 12000, deposits: 201250 });
    expect(summary(r.txns)).toEqual([
      ['debit', 12000],
      ['credit', 200000],
      ['credit', 1250],
    ]);
  });

  it('joins the half printed above the dated row, and drops the branch code', () => {
    expect(r.txns[0].narration).toBe('UPI/P2M/100000000001/SHARMA GENERAL STORE/UPI/YES BANK LIMITED YBS');
    expect(r.txns[2].narration).toMatch(/Int\.Pd:01-07-2026 to 30-09-2026$/);
    expect(parseNarration(r.txns[2].narration).channel).toBe('INTEREST');
  });

  it('stops at the end of the table: legal text with dates and amounts is not a row', () => {
    expect(r.txns).toHaveLength(3);
  });
});

describe('Axis CSV export', () => {
  const r = parseStatementCsv(SYNTHETIC_AXIS_CSV);

  it('validates with no opening row, inferring it from the first row', () => {
    expect(r.issues).toEqual([]);
    expect(r.format).toBe('csv');
    expect(r.bank).toBe('AXIS');
    expect(r.accountLast4).toBe('5432');
    expect(r.openingBalance).toBe(500000);
  });

  it('trusts the balance over swapped DR/CR labels, even for a column it could only infer', () => {
    expect(summary(r.txns)).toEqual([
      ['credit', 200000],
      ['debit', 12000],
      ['debit', 45050],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    expect(r.txns[2].narration).toBe('NEFT/N123456/ACME, INC/HDFC');
  });
});

describe('same payments across formats', () => {
  it('give identical date, direction, amount and balance', () => {
    const pdf = parseStatementPdf(SYNTHETIC_AXIS_APP_PAGES).txns[0];
    const csv = parseStatementCsv(
      ['Tran Date,PARTICULARS,DR,CR,BAL', '01-09-2026,"UPI/P2M/100000000001/SHARMA GENERAL STORE /UPI/YES BANK LIMITED YBS",120.00,,4880.00'].join('\n'),
    ).txns[0];
    expect([csv.date, csv.amount, csv.balance]).toEqual([pdf.date, pdf.amount, pdf.balance]);
    expect(parseNarration(csv.narration).payeeKey).toBe(parseNarration(pdf.narration).payeeKey);
  });
});

describe('building blocks', () => {
  it.each([
    ['01-09-2026', '2026-09-01'],
    ['1/9/2026', '2026-09-01'],
    ['01.09.26', '2026-09-01'],
    ['01 Sep 2026', '2026-09-01'],
    ['01-Sept-2026', '2026-09-01'],
    ['2026-09-01', '2026-09-01'],
    ['99-99-9999', null],
    ['31-13-2026', null],
    ['10:15:00', null],
  ])('parseDate(%s) → %s', (s, iso) => expect(parseDate(s)).toBe(iso));

  it.each([
    ['Withdrawal', 'debit'],
    ['Withdrawal Amt.', 'debit'],
    ['DR', 'debit'],
    ['Deposits', 'credit'],
    ['CR', 'credit'],
    ['Particulars', 'description'],
    ['Transaction Details', 'description'],
    ['Narration', 'description'],
    ['Tran Date', 'date'],
    ['Transaction Date', 'date'],
    ['Value Date', 'valueDate'],
    ['Chq No.', 'chq'],
    ['Cheque Number', 'chq'],
    ['BAL', 'balance'],
    ['Closing Balance', 'balance'],
    ['Serial No', 'serial'],
  ])('classifyHeader(%s) → %s', (label, kind) => expect(classifyHeader(label)).toBe(kind));

  it('detects banks by IFSC before names that appear in descriptions', () => {
    expect(detectMeta('IFSC: BARB0ABCDEF\nUPI/…/YES BANK LIMITED').bank).toBe('BOB');
    expect(detectMeta('Axis eDGE Reward Points').bank).toBe('AXIS');
    expect(detectMeta('nothing here').bank).toBe('UNKNOWN');
  });

  it('parses quoted CSV fields', () => {
    expect(parseCsv('a,"b, c","d ""q"""\r\n1,2,3')).toEqual([
      ['a', 'b, c', 'd "q"'],
      ['1', '2', '3'],
    ]);
  });
});
