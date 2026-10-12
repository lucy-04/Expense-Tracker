/** A text run as reported by pdf.js `getTextContent()` (PDF user-space coords: y grows upward). */
export type PdfTextItem = { str: string; x: number; y: number; w: number };
export type PdfPage = { page: number; items: PdfTextItem[] };
export type PdfDump = { pages: PdfPage[] };

/** Money is always integer paise to avoid float drift. */
export type Paise = number;

export type Direction = 'debit' | 'credit';

export type TxnType = 'expense' | 'income' | 'transfer' | 'investment' | 'refund';

export type Channel = 'UPI' | 'CARD' | 'ATM' | 'NEFT' | 'IMPS' | 'RTGS' | 'INTEREST' | 'OTHER';

export type UpiKind = 'P2M' | 'P2A' | 'REFUND';

export type Narration = {
  channel: Channel;
  upiKind?: UpiKind;
  /** Bank/UPI reference number; shared between a payment and its refund. */
  ref?: string;
  /** Human-readable payee/payer as printed, trimmed. */
  counterparty: string;
  /** Normalized key used for payee rules and grouping. */
  payeeKey: string;
  note?: string;
  bank?: string;
};

/** One row of a bank statement, before classification. */
export type RawTxn = {
  /** ISO yyyy-mm-dd */
  date: string;
  narration: string;
  chqNo?: string;
  amount: Paise;
  direction: Direction;
  balance: Paise;
};

/** Short bank code ("AXIS", "BOB", …) or "UNKNOWN" when the statement doesn't say. */
export type BankCode = string;

export type StatementParse = {
  bank: BankCode;
  /** Last 4 digits of the account number, when the statement prints it. */
  accountLast4?: string;
  accountKind: 'savings';
  /** Which reader produced it, for support and debugging. */
  format: 'pdf' | 'csv';
  periodFrom?: string;
  periodTo?: string;
  openingBalance?: Paise;
  closingBalance?: Paise;
  totals?: { withdrawals: Paise; deposits: Paise };
  txns: RawTxn[];
  /** Anything that failed validation. Import must be blocked when non-empty. */
  issues: string[];
};
