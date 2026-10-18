import Ionicons from '@expo/vector-icons/Ionicons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { useData } from '@/state/DataProvider';
import { radius, space, useTheme } from '@/theme';

/** Time in background after which the app asks to unlock again. */
const RELOCK_AFTER_MS = 60_000;

export async function authenticate(promptMessage = 'Unlock MyFinance') {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage });
  return result.success;
}

/** Returns an error message if the device can't protect the app (no biometrics nor passcode). */
export async function checkLockAvailable(): Promise<string | null> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) {
    return 'Set up a screen lock (PIN, fingerprint or face) on your phone first.';
  }
  return null;
}

/**
 * Covers the app with a lock screen when the lock is enabled: on start and when coming back after
 * RELOCK_AFTER_MS. Also hides the content while the app is in the app switcher.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const { settings } = useData();
  const theme = useTheme();
  const [locked, setLocked] = useState(settings.lockEnabled);
  const [covered, setCovered] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const authenticating = useRef(false);

  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    try {
      if (await authenticate()) setLocked(false);
    } finally {
      authenticating.current = false;
    }
  }, []);

  useEffect(() => {
    if (locked) unlock();
    // Only on mount: later locks are triggered by AppState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!settings.lockEnabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      // The biometric prompt itself makes the app inactive: ignore it.
      if (authenticating.current) return;
      if (state === 'active') {
        setCovered(false);
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (since !== null && Date.now() - since > RELOCK_AFTER_MS) {
          setLocked(true);
          unlock();
        }
      } else {
        setCovered(true);
        if (state === 'background' && backgroundedAt.current === null) backgroundedAt.current = Date.now();
      }
    });
    return () => sub.remove();
  }, [settings.lockEnabled, unlock]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {settings.lockEnabled && (locked || covered) && (
        <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: theme.background }]}>
          <Ionicons name="lock-closed" size={48} color={theme.primary} />
          <Text style={[styles.title, { color: theme.text }]}>MyFinance is locked</Text>
          {locked && !covered && (
            <Pressable
              onPress={unlock}
              accessibilityRole="button"
              style={[styles.button, { backgroundColor: theme.primary }]}>
              <Text style={{ color: theme.onPrimary, fontWeight: '600' }}>Unlock</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', gap: space.lg },
  title: { fontSize: 18, fontWeight: '600' },
  button: { paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.md },
});
