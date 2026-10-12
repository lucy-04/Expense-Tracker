import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, EmojiBadge } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getLockEnabled } from '@/lib/secrets';

/** Re-lock only after the app has been in the background this long (the file picker also backgrounds us). */
const RELOCK_AFTER_MS = 60_000;

/**
 * Covers the app with a lock screen until fingerprint/PIN succeeds. Children stay
 * mounted underneath so in-progress state survives a re-lock.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const [locked, setLocked] = useState(true);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  // Starts with an await, so calling it from an effect never sets state synchronously.
  const authenticate = useCallback(async () => {
    try {
      if (!(await getLockEnabled())) return setLocked(false);
      const usable = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      // No fingerprint and no screen lock set up: nothing to authenticate against.
      if (!usable && level === LocalAuthentication.SecurityLevel.NONE) return setLocked(false);
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Expenses' });
      if (res.success) setLocked(false);
      else if (res.error !== 'user_cancel' && res.error !== 'system_cancel') setError("That didn't match. Try again.");
    } finally {
      setChecking(false);
    }
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setChecking(true);
    authenticate();
  }, [authenticate]);

  useEffect(() => {
    authenticate();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active' && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (away > RELOCK_AFTER_MS) {
          setLocked(true);
          retry();
        }
      }
    });
    return () => sub.remove();
  }, [authenticate, retry]);

  return (
    <View style={styles.flex}>
      {children}
      {locked ? (
        <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: theme.background }]}>
          <EmojiBadge emoji="🔒" size={112} tint={theme.primarySoft} />
          <ThemedText type="title">Welcome back</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            Unlock with your fingerprint or PIN. Your money stuff never leaves this phone.
          </ThemedText>
          {error ? (
            <ThemedText type="smallBold" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
          ) : null}
          <Button title="Unlock" onPress={retry} loading={checking} style={styles.button} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cover: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  button: { alignSelf: 'stretch', marginTop: Spacing.three },
  center: { textAlign: 'center' },
});
