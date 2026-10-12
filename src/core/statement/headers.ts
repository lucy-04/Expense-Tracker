/** What a statement column holds, whatever the bank calls it. */
export type ColumnKind =
  | 'date'
  | 'valueDate'
  | 'description'
  | 'chq'
  | 'debit'
  | 'credit'
  | 'amount'
  | 'drcr'
  | 'balance'
  | 'serial'
  | 'other';

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\u0000/g, ' ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Order matters: the first pattern that matches a column's label wins.
const RULES: [ColumnKind, RegExp][] = [
  ['valueDate', /^value (date|dt)$/],
  ['date', /^((tran|txn|transaction|trans|post|posting|book)( date| dt)?|date)$/],
  ['description', /\b(particulars|description|narration|details|remarks|transaction details)\b/],
  ['chq', /\b(chq|cheque|check|ref|reference|instrument)\b/],
  ['debit', /^(withdrawal|withdrawals|debit|debits|dr|withdrawal amt|debit amount|withdrawal amount|paid out)( amt| amount| inr| rs)?$/],
  ['credit', /^(deposit|deposits|credit|credits|cr|deposit amt|credit amount|deposit amount|paid in)( amt| amount| inr| rs)?$/],
  ['drcr', /^(dr cr|cr dr|type|txn type|dr or cr)$/],
  ['balance', /\b(balance|bal|closing balance|available balance)\b/],
  ['amount', /^(amount|amt|transaction amount|txn amount)( inr| rs)?$/],
  ['serial', /^(s ?no|sl ?no|sr ?no|serial( no)?|no)$/],
];

export function classifyHeader(label: string): ColumnKind {
  const t = norm(label);
  if (!t) return 'other';
  for (const [kind, re] of RULES) if (re.test(t)) return kind;
  return 'other';
}

/** A header row has a date column, a balance column and some way to read amounts. */
export function looksLikeHeader(kinds: ColumnKind[]): boolean {
  const has = (k: ColumnKind) => kinds.includes(k);
  return has('date') && has('balance') && (has('debit') || has('credit') || has('amount'));
}
