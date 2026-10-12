import type { PdfPage, PdfTextItem } from '../types';

// A made-up two-page statement in the exact geometry of an Axis savings statement
// as pdf.js reports it (column x-positions, right-aligned amounts, a wrapped
// narration line, and a deposit merged with its balance into one text item).
// All names, references and amounts are fictional.

const COL = { date: 24.5, details: 78.4, chq: 400.34, wdRight: 489, depRight: 531, balRight: 573 };
const charW = 5.3;

const text = (str: string, x: number, y: number, cw = charW): PdfTextItem => ({ str, x, y, w: str.length * cw });
const right = (str: string, rightEdge: number, y: number): PdfTextItem => text(str, rightEdge - str.length * charW, y);

function header(y: number): PdfTextItem[] {
  return [
    text('Date', COL.date, y),
    text('Transaction\u0000', COL.details, y),
    text('Details', 130.11, y),
    text('Chq\u0000', COL.chq, y),
    text('No.', COL.chq, y - 10.8),
    { str: 'Withdrawal', x: 438.96, y, w: 50.04 },
    { str: 'Deposits', x: 494.51, y, w: 36.49 },
    { str: 'Balance', x: 539.24, y, w: 33.76 },
  ];
}

const debit = (y: number, date: string, narration: string, amount: string, balance: string) => [
  text(`${date} ${narration}`, COL.date, y),
  right(amount, COL.wdRight, y),
  right(balance, COL.balRight, y),
];

const credit = (y: number, date: string, narration: string, amount: string, balance: string) => [
  text(`${date} ${narration}`, COL.date, y),
  right(amount, COL.depRight, y),
  right(balance, COL.balRight, y),
];

/** pdf.js sometimes emits "deposit balance" as a single item. */
const mergedCredit = (y: number, date: string, narration: string, amount: string, balance: string) => [
  text(`${date} ${narration}`, COL.date, y),
  { str: `${amount} ${balance}`, x: 493.9, y, w: 79.11 },
];

export const SYNTHETIC_PAGES: PdfPage[] = [
  {
    page: 1,
    items: [
      text('Relationship Statement for the period from: 01-09-2026 to 30-09-2026', 110.6, 760),
      text('Page 1 of 2', 532.68, 30.33),
      ...header(700),
      text('Opening Balance', 202.96, 680),
      right('5,000.00', COL.balRight, 680),
      ...debit(660, '01-09-2026', 'UPI/P2M/100000000001/SHARMA GENERAL STORE /UPI/YES BANK LIMITED YBS', '120.00', '4,880.00'),
      ...debit(640, '01-09-2026', 'UPI/P2M/100000000002/Swiggy Ltd /Pay fo/AXIS BANK', '450.50', '4,429.50'),
      ...debit(620, '02-09-2026', 'UPI/P2M/100000000003/TASTY FOODS CITY /UPI/YES BANK LIMITED', '90.00', '4,339.50'),
      text('YBS', COL.details, 609.2),
      ...mergedCredit(590, '03-09-2026', 'UPI/P2A/100000000004/ROHAN M/BARB/savings/', '2,000.00', '6,339.50'),
    ],
  },
  {
    page: 2,
    items: [
      text('Page 2 of 2', 532.68, 30.33),
      ...header(700),
      ...debit(680, '05-09-2026', 'UPI/P2M/100000000009/Myntra /Paymen/YES BANK LIMITED YBS', '1,500.00', '4,839.50'),
      ...credit(660, '07-09-2026', 'UPI/P2M/100000000009/Myntra/YESB//', '300.00', '5,139.50'),
      text('Closing Balance', 205.53, 640),
      right('5,139.50', COL.balRight, 640),
      text('Total', 416.27, 624),
      right('2,160.50', COL.wdRight, 624),
      right('2,300.00', COL.depRight, 624),
      text('To know your Tariff Plan,Click Here', 21.7, 600),
    ],
  },
];

// ── Bank of Baroda layout ────────────────────────────────────────────────────
// Sl No | Transaction Date | Value Date | Description | Cheque Number | Debit | Credit | Balance.
// Descriptions wrap *around* the dated line (fragments above and below, wrapped at a
// fixed character width), "-" fills empty amount cells, and there's no closing row.

const B = { serial: 32.55, date: 51.1, value: 100.6, desc: 148, debitR: 426, creditR: 492, balR: 571 };
const bobRow = (y: number, n: string, above: string, below: string | null, amt: [string, 'dr' | 'cr'], bal: string) => [
  // BOB's description font: ~3.5pt per character.
  text(above, B.desc, y + 4.3, 3.5),
  ...(below ? [text(below, B.desc, y - 4.2, 3.5)] : []),
  text(n, B.serial, y),
  text('01-09-2026', B.date, y),
  text('01-09-2026', B.value, y),
  amt[1] === 'dr' ? right(amt[0], B.debitR, y) : text('-', 423.67, y),
  amt[1] === 'cr' ? right(amt[0], B.creditR, y) : text('-', 489.67, y),
  right(bal, B.balR, y),
];

export const SYNTHETIC_BOB_PAGES: PdfPage[] = [
  {
    page: 1,
    items: [
      text('Account Statement from 01-09-2026 to 30-09-2026', 120, 760),
      text('Account Number', 27, 700),
      text('12345678905565', 27, 690),
      text('IFSC Code', 541, 700),
      text('BARB0TESTXX', 504, 690),
      // Header word widths as measured on a real statement.
      { str: 'Serial', x: 25.0, y: 428, w: 19.0 },
      { str: 'Transaction', x: 51.7, y: 428, w: 39.6 },
      { str: 'Value', x: 109.7, y: 428, w: 18.6 },
      { str: 'Description', x: 147.0, y: 428, w: 38.5 },
      { str: 'Cheque', x: 322.2, y: 428, w: 25.6 },
      { str: 'Debit', x: 408.5, y: 428, w: 17.5 },
      { str: 'Credit', x: 471.8, y: 428, w: 20.2 },
      { str: 'Balance', x: 544.1, y: 428, w: 26.9 },
      { str: 'No', x: 29.8, y: 419.5, w: 9.4 },
      { str: 'Date', x: 63.9, y: 419.5, w: 15.2 },
      { str: 'Date', x: 111.4, y: 419.5, w: 15.2 },
      { str: 'Number', x: 321.8, y: 419.5, w: 26.4 },
      text('1', B.serial, 400.2),
      text('01-09-2026', B.date, 400.2),
      text('Opening Balance', B.desc, 400.2),
      text('-', 423.67, 400.2),
      text('-', 489.67, 400.2),
      right('5,000.00', B.balR, 400.2),
      ...bobRow(378.2, '2', 'UPI/100000000001/10:15:00/UPI/sharma.store@okaxis/', null, ['120.00', 'dr'], '4,880.00'),
      ...bobRow(356.2, '3', 'UPI/100000000002/12:01:10/UPI/swiggy@icici/', 'Food', ['450.50', 'dr'], '4,429.50'),
      ...bobRow(334.2, '4', 'UPI/100000000003/18:20:00/UPI/rohan.m-', '9876@ybl', ['2,000.00', 'cr'], '6,429.50'),
      ...bobRow(312.2, '5', 'UPI/100000000004/09:00:00/UPI/tasty.foods@paytm/', null, ['90.00', 'dr'], '6,339.50'),
      text('Note: This is a computer-generated statement. Statement generated on 05/10/2026 10:00:00 IST', 25, 200),
      text('Page 1 of 1', 268, 40),
    ],
  },
];

// ── Axis app-export layout ───────────────────────────────────────────────────
// Tran Date | Chq No | Particulars | Debit | Credit | Balance | Init. Br. The first half
// of each description sits on the line *above* the dated row; amounts have no commas.

const A = { date: 38.54, desc: 132.14, debitR: 379.2, creditR: 441.9, balR: 530.9, br: 536.92 };
const appRow = (y: number, above: string, onLine: string, amt: [string, 'dr' | 'cr'], bal: string) => [
  // The app export's font: ~4pt per character.
  text(above, A.desc, y + 9, 4),
  text('01-09-2026', A.date, y),
  text(onLine, A.desc, y, 4),
  right(amt[0], amt[1] === 'dr' ? A.debitR : A.creditR, y),
  right(bal, A.balR, y),
  text('1234', A.br, y),
];

export const SYNTHETIC_AXIS_APP_PAGES: PdfPage[] = [
  {
    page: 1,
    items: [
      text('IFSC Code: UTIB0001234', 459, 650),
      text('Statement of Axis Account No: 924010012345432 for the period (From: 01-09-2026 To: 30-09-2026)', 85, 600),
      // Header word widths as measured on a real export.
      { str: 'Tran Date', x: 39.7, y: 566, w: 39.7 },
      { str: 'Chq No', x: 91.7, y: 566, w: 29.8 },
      { str: 'Particulars', x: 202.8, y: 566, w: 43.0 },
      { str: 'Debit', x: 339.3, y: 566, w: 21.0 },
      { str: 'Credit', x: 400.1, y: 566, w: 25.0 },
      { str: 'Balance', x: 473.1, y: 566, w: 30.5 },
      { str: 'Init.', x: 537.8, y: 566, w: 16.2 },
      { str: 'Br', x: 540.9, y: 557, w: 10.0 },
      text('OPENING BALANCE', A.desc, 554),
      right('5000.00', A.balR, 554),
      ...appRow(532, 'UPI/P2M/100000000001/SHARMA GENERAL S', 'TORE/UPI/YES BANK LIMITED YBS', ['120.00', 'dr'], '4880.00'),
      ...appRow(510, 'UPI/P2A/100000000004/ROHAN M/BARB/sa', 'vings/', ['2000.00', 'cr'], '6880.00'),
      ...appRow(488, 'XX:924010012345432:Int.Pd:01-07-2026 to 30-', '09-2026', ['12.50', 'cr'], '6892.50'),
      text('TRANSACTION TOTAL', A.desc, 466),
      right('120.00', A.debitR, 466),
      right('2012.50', A.creditR, 466),
      text('CLOSING BALANCE', A.desc, 457),
      right('6892.50', A.balR, 457),
    ],
  },
  {
    page: 2,
    items: [
      text('Unless the constituent notifies the bank immediately of any discrepancy, the statement is taken as correct.', 38, 700),
      text('W.e.f 01-01-2026 charges of 21.00 apply on ATM withdrawals beyond the free limit.', 38, 680),
      text('++++ End of Statement ++++', 235, 400),
    ],
  },
];

// ── Axis CSV export ──────────────────────────────────────────────────────────
// No opening row, and DR/CR labels swapped relative to reality (credits printed under
// "DR"). The only DR row is the first one, so its meaning has to be inferred from CR.

export const SYNTHETIC_AXIS_CSV = [
  'Name :- ROHAN MEHTA',
  'IFSC Code :- UTIB0001234',
  'Statement of Account No - 924010012345432 for the period (From : 01-09-2026  To : 30-09-2026)',
  '',
  'Tran Date,CHQNO,PARTICULARS,DR,CR,BAL,SOL',
  '01-09-2026,-,UPI/P2A/100000000004/ROHAN M/BARB/savings/,2000.00, ,7000.00,1234',
  '02-09-2026,-,UPI/P2M/100000000001/SHARMA GENERAL STORE /UPI/YES BANK LIMITED YBS, ,120.00,6880.00,1234',
  '03-09-2026,-,"NEFT/N123456/ACME, INC/HDFC", ,450.50,6429.50,1234',
  '',
  'Unless the constituent notifies the bank immediately of any discrepancy, the statement is taken as correct.',
].join('\r\n');
