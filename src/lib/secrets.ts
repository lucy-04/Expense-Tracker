import * as SecureStore from 'expo-secure-store';

// Small secrets live in the Android Keystore-backed SecureStore, not SQLite.
const PDF_PASSWORDS = 'pdf_passwords';
const LEGACY_PDF_PASSWORD = 'pdf_password_axis';
const LOCK_ENABLED = 'app_lock_enabled';

/**
 * Saved statement passwords, one per bank (each bank sets its own). The app tries each
 * before asking, so it never needs to know which bank a locked PDF is from.
 */
export async function getPdfPasswords(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(PDF_PASSWORDS);
  const list: string[] = raw ? JSON.parse(raw) : [];
  // One-time move of the single password saved by earlier versions.
  const legacy = await SecureStore.getItemAsync(LEGACY_PDF_PASSWORD);
  if (legacy) {
    if (!list.includes(legacy)) list.push(legacy);
    await SecureStore.setItemAsync(PDF_PASSWORDS, JSON.stringify(list));
    await SecureStore.deleteItemAsync(LEGACY_PDF_PASSWORD);
  }
  return list;
}

export async function addPdfPassword(pw: string) {
  const list = await getPdfPasswords();
  if (!list.includes(pw)) await SecureStore.setItemAsync(PDF_PASSWORDS, JSON.stringify([...list, pw]));
}

export async function forgetPdfPasswords() {
  await SecureStore.deleteItemAsync(PDF_PASSWORDS);
  await SecureStore.deleteItemAsync(LEGACY_PDF_PASSWORD);
}

/** Lock defaults to on. */
export async function getLockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(LOCK_ENABLED)) !== '0';
}
export const setLockEnabled = (on: boolean) => SecureStore.setItemAsync(LOCK_ENABLED, on ? '1' : '0');
