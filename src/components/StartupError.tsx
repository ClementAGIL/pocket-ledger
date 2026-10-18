import Ionicons from '@expo/vector-icons/Ionicons';
import type { ErrorBoundaryProps } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { space, useTheme } from '@/theme';

import { Button } from './ui';

/**
 * Shown instead of the app when it can't start (database can't be opened or loaded, or a screen
 * crashed). Without it the app would stay on the splash screen with no explanation.
 */
export function StartupError({ error, retry }: ErrorBoundaryProps) {
  const theme = useTheme();
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Ionicons name="alert-circle-outline" size={48} color={theme.negative} />
      <Text style={[styles.title, { color: theme.text }]}>MyFinance couldn’t start</Text>
      <Text style={[styles.text, { color: theme.textSecondary }]}>
        Your data is still on this phone: nothing was deleted. If you just installed an older version of the app,
        install the latest one. Otherwise, try again or restart the app.
      </Text>
      <Text selectable style={[styles.error, { color: theme.textMuted, borderColor: theme.border }]}>
        {error.message}
      </Text>
      <Button title="Try again" onPress={retry} style={{ alignSelf: 'stretch' }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: space.xl, gap: space.md },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  text: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  error: { fontSize: 13, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: space.md, alignSelf: 'stretch' },
});
