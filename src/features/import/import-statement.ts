import type { SQLiteDatabase } from 'expo-sqlite';
import { File } from 'expo-file-system';

import { parseNarration } from '@/core/narration';
import { classifyStatement, type ClassifiedTxn } from '@/core/pipeline';
import type { StatementParse } from '@/core/types';
import { hashBytes } from '@/core/txnId';
import {
  accountName,
  existingKeys,
  findStatement,
  getClassifyContext,
  priorDebitsByRef,
  resolveAccount,
  txnKey,
} from '@/db/repo';

/** A picked statement file. PDFs go through the pdf.js extractor; CSVs are read as text. */
export type PickedFile =
  | { kind: 'pdf'; uri: string; name: string; hash: string; base64: string }
  | { kind: 'csv'; uri: string; name: string; hash: string; text: string };

export type Preview = {
  file: PickedFile;
  parse: StatementParse;
  txns: ClassifiedTxn[];
  newIds: Set<string>;
  previousImport: { imported_at: string } | null;
  /** "Axis Bank ••5432"; `isNewAccount` when this bank account hasn't been imported before. */
  accountLabel: string;
  isNewAccount: boolean;
  spent: number;
  income: number;
};

export class UnsupportedFileError extends Error {}

export function readPicked(uri: string, name: string, mimeType?: string): PickedFile {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const mime = (mimeType ?? '').toLowerCase();
  if (ext === 'xls' || ext === 'xlsx' || mime.includes('spreadsheet') || mime.includes('excel')) {
    throw new UnsupportedFileError('Excel files can’t be read yet. In your bank’s app, choose CSV or PDF when downloading the statement.');
  }
  const file = new File(uri);
  const bytes = file.bytesSync();
  const hash = hashBytes(bytes);
  if (ext === 'pdf' || mime === 'application/pdf') return { kind: 'pdf', uri, name, hash, base64: file.base64Sync() };
  if (ext === 'csv' || ext === 'txt' || mime.includes('csv') || mime.startsWith('text/')) {
    return { kind: 'csv', uri, name, hash, text: new TextDecoder('utf-8').decode(bytes) };
  }
  throw new UnsupportedFileError('Pick a statement saved as PDF or CSV.');
}

/**
 * Removes a cache copy of the statement so no file lingers in app storage.
 * Never touches content:// URIs: those point at the user's original file.
 */
export function discardPicked(file: PickedFile) {
  if (!file.uri.startsWith('file://')) return;
  try {
    const f = new File(file.uri);
    if (f.exists) f.delete();
  } catch {
    // best effort: the OS clears the cache directory eventually
  }
}

/** A parsed statement → classified preview with duplicates marked. Nothing is written yet. */
export async function buildPreview(db: SQLiteDatabase, file: PickedFile, parse: StatementParse): Promise<Preview> {
  const ctx = await getClassifyContext(db);
  const refs = parse.txns.map((t) => parseNarration(t.narration).ref).filter((r): r is string => !!r);
  const txns = classifyStatement(parse.txns, ctx, await priorDebitsByRef(db, refs));

  // Duplicates are matched on account + date + direction + amount + balance, so the same
  // month imported from a different format (PDF vs CSV vs app export) adds nothing.
  const account = await resolveAccount(db, parse.bank, parse.accountLast4, false);
  const dates = txns.map((t) => t.date).sort();
  const existing = account && dates.length ? await existingKeys(db, account.id, dates[0], dates[dates.length - 1]) : new Set<string>();
  const newIds = new Set(txns.filter((t) => !existing.has(txnKey(t))).map((t) => t.id));

  const sumOf = (type: string) => txns.filter((t) => t.type === type).reduce((a, t) => a + t.amount, 0);
  return {
    file,
    parse,
    txns,
    newIds,
    previousImport: await findStatement(db, file.hash),
    accountLabel: account?.name ?? accountName(parse.bank, parse.accountLast4),
    isNewAccount: !account,
    spent: sumOf('expense') - sumOf('refund'),
    income: sumOf('income'),
  };
}
