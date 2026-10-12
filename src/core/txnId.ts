import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

import type { RawTxn } from './types';

/**
 * Stable id for a statement row, so re-importing the same or an overlapping
 * statement never duplicates. The running balance makes two otherwise
 * identical same-day payments distinct.
 */
export function txnId(t: RawTxn): string {
  const key = [t.date, t.direction, t.amount, t.balance, t.narration.replace(/\s+/g, ' ').trim()].join('|');
  return bytesToHex(sha256(utf8ToBytes(key))).slice(0, 24);
}

export function hashBytes(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}
