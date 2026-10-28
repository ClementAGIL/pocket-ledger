import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { StartupError } from '@/components/StartupError';
import { NotificationsBridge } from '@/notifications/NotificationsBridge';
import { configureNotifications } from '@/notifications/reminders';
import { LockGate } from '@/security/LockGate';
import { DataModeProvider } from '@/state/DataMode';
import { DataProvider } from '@/state/DataProvider';
import { UndoProvider } from '@/state/UndoProvider';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync();
configureNotifications();

const hideSplash = () => SplashScreen.hideAsync();

/** Catches startup failures (database can't open or load) and crashes: a message instead of a frozen splash. */
export const ErrorBoundary = StartupError;

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = useTheme();
  const navTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider
      value={{
        ...navTheme,
        colors: { ...navTheme.colors, background: theme.background, card: theme.surface, primary: theme.primary },
      }}>
      <StatusBar style="auto" />
      <DataModeProvider>
        <DataProvider onReady={hideSplash}>
          <LockGate>
            <UndoProvider>
              <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="asset/[id]" options={{ title: '' }} />
                <Stack.Screen name="holding" options={{ title: '' }} />
                <Stack.Screen name="operation" options={{ presentation: 'modal', title: 'Edit operation' }} />
                <Stack.Screen name="update-prices" options={{ title: 'Update prices' }} />
                <Stack.Screen name="fetch-prices" options={{ presentation: 'modal', title: 'Online prices' }} />
                <Stack.Screen name="settings" options={{ title: 'Settings' }} />
                <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
                <Stack.Screen name="categories" options={{ title: 'Categories' }} />
                <Stack.Screen name="backups" options={{ title: 'Automatic backups' }} />
              </Stack>
            </UndoProvider>
            <NotificationsBridge />
          </LockGate>
        </DataProvider>
      </DataModeProvider>
    </ThemeProvider>
  );
}
