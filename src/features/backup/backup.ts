import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { decryptBackup, encryptBackup } from '@/core/backupCrypto';
import { notifyChanged } from '@/db/changes';
import { repairData } from '@/db/schema';

/** Every table, in an order that is safe to restore. */
const TABLES = ['categories', 'settings', 'payee_rules', 'accounts', 'statements', 'transactions'] as const;

type Dump = { app: 'expense-manager'; schema: number; exportedAt: string; tables: Record<string, Record<string, unknown>[]> };

export async function exportBackup(db: SQLiteDatabase, password: string): Promise<void> {
  const schema = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  const tables: Dump['tables'] = {};
  for (const t of TABLES) tables[t] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${t}`);
  const dump: Dump = { app: 'expense-manager', schema, exportedAt: new Date().toISOString(), tables };

  const envelope = await encryptBackup(JSON.stringify(dump), password, (n) => Crypto.getRandomBytes(n));
  // Expo Go's per-project cache folder may not exist yet, so create parents explicitly.
  // The previous export is cleared here rather than right after sharing: the receiving
  // app (e.g. Drive) can still be reading the file after the share sheet closes.
  const dir = new Directory(Paths.cache, 'backups');
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  const file = new File(dir, `expenses-backup-${new Date().toISOString().slice(0, 10)}.json`);
  file.create();
  file.write(JSON.stringify(envelope));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save encrypted backup' });
}

export async function pickBackupFile(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'application/octet-stream', '*/*'], copyToCacheDirectory: false });
  if (res.canceled) return null;
  return res.assets[0].uri;
}

/** Replaces ALL local data with the backup's contents. */
export async function restoreBackup(db: SQLiteDatabase, uri: string, password: string): Promise<{ transactions: number }> {
  const file = new File(uri);
  let envelope: unknown;
  try {
    envelope = JSON.parse(await file.text());
  } catch {
    throw new Error('This is not an Expense Manager backup file.');
  } finally {
    // Only clean up our own cache copies, never the user's original (content://) file.
    if (uri.startsWith('file://') && file.exists) file.delete();
  }
  const dump = JSON.parse(await decryptBackup(envelope, password)) as Dump;
  if (dump.app !== 'expense-manager') throw new Error('This is not an Expense Manager backup file.');
  const schema = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  if (dump.schema > schema) throw new Error('This backup is from a newer version of the app. Update the app first.');

  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const t of [...TABLES].reverse()) await tx.runAsync(`DELETE FROM ${t}`);
    for (const t of TABLES) {
      for (const row of dump.tables[t] ?? []) {
        const cols = Object.keys(row).filter((c) => /^[a-z_]+$/.test(c));
        await tx.runAsync(
          `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          ...cols.map((c) => row[c] as string | number | null),
        );
      }
    }
  });
  // Backups from before a schema change lack newer columns (emoji, accounts, …).
  await repairData(db);
  notifyChanged();
  return { transactions: dump.tables.transactions?.length ?? 0 };
}
