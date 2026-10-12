import type { Direction, Paise, StatementParse } from '../types';
import { detectMeta } from './meta';

/** Which money column an amount was printed under, if any. */
export type AmountColumn = 'debit' | 'credit' | 'amount' | null;

/** One statement row as read from any format, before direction is decided. */
export type TableRow = {
  date: string;
  description: string;
  /** Transaction amount(s); the running balance is kept separately. */
  amounts: { value: Paise; column: AmountColumn }[];
  balance: Paise;
  /** An explicit "Dr"/"Cr" marker printed next to the amount, if the bank uses one. */
  marker?: Direction;
  chqNo?: string;
};

/** Everything a format reader (PDF, CSV, …) extracts from one statement. */
export type TableExtract = {
  format: StatementParse['format'];
  rows: TableRow[];
  openingBalance?: Paise;
  closingBalance?: Paise;
  totals?: { withdrawals: Paise; deposits: Paise };
  /** Text outside the transaction table (account details, headers, footers): where bank and period are found. */
  metaText: string;
};

/**
 * Turns extracted rows into transactions and validates them, the same way for every bank.
 *
 * Direction comes from the running balance: balance − previous balance = ±amount.
 * That's trusted over column labels, which some exports get wrong (one Axis CSV
 * prints credits under "DR"). Rows the chain can't prove (the first row when there's
 * no opening balance) use the column→direction mapping learned from the rows it did prove.
 */
export function resolveStatement(t: TableExtract): StatementParse {
  const meta = detectMeta(t.metaText);
  const result: StatementParse = {
    bank: meta.bank,
    accountLast4: meta.accountLast4,
    accountKind: 'savings',
    format: t.format,
    periodFrom: meta.periodFrom,
    periodTo: meta.periodTo,
    openingBalance: t.openingBalance,
    closingBalance: t.closingBalance,
    totals: t.totals,
    txns: [],
    issues: [],
  };
  if (t.rows.length === 0) {
    result.issues.push("No transactions found. This statement's layout isn't one the app can read yet.");
    return result;
  }

  // Pass 1: decide what the balance chain can prove, and learn what each column means.
  const decided: (Direction | null)[] = [];
  const learned: Record<string, { debit: number; credit: number }> = {};
  t.rows.forEach((row, i) => {
    const prev = i === 0 ? t.openingBalance : t.rows[i - 1].balance;
    const amt = row.amounts.length === 1 ? row.amounts[0] : null;
    let dir: Direction | null = null;
    if (amt && prev !== undefined) {
      const delta = row.balance - prev;
      if (delta === -amt.value) dir = 'debit';
      else if (delta === amt.value) dir = 'credit';
    }
    decided.push(dir);
    if (dir && amt?.column) {
      const l = (learned[amt.column] ??= { debit: 0, credit: 0 });
      l[dir] += 1;
    }
  });

  // Pass 2: fill in the rest, then build transactions.
  t.rows.forEach((row, i) => {
    const label = `${row.date} “${row.description.slice(0, 40)}”`;
    if (row.amounts.length !== 1) {
      result.issues.push(`${label}: expected one amount and a balance, found ${row.amounts.length} amount(s).`);
      return;
    }
    const amt = row.amounts[0];
    let dir = decided[i];
    if (!dir) {
      const l = amt.column ? learned[amt.column] : undefined;
      // If only the other column was proven, and it means the opposite of its label,
      // the labels are swapped: flip this one too.
      const other = amt.column === 'debit' ? learned.credit : amt.column === 'credit' ? learned.debit : undefined;
      const swapped = other && (amt.column === 'debit' ? other.debit > other.credit : other.credit > other.debit);
      if (row.marker) dir = row.marker;
      else if (l && l.debit !== l.credit) dir = l.debit > l.credit ? 'debit' : 'credit';
      else if (swapped) dir = amt.column === 'debit' ? 'credit' : 'debit';
      else if (amt.column === 'debit' || amt.column === 'credit') dir = amt.column;
      const prev = i === 0 ? t.openingBalance : t.rows[i - 1].balance;
      // A row the chain could have checked but didn't match is a real problem.
      if (prev !== undefined) {
        result.issues.push(`${label}: the balance moved by ${(row.balance - prev) / 100} but the amount is ${amt.value / 100}.`);
      }
      if (!dir) {
        result.issues.push(`${label}: couldn't tell whether money came in or went out.`);
        return;
      }
    }
    result.txns.push({
      date: row.date,
      narration: row.description.replace(/\s+/g, ' ').trim(),
      ...(row.chqNo ? { chqNo: row.chqNo } : {}),
      amount: amt.value,
      direction: dir,
      balance: row.balance,
    });
  });

  validate(result);
  return result;
}

function validate(r: StatementParse) {
  if (r.txns.length === 0) return;
  const first = r.txns[0];
  const last = r.txns[r.txns.length - 1];
  // No opening line printed: it's implied by the first row.
  if (r.openingBalance === undefined) {
    r.openingBalance = first.balance + (first.direction === 'debit' ? first.amount : -first.amount);
  }
  const debits = r.txns.filter((t) => t.direction === 'debit').reduce((a, t) => a + t.amount, 0);
  const credits = r.txns.filter((t) => t.direction === 'credit').reduce((a, t) => a + t.amount, 0);
  if (r.closingBalance !== undefined && r.closingBalance !== last.balance) {
    r.issues.push(`The last row's balance is ${last.balance / 100}, but the statement's closing balance is ${r.closingBalance / 100}.`);
  }
  if (r.closingBalance === undefined) r.closingBalance = last.balance;
  const expected = r.openingBalance + credits - debits;
  if (expected !== r.closingBalance) {
    r.issues.push(`Opening + deposits − withdrawals = ${expected / 100}, but the closing balance is ${r.closingBalance / 100}.`);
  }
  if (r.totals) {
    if (r.totals.withdrawals !== debits) {
      r.issues.push(`Withdrawals add up to ${debits / 100}, but the statement's total says ${r.totals.withdrawals / 100}.`);
    }
    if (r.totals.deposits !== credits) {
      r.issues.push(`Deposits add up to ${credits / 100}, but the statement's total says ${r.totals.deposits / 100}.`);
    }
  }
}
