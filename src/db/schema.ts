import type { SQLiteDatabase } from 'expo-sqlite';

import { CUSTOM_CATEGORY_EMOJI, DEFAULT_CATEGORIES } from '@/core/categories';

export const DATABASE_NAME = 'expenses.db';

/** Migrations run in order; PRAGMA user_version records how many have been applied. */
const MIGRATIONS: ((db: SQLiteDatabase) => Promise<void>)[] = [
  async (db) => {
    await db.execAsync(`
      CREATE TABLE categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE statements (
        id TEXT PRIMARY KEY NOT NULL,            -- sha256 of the PDF bytes
        bank TEXT NOT NULL,
        account_kind TEXT NOT NULL,
        period_from TEXT,
        period_to TEXT,
        opening_paise INTEGER,
        closing_paise INTEGER,
        file_name TEXT,
        imported_at TEXT NOT NULL,
        txn_count INTEGER NOT NULL,
        new_count INTEGER NOT NULL
      );
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY NOT NULL,            -- txnId(): hash of date|dir|amount|balance|narration
        statement_id TEXT,
        source TEXT NOT NULL DEFAULT 'statement',  -- 'statement' | 'sms' (phase B)
        date TEXT NOT NULL,
        direction TEXT NOT NULL,
        amount_paise INTEGER NOT NULL,
        balance_paise INTEGER,
        narration TEXT NOT NULL,
        channel TEXT NOT NULL,
        upi_kind TEXT,
        ref TEXT,
        counterparty TEXT NOT NULL,
        payee_key TEXT NOT NULL,
        note TEXT,
        bank TEXT,
        type TEXT NOT NULL,
        category_id TEXT,
        linked_txn_id TEXT,
        classify_reason TEXT,
        user_edited INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX ix_txn_date ON transactions(date);
      CREATE INDEX ix_txn_payee ON transactions(payee_key);
      CREATE INDEX ix_txn_ref ON transactions(ref);
      CREATE TABLE payee_rules (
        payee_key TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL,
        category_id TEXT,
        type TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
      await db.runAsync('INSERT INTO categories (id, name, sort) VALUES (?, ?, ?)', c.id, c.name, i);
    }
  },
  // v2: every category gets an emoji icon.
  async (db) => {
    await db.execAsync(`ALTER TABLE categories ADD COLUMN emoji TEXT NOT NULL DEFAULT '${CUSTOM_CATEGORY_EMOJI}'`);
    for (const c of DEFAULT_CATEGORIES) {
      await db.runAsync('UPDATE categories SET emoji = ? WHERE id = ?', c.emoji, c.id);
    }
  },
  // v3: more than one bank. Statements and transactions belong to an account, and
  // duplicates are found by account + date + amount + balance (not description text,
  // which differs between a bank's PDF, app export and CSV).
  async (db) => {
    await db.execAsync(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY NOT NULL,
        bank TEXT NOT NULL,
        last4 TEXT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      ALTER TABLE statements ADD COLUMN account_id TEXT;
      ALTER TABLE transactions ADD COLUMN account_id TEXT;
      CREATE INDEX ix_txn_dedupe ON transactions(account_id, date, amount_paise, balance_paise);
    `);
  },
];

/** Until v3 the app only read Axis statements, so rows without an account are Axis. */
export const LEGACY_ACCOUNT = { id: 'axis', bank: 'AXIS', name: 'Axis Bank' } as const;

/**
 * Gives built-in categories their emoji wherever they still have the placeholder,
 * e.g. after restoring a backup made before emoji existed. Never overrides an emoji
 * the user picked. Idempotent and cheap, so it runs on every launch.
 */
export async function repairCategoryEmoji(db: SQLiteDatabase) {
  for (const c of DEFAULT_CATEGORIES) {
    await db.runAsync('UPDATE categories SET emoji = ? WHERE id = ? AND emoji = ?', c.emoji, c.id, CUSTOM_CATEGORY_EMOJI);
  }
}

/**
 * Brings older data up to the current model; idempotent, so it runs on every launch and
 * after a restore (a backup can come from any earlier version):
 * - rows with no account get the legacy Axis account;
 * - payee keys lose their spaces (identity ignores spacing, see core/narration.ts payeeKey).
 */
export async function repairData(db: SQLiteDatabase) {
  await repairCategoryEmoji(db);
  const orphan = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE account_id IS NULL');
  if (orphan && orphan.n > 0) {
    await db.runAsync(
      'INSERT OR IGNORE INTO accounts (id, bank, last4, name, created_at) VALUES (?, ?, NULL, ?, ?)',
      LEGACY_ACCOUNT.id,
      LEGACY_ACCOUNT.bank,
      LEGACY_ACCOUNT.name,
      new Date().toISOString(),
    );
    await db.runAsync('UPDATE transactions SET account_id = ? WHERE account_id IS NULL', LEGACY_ACCOUNT.id);
    await db.runAsync('UPDATE statements SET account_id = ? WHERE account_id IS NULL', LEGACY_ACCOUNT.id);
  }
  await db.runAsync("UPDATE transactions SET payee_key = REPLACE(payee_key, ' ', '') WHERE payee_key LIKE '% %'");
  await db.runAsync("UPDATE OR REPLACE payee_rules SET payee_key = REPLACE(payee_key, ' ', '') WHERE payee_key LIKE '% %'");
}

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await MIGRATIONS[version](txn);
    });
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
  await repairData(db);
}
