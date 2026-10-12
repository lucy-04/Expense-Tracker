import { randomBytes } from 'node:crypto';

import { decryptBackup, encryptBackup, fromBase64, toBase64, WrongPasswordError } from '../backupCrypto';

const rand = (n: number) => new Uint8Array(randomBytes(n));

describe('backupCrypto', () => {
  jest.setTimeout(30_000);

  it('round-trips unicode data', async () => {
    const data = JSON.stringify({ name: 'Food & Snacks ₹', rows: Array.from({ length: 50 }, (_, i) => i) });
    const env = await encryptBackup(data, 'correct horse', rand);
    expect(env.ciphertext).not.toContain('Food');
    expect(await decryptBackup(JSON.parse(JSON.stringify(env)), 'correct horse')).toBe(data);
  });

  it('rejects a wrong password', async () => {
    const env = await encryptBackup('secret', 'right', rand);
    await expect(decryptBackup(env, 'wrong')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('rejects a tampered file', async () => {
    const env = await encryptBackup('secret', 'pw', rand);
    const ct = fromBase64(env.ciphertext);
    ct[0] ^= 1;
    await expect(decryptBackup({ ...env, ciphertext: toBase64(ct) }, 'pw')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('rejects non-backup files', async () => {
    await expect(decryptBackup({ hello: 1 }, 'pw')).rejects.toThrow(/not an Expense Manager backup/);
  });

  it('base64 handles large buffers', () => {
    const big = rand(200_000);
    expect(fromBase64(toBase64(big))).toEqual(big);
  });
});
