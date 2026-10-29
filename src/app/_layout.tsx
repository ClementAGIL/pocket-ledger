import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { useColorScheme, View } from 'react-native';

import { AnimatedSplash } from '@/components/AnimatedSplash';
import { GoalCelebrations } from '@/components/celebration/GoalCelebration';
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

/** Catches startup failures (database can't open or load) and crashes: a message instead of a frozen splash. */
export const ErrorBoundary = StartupError;

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = useTheme();
  const navTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
  // The native splash hides once the data is loaded; the animated one, already drawn the same way, takes over.
  const [loaded, setLoaded] = useState(false);
  const onReady = useCallback(() => {
    SplashScreen.hideAsync();
    setLoaded(true);
  }, []);

  return (
    <ThemeProvider
      value={{
        ...navTheme,
        colors: { ...navTheme.colors, background: theme.background, card: theme.surface, primary: theme.primary },
      }}>
      <StatusBar style="auto" />
      <View style={{ flex: 1 }}>
        <DataModeProvider>
          <DataProvider onReady={onReady}>
            <LockGate>
              <UndoProvider>
                <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="asset/[id]" options={{ title: '' }} />
                  <Stack.Screen name="holding" options={{ title: '' }} />
                  <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }} />
                  <Stack.Screen name="checkin" options={{ title: 'Monthly check-in' }} />
                  <Stack.Screen name="schedule" options={{ presentation: 'modal', title: 'Scheduled operation' }} />
                  <Stack.Screen name="scheduled" options={{ title: 'Scheduled operations' }} />
                  <Stack.Screen name="operation" options={{ presentation: 'modal', title: 'Edit operation' }} />
                  <Stack.Screen name="update-prices" options={{ title: 'Update prices' }} />
                  <Stack.Screen name="fetch-prices" options={{ presentation: 'modal', title: 'Online prices' }} />
                  <Stack.Screen name="settings" options={{ title: 'Settings' }} />
                  <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
                  <Stack.Screen name="categories" options={{ title: 'Categories' }} />
                  <Stack.Screen name="backups" options={{ title: 'Automatic backups' }} />
                </Stack>
                <GoalCelebrations />
              </UndoProvider>
              <NotificationsBridge />
            </LockGate>
          </DataProvider>
        </DataModeProvider>
        <AnimatedSplash start={loaded} />
      </View>
    </ThemeProvider>
  );
}
