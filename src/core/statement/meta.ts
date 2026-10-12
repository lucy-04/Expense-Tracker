import { DATE_AT_START, parseDate } from './dates';

/** IFSC prefixes → short bank code. The IFSC is the most reliable way to tell banks apart. */
const IFSC_BANKS: Record<string, string> = {
  UTIB: 'AXIS',
  BARB: 'BOB',
  HDFC: 'HDFC',
  SBIN: 'SBI',
  ICIC: 'ICICI',
  KKBK: 'KOTAK',
  YESB: 'YES',
  IDFB: 'IDFC',
  INDB: 'INDUSIND',
  FDRL: 'FEDERAL',
  PUNB: 'PNB',
  CNRB: 'CANARA',
  UBIN: 'UNION',
  BKID: 'BOI',
  IOBA: 'IOB',
  CBIN: 'CENTRAL',
  RATN: 'RBL',
  AUBL: 'AU',
};

/** Fallback when there's no IFSC: names as printed in headers and footers. */
const NAME_BANKS: [RegExp, string][] = [
  [/\baxis bank\b|axis\s*e?dge|axis\.bank|\baxis account\b/i, 'AXIS'],
  [/bank of baroda|\bbob\b|bankofbaroda/i, 'BOB'],
  [/hdfc bank/i, 'HDFC'],
  [/state bank of india|\bsbi\b/i, 'SBI'],
  [/icici bank/i, 'ICICI'],
  [/kotak/i, 'KOTAK'],
  [/idfc first/i, 'IDFC'],
];

const DATE_SRC = DATE_AT_START.source.replace(/^\^/, '');

export type StatementMeta = { bank: string; accountLast4?: string; periodFrom?: string; periodTo?: string };

/** Reads bank, account and period from the text outside the transaction table. */
export function detectMeta(text: string): StatementMeta {
  const ifsc = /\b([A-Z]{4})0[A-Z0-9]{6}\b/.exec(text);
  const bank = (ifsc && IFSC_BANKS[ifsc[1]]) ?? NAME_BANKS.find(([re]) => re.test(text))?.[1] ?? 'UNKNOWN';

  // "Account No: 9240…", "A/c No. XXXXXX5432", or a label with its value on the next line
  // ("Account Number   IFSC Code\n12345678905565  BARB0…"): the first 10+ character
  // account-number-like run within a short distance after an account label.
  let accountLast4: string | undefined;
  for (const m of text.matchAll(/(?:account|a\/c|acct)\b/gi)) {
    const run = /[X*\d]{6,}\d{4}\b/.exec(text.slice(m.index, m.index + 90));
    if (run) {
      accountLast4 = run[0].slice(-4);
      break;
    }
  }

  // "from: 01-09-2026 to 30-09-2026", "period (From : … To : …)", "Statement from … to …"
  const period = new RegExp(`from\\s*:?\\s*(${DATE_SRC})\\s*to\\s*:?\\s*(${DATE_SRC})`, 'i').exec(text);
  let periodFrom: string | undefined;
  let periodTo: string | undefined;
  if (period) {
    const dates = text.slice(period.index, period.index + period[0].length).match(new RegExp(DATE_SRC, 'g')) ?? [];
    periodFrom = parseDate(dates[0] ?? '') ?? undefined;
    periodTo = parseDate(dates[1] ?? '') ?? undefined;
  }
  return { bank, accountLast4, periodFrom, periodTo };
}
