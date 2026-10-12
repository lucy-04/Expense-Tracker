import { gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';

/**
 * Backup envelope: scrypt(password) → AES-256-GCM. GCM's auth tag means a wrong
 * password or a tampered file fails loudly instead of yielding garbage.
 */
export type BackupEnvelope = {
  format: 'expense-manager-backup';
  v: 1;
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  nonce: string;
  ciphertext: string;
};

// N=2^15 keeps derivation around a couple of seconds in Hermes on a mid-range phone.
const KDF = { N: 2 ** 15, r: 8, p: 1 };

export async function encryptBackup(
  plaintext: string,
  password: string,
  randomBytes: (n: number) => Uint8Array,
): Promise<BackupEnvelope> {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = await scryptAsync(password, salt, { ...KDF, dkLen: 32 });
  const ct = gcm(key, nonce).encrypt(utf8ToBytes(plaintext));
  return {
    format: 'expense-manager-backup',
    v: 1,
    kdf: { name: 'scrypt', ...KDF, salt: toBase64(salt) },
    nonce: toBase64(nonce),
    ciphertext: toBase64(ct),
  };
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong password, or the backup file is damaged.');
  }
}

export async function decryptBackup(envelope: unknown, password: string): Promise<string> {
  const e = envelope as BackupEnvelope;
  if (e?.format !== 'expense-manager-backup' || e.v !== 1 || e.kdf?.name !== 'scrypt') {
    throw new Error('This is not an Expense Manager backup file.');
  }
  const key = await scryptAsync(password, fromBase64(e.kdf.salt), { N: e.kdf.N, r: e.kdf.r, p: e.kdf.p, dkLen: 32 });
  try {
    return bytesToUtf8(gcm(key, fromBase64(e.nonce)).decrypt(fromBase64(e.ciphertext)));
  } catch {
    throw new WrongPasswordError();
  }
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
