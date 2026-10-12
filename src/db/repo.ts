import type { SQLiteDatabase } from 'expo-sqlite';

import { classify, type ClassifyContext, type PayeeRule } from '@/core/classify';
import { CUSTOM_CATEGORY_EMOJI } from '@/core/categories';
import { normalizeWords } from '@/core/narration';
import type { ClassifiedTxn, PriorDebit } from '@/core/pipeline';
import type { StatTxn } from '@/core/stats';
import { pairOwnTransfers } from '@/core/transfers';
import type { Channel, Direction, Narration, StatementParse, TxnType, UpiKind } from '@/core/types';

import { notifyChanged } from './changes';

export type Category = { id: string; name: string; sort: number; emoji: string };

export type Txn = StatTxn & {
  narration: string;
  balance: number | null;
  channel: Channel;
  upiKind: UpiKind | null;
  ref: string | null;
  note: string | null;
  bank: string | null;
  linkedTxnId: string | null;
  classifyReason: string | null;
  userEdited: boolean;
  source: 'statement' | 'sms';
};

type TxnRow = {
  id: string;
  date: string;
  direction: Direction;
  amount_paise: number;
  balance_paise: number | null;
  narration: string;
  channel: Channel;
  upi_kind: UpiKind | null;
  ref: string | null;
  counterparty: string;
  payee_key: string;
  note: string | null;
  bank: string | null;
  type: TxnType;
  category_id: string | null;
  linked_txn_id: string | null;
  linked_payee_key: string | null;
  classify_reason: string | null;
  user_edited: number;
  source: 'statement' | 'sms';
};

const TXN_SELECT = `
  SELECT t.*, l.payee_key AS linked_payee_key
  FROM transactions t LEFT JOIN transactions l ON l.id = t.linked_txn_id`;

function toTxn(r: TxnRow): Txn {
  return {
    id: r.id,
    date: r.date,
    direction: r.direction,
    amount: r.amount_paise,
    balance: r.balance_paise,
    narration: r.narration,
    channel: r.channel,
    upiKind: r.upi_kind,
    ref: r.ref,
    counterparty: r.counterparty,
    payeeKey: r.payee_key,
    note: r.note,
    bank: r.bank,
    type: r.type,
    categoryId: r.category_id,
    linkedTxnId: r.linked_txn_id,
    linkedPayeeKey: r.linked_payee_key,
    classifyReason: r.classify_reason,
    userEdited: r.user_edited === 1,
    source: r.source,
  };
}

function toNarration(t: Txn): Narration {
  return {
    channel: t.channel,
    upiKind: t.upiKind ?? undefined,
    ref: t.ref ?? undefined,
    counterparty: t.counterparty,
    payeeKey: t.payeeKey,
    note: t.note ?? undefined,
    bank: t.bank ?? undefined,
  };
}

// ── settings ────────────────────────────────────────────────────────────────

export async function getMyNames(db: SQLiteDatabase): Promise<string[]> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'my_names'");
  return row ? (JSON.parse(row.value) as string[]) : [];
}

export async function setMyNames(db: SQLiteDatabase, names: string[]) {
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('my_names', ?)", JSON.stringify(clean));
  await reclassify(db);
}

export async function getClassifyContext(db: SQLiteDatabase): Promise<ClassifyContext> {
  const rules = await db.getAllAsync<{ payee_key: string; category_id: string | null; type: TxnType | null }>(
    'SELECT payee_key, category_id, type FROM payee_rules',
  );
  const payeeRules = new Map<string, PayeeRule>(
    rules.map((r) => [r.payee_key, { payeeKey: r.payee_key, categoryId: r.category_id, ...(r.type ? { type: r.type } : {}) }]),
  );
  return { myNames: await getMyNames(db), payeeRules };
}

// ── categories ──────────────────────────────────────────────────────────────

export function listCategories(db: SQLiteDatabase) {
  return db.getAllAsync<Category>('SELECT id, name, sort, emoji FROM categories ORDER BY sort, name');
}

export async function addCategory(db: SQLiteDatabase, name: string, emoji: string = CUSTOM_CATEGORY_EMOJI): Promise<string> {
  const base = normalizeWords(name).toLowerCase().replace(/ /g, '-') || 'category';
  let id = base;
  for (let i = 2; await db.getFirstAsync('SELECT 1 FROM categories WHERE id = ?', id); i++) id = `${base}-${i}`;
  const max = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort) AS m FROM categories');
  await db.runAsync('INSERT INTO categories (id, name, sort, emoji) VALUES (?, ?, ?, ?)', id, name.trim(), (max?.m ?? 0) + 1, emoji);
  notifyChanged();
  return id;
}

export async function renameCategory(db: SQLiteDatabase, id: string, name: string, emoji?: string) {
  await db.runAsync('UPDATE categories SET name = ?, emoji = COALESCE(?, emoji) WHERE id = ?', name.trim(), emoji ?? null, id);
  notifyChanged();
}

/** Transactions and payee rules in this category fall back to Uncategorized. */
export async function deleteCategory(db: SQLiteDatabase, id: string) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE transactions SET category_id = NULL WHERE category_id = ?', id);
    await txn.runAsync('UPDATE payee_rules SET category_id = NULL WHERE category_id = ?', id);
    await txn.runAsync('DELETE FROM categories WHERE id = ?', id);
  });
  notifyChanged();
}

// ── import ──────────────────────────────────────────────────────────────────

export async function findStatement(db: SQLiteDatabase, fileHash: string) {
  return db.getFirstAsync<{ id: string; imported_at: string; period_from: string | null; period_to: string | null }>(
    'SELECT id, imported_at, period_from, period_to FROM statements WHERE id = ?',
    fileHash,
  );
}

/** Debits from earlier imports, so a refund this month can link to last month's purchase. */
export async function priorDebitsByRef(db: SQLiteDatabase, refs: string[]): Promise<Map<string, PriorDebit>> {
  const out = new Map<string, PriorDebit>();
  const unique = [...new Set(refs)];
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const rows = await db.getAllAsync<{ id: string; ref: string; category_id: string | null }>(
      `SELECT id, ref, category_id FROM transactions WHERE direction = 'debit' AND ref IN (${chunk.map(() => '?').join(',')})`,
      ...chunk,
    );
    for (const r of rows) if (!out.has(r.ref)) out.set(r.ref, { id: r.id, categoryId: r.category_id });
  }
  return out;
}

// ── accounts ────────────────────────────────────────────────────────────────

export type Account = { id: string; bank: string; last4: string | null; name: string };

const BANK_NAMES: Record<string, string> = {
  AXIS: 'Axis Bank',
  BOB: 'Bank of Baroda',
  HDFC: 'HDFC Bank',
  SBI: 'SBI',
  ICICI: 'ICICI Bank',
  KOTAK: 'Kotak',
  YES: 'Yes Bank',
  IDFC: 'IDFC First',
  INDUSIND: 'IndusInd',
  FEDERAL: 'Federal Bank',
  PNB: 'PNB',
  CANARA: 'Canara Bank',
  UNION: 'Union Bank',
};

export function accountName(bank: string, last4: string | null | undefined) {
  const name = BANK_NAMES[bank] ?? (bank === 'UNKNOWN' ? 'Bank account' : bank);
  return last4 ? `${name} ••${last4}` : name;
}

/**
 * The account a statement belongs to. Matches on bank + last 4 digits; an account
 * whose number wasn't printed before (e.g. Axis's emailed PDF) adopts the digits the
 * first time a statement shows them, so every Axis format lands in one account.
 * With `create: false` it never writes, and returns null for an account not seen yet.
 */
export async function resolveAccount(
  db: SQLiteDatabase,
  bank: string,
  last4: string | undefined,
  create: boolean,
): Promise<Account | null> {
  if (last4) {
    const exact = await db.getFirstAsync<Account>('SELECT id, bank, last4, name FROM accounts WHERE bank = ? AND last4 = ?', bank, last4);
    if (exact) return exact;
  }
  const sameBank = await db.getAllAsync<Account>('SELECT id, bank, last4, name FROM accounts WHERE bank = ?', bank);
  const unnumbered = sameBank.find((a) => a.last4 === null);
  if (unnumbered && (last4 || sameBank.length === 1)) {
    if (create && last4) {
      const name = accountName(bank, last4);
      await db.runAsync('UPDATE accounts SET last4 = ?, name = ? WHERE id = ?', last4, name, unnumbered.id);
      return { ...unnumbered, last4, name };
    }
    return unnumbered;
  }
  if (!last4 && sameBank.length === 1) return sameBank[0];
  if (!create) return null;
  const base = `${bank.toLowerCase()}-${last4 ?? 'main'}`;
  let id = base;
  for (let i = 2; await db.getFirstAsync('SELECT 1 FROM accounts WHERE id = ?', id); i++) id = `${base}-${i}`;
  const account: Account = { id, bank, last4: last4 ?? null, name: accountName(bank, last4) };
  await db.runAsync(
    'INSERT INTO accounts (id, bank, last4, name, created_at) VALUES (?, ?, ?, ?, ?)',
    account.id,
    account.bank,
    account.last4,
    account.name,
    new Date().toISOString(),
  );
  return account;
}

/** Same payment, whatever the format: date, direction, amount and the running balance after it. */
export const txnKey = (t: { date: string; direction: string; amount: number; balance: number | null }) =>
  `${t.date}|${t.direction}|${t.amount}|${t.balance}`;

/** Keys of what an account already holds in a date range, for duplicate detection across formats. */
export async function existingKeys(db: SQLiteDatabase, accountId: string, from: string, to: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ date: string; direction: string; amount_paise: number; balance_paise: number | null }>(
    'SELECT date, direction, amount_paise, balance_paise FROM transactions WHERE account_id = ? AND date BETWEEN ? AND ?',
    accountId,
    from,
    to,
  );
  return new Set(rows.map((r) => txnKey({ date: r.date, direction: r.direction, amount: r.amount_paise, balance: r.balance_paise })));
}

export async function saveStatement(
  db: SQLiteDatabase,
  args: { fileHash: string; fileName: string; parse: StatementParse; txns: ClassifiedTxn[]; newIds: Set<string> },
): Promise<{ inserted: number; skipped: number }> {
  const { fileHash, fileName, parse, txns, newIds } = args;
  let inserted = 0;
  const account = (await resolveAccount(db, parse.bank, parse.accountLast4, true))!;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const stmt = await tx.prepareAsync(`
      INSERT OR IGNORE INTO transactions
        (id, statement_id, account_id, source, date, direction, amount_paise, balance_paise, narration, channel, upi_kind, ref,
         counterparty, payee_key, note, bank, type, category_id, linked_txn_id, classify_reason)
      VALUES ($id, $sid, $acct, 'statement', $date, $dir, $amt, $bal, $narr, $chan, $upi, $ref, $cp, $pk, $note, $bank,
              $type, $cat, $link, $reason)`);
    try {
      for (const t of txns) {
        if (!newIds.has(t.id)) continue; // already imported, possibly from another format
        const r = await stmt.executeAsync({
          $id: t.id,
          $sid: fileHash,
          $acct: account.id,
          $date: t.date,
          $dir: t.direction,
          $amt: t.amount,
          $bal: t.balance,
          $narr: t.narration,
          $chan: t.parsed.channel,
          $upi: t.parsed.upiKind ?? null,
          $ref: t.parsed.ref ?? null,
          $cp: t.parsed.counterparty,
          $pk: t.parsed.payeeKey,
          $note: t.parsed.note ?? null,
          $bank: t.parsed.bank ?? null,
          $type: t.type,
          $cat: t.categoryId,
          $link: t.linkedTxnId,
          $reason: t.reason,
        });
        inserted += r.changes;
      }
    } finally {
      await stmt.finalizeAsync();
    }
    await tx.runAsync(
      `INSERT OR REPLACE INTO statements
        (id, account_id, bank, account_kind, period_from, period_to, opening_paise, closing_paise, file_name, imported_at, txn_count, new_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      fileHash,
      account.id,
      parse.bank,
      parse.accountKind,
      parse.periodFrom ?? null,
      parse.periodTo ?? null,
      parse.openingBalance ?? null,
      parse.closingBalance ?? null,
      fileName,
      new Date().toISOString(),
      txns.length,
      inserted,
    );
  });
  await matchOwnTransfers(db);
  notifyChanged();
  return { inserted, skipped: txns.length - inserted };
}

/**
 * Money moved between your own accounts shows up twice: out of one, into the other.
 * Pairs a row already known to be a self-transfer (by your names) with the opposite row
 * in another account (same amount, within a day) and marks both as transfers, so the
 * move counts as neither spending nor income. Manual edits are left alone.
 */
export async function matchOwnTransfers(db: SQLiteDatabase): Promise<number> {
  const rows = await db.getAllAsync<{
    id: string;
    account_id: string;
    date: string;
    direction: Direction;
    amount_paise: number;
    type: string;
    user_edited: number;
    linked_txn_id: string | null;
  }>(
    `SELECT id, account_id, date, direction, amount_paise, type, user_edited, linked_txn_id
     FROM transactions WHERE source = 'statement' AND account_id IS NOT NULL`,
  );
  const pairs = pairOwnTransfers(
    rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      date: r.date,
      direction: r.direction,
      amount: r.amount_paise,
      type: r.type,
      userEdited: r.user_edited === 1,
      linkedTxnId: r.linked_txn_id,
    })),
  );
  for (const [a, b] of pairs) {
    await db.runAsync(
      "UPDATE transactions SET type = 'transfer', category_id = NULL, linked_txn_id = ?, classify_reason = 'own-transfer' WHERE id = ? AND user_edited = 0",
      a.id,
      b.id,
    );
    await db.runAsync('UPDATE transactions SET linked_txn_id = ? WHERE id = ? AND user_edited = 0', b.id, a.id);
  }
  return pairs.length;
}

export function listStatements(db: SQLiteDatabase) {
  return db.getAllAsync<{
    id: string;
    file_name: string;
    period_from: string | null;
    period_to: string | null;
    imported_at: string;
    txn_count: number;
    new_count: number;
    account_name: string | null;
  }>(
    `SELECT s.id, s.file_name, s.period_from, s.period_to, s.imported_at, s.txn_count, s.new_count, a.name AS account_name
     FROM statements s LEFT JOIN accounts a ON a.id = s.account_id ORDER BY s.period_from DESC`,
  );
}

// ── queries ─────────────────────────────────────────────────────────────────

export type TxnFilter = {
  from?: string;
  to?: string;
  /** `null` = uncategorized only. */
  categoryId?: string | null;
  type?: TxnType;
  payeeKey?: string;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
};

export async function listTransactions(db: SQLiteDatabase, f: TxnFilter = {}): Promise<Txn[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const add = (clause: string, ...p: (string | number)[]) => {
    where.push(clause);
    params.push(...p);
  };
  if (f.from) add('t.date >= ?', f.from);
  if (f.to) add('t.date <= ?', f.to);
  if (f.categoryId === null) add('t.category_id IS NULL');
  else if (f.categoryId) add('t.category_id = ?', f.categoryId);
  if (f.type) add('t.type = ?', f.type);
  if (f.payeeKey) add('(t.payee_key = ? OR l.payee_key = ?)', f.payeeKey, f.payeeKey);
  if (f.search?.trim()) {
    const q = `%${f.search.trim()}%`;
    add('(t.counterparty LIKE ? OR t.narration LIKE ? OR t.note LIKE ?)', q, q, q);
  }
  if (f.minAmount !== undefined) add('t.amount_paise >= ?', f.minAmount);
  if (f.maxAmount !== undefined) add('t.amount_paise <= ?', f.maxAmount);
  const sql = `${TXN_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY t.date DESC, t.balance_paise ASC`;
  const rows = await db.getAllAsync<TxnRow>(sql, ...params);
  return rows.map(toTxn);
}

export async function getTransaction(db: SQLiteDatabase, id: string): Promise<Txn | null> {
  const row = await db.getFirstAsync<TxnRow>(`${TXN_SELECT} WHERE t.id = ?`, id);
  return row ? toTxn(row) : null;
}

export async function listMonths(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ m: string }>('SELECT DISTINCT substr(date, 1, 7) AS m FROM transactions ORDER BY m DESC');
  return rows.map((r) => r.m);
}

// ── edits ───────────────────────────────────────────────────────────────────

/** A one-off change to a single transaction. It won't be touched by later re-classification. */
export async function updateTransaction(db: SQLiteDatabase, id: string, patch: { type: TxnType; categoryId: string | null }) {
  await db.runAsync(
    "UPDATE transactions SET type = ?, category_id = ?, user_edited = 1, classify_reason = 'manual' WHERE id = ?",
    patch.type,
    patch.type === 'expense' || patch.type === 'refund' ? patch.categoryId : null,
    id,
  );
  notifyChanged();
}

export type PayeeToSort = {
  payeeKey: string;
  name: string;
  count: number;
  total: number;
  lastDate: string;
  notes: string | null;
  upiKind: UpiKind | null;
};

/**
 * Payees whose spending still has no category: the deck for the "Sort your payees"
 * lesson, biggest totals first so the most useful answers come early.
 */
export function listPayeesToSort(db: SQLiteDatabase): Promise<PayeeToSort[]> {
  return db.getAllAsync<PayeeToSort>(
    `SELECT payee_key AS payeeKey, MAX(counterparty) AS name, COUNT(*) AS count, SUM(amount_paise) AS total,
            MAX(date) AS lastDate, GROUP_CONCAT(DISTINCT note) AS notes, MAX(upi_kind) AS upiKind
     FROM transactions
     WHERE type = 'expense' AND category_id IS NULL AND user_edited = 0
     GROUP BY payee_key
     ORDER BY total DESC`,
  );
}

export async function countPayeeTransactions(db: SQLiteDatabase, payeeKey: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE payee_key = ?', payeeKey);
  return row?.n ?? 0;
}

/**
 * Remember a decision for every payment to/from this payee, past and future.
 * Returns how many stored transactions the rule now covers.
 * `type` is only stored when it differs from what the app would infer, so a
 * category-only rule keeps refunds and self-transfers working.
 */
export async function setPayeeRule(
  db: SQLiteDatabase,
  args: { payeeKey: string; displayName: string; categoryId: string | null; type?: TxnType },
): Promise<number> {
  await db.runAsync(
    `INSERT INTO payee_rules (payee_key, display_name, category_id, type, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(payee_key) DO UPDATE SET display_name = excluded.display_name, category_id = excluded.category_id,
       type = excluded.type, updated_at = excluded.updated_at`,
    args.payeeKey,
    args.displayName,
    args.categoryId,
    args.type ?? null,
    new Date().toISOString(),
  );
  // Applying to the payee supersedes one-off edits for that payee.
  await db.runAsync('UPDATE transactions SET user_edited = 0 WHERE payee_key = ?', args.payeeKey);
  await reclassify(db, args.payeeKey);
  return countPayeeTransactions(db, args.payeeKey);
}

export async function deletePayeeRule(db: SQLiteDatabase, payeeKey: string) {
  await db.runAsync('DELETE FROM payee_rules WHERE payee_key = ?', payeeKey);
  await reclassify(db, payeeKey);
}

export function listPayeeRules(db: SQLiteDatabase) {
  return db.getAllAsync<{ payee_key: string; display_name: string; category_id: string | null; type: TxnType | null }>(
    'SELECT payee_key, display_name, category_id, type FROM payee_rules ORDER BY display_name',
  );
}

/** Re-run classification on stored, non-manually-edited transactions (optionally one payee). */
export async function reclassify(db: SQLiteDatabase, payeeKey?: string) {
  const ctx = await getClassifyContext(db);
  const all = await listTransactions(db, payeeKey ? { payeeKey } : {});
  const targets = all.filter((t) => !t.userEdited && (!payeeKey || t.payeeKey === payeeKey));
  // Debits first so refunds inherit their (possibly new) category.
  targets.sort((a, b) => (a.direction === b.direction ? 0 : a.direction === 'debit' ? -1 : 1));
  const categoryOf = new Map<string, string | null>();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const t of targets) {
      let refundOf: { id: string; categoryId: string | null } | undefined;
      if (t.direction === 'credit' && t.linkedTxnId) {
        const cat =
          categoryOf.get(t.linkedTxnId) ??
          (await tx.getFirstAsync<{ category_id: string | null }>('SELECT category_id FROM transactions WHERE id = ?', t.linkedTxnId))
            ?.category_id ??
          null;
        refundOf = { id: t.linkedTxnId, categoryId: cat };
      }
      const c = classify({ direction: t.direction, narration: t.narration, parsed: toNarration(t), refundOf }, ctx);
      categoryOf.set(t.id, c.categoryId);
      await tx.runAsync(
        'UPDATE transactions SET type = ?, category_id = ?, classify_reason = ? WHERE id = ?',
        c.type,
        c.categoryId,
        c.reason,
        t.id,
      );
    }
  });
  // Re-classifying can undo a cross-account pairing (one side is only a transfer because
  // the other side is); restore those pairs.
  await matchOwnTransfers(db);
  // Refunds of this payee's debits live under another payee key ("UPI refund"); refresh their category.
  if (payeeKey) {
    await db.runAsync(
      `UPDATE transactions SET category_id = (SELECT d.category_id FROM transactions d WHERE d.id = transactions.linked_txn_id)
       WHERE type = 'refund' AND user_edited = 0 AND linked_txn_id IN (SELECT id FROM transactions WHERE payee_key = ?)`,
      payeeKey,
    );
  }
  notifyChanged();
}

export async function wipeAll(db: SQLiteDatabase) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.execAsync('DELETE FROM transactions; DELETE FROM statements; DELETE FROM payee_rules;');
  });
  notifyChanged();
}
