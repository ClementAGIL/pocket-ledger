import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { Platform } from 'react-native';

/*
 * Monthly reminder, scheduled locally by the phone: no server, no network, works offline. The text
 * never contains amounts: it is shown on the lock screen.
 *
 * Expo Go on Android refuses to even load expo-notifications (SDK 53+), and a failed import would
 * crash the whole app. So the module is never imported statically: `loadNotifications()` loads it
 * on demand and returns null where it is unavailable. Every function here degrades to a no-op.
 */

type Notifications = typeof NotificationsModule;

let cached: Notifications | null | undefined;

/** True in Expo Go on Android, where notifications can't work (a development build is needed). */
export const isExpoGoAndroid =
  Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export function loadNotifications(): Notifications | null {
  if (cached !== undefined) return cached;
  if (isExpoGoAndroid || Platform.OS === 'web') return (cached = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as Notifications;
  } catch {
    cached = null;
  }
  return cached;
}

export const notificationsAvailable = () => loadNotifications() !== null;

const CHANNEL_ID = 'reminders';
/** Screen opened when the notification is tapped: the check-in leads on to the prices to update. */
export const REMINDER_URL = '/checkin';

// Shown on the lock screen: never an amount.
const CONTENT = {
  title: 'Your monthly check-in is ready',
  body: 'See how last month went, then update your prices.',
  data: { url: REMINDER_URL },
};

export interface ReminderSettings {
  enabled: boolean;
  /** 1–28, so the reminder exists in every month. */
  day: number;
  hour: number;
}

/** Show reminders even when the app is open. Call once at startup. */
export function configureNotifications() {
  loadNotifications()?.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensureChannel(N: Notifications) {
  // Android 13+: the permission prompt only appears once a channel exists.
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Monthly reminders',
      importance: N.AndroidImportance.DEFAULT,
    });
  }
}

const isAllowed = (N: Notifications, p: NotificationsModule.NotificationPermissionsStatus) =>
  p.granted || p.ios?.status === N.IosAuthorizationStatus.PROVISIONAL;

/** Asks for permission if needed. Returns false when refused or unavailable. */
export async function requestReminderPermission(): Promise<boolean> {
  const N = loadNotifications();
  if (!N) return false;
  await ensureChannel(N);
  const current = await N.getPermissionsAsync();
  if (isAllowed(N, current)) return true;
  if (!current.canAskAgain) return false;
  return isAllowed(N, await N.requestPermissionsAsync());
}

function monthlyTrigger(N: Notifications, day: number, hour: number): NotificationsModule.SchedulableNotificationTriggerInput {
  // Android has a dedicated monthly trigger; iOS uses a repeating calendar trigger.
  return Platform.OS === 'android'
    ? { type: N.SchedulableTriggerInputTypes.MONTHLY, channelId: CHANNEL_ID, day, hour, minute: 0 }
    : { type: N.SchedulableTriggerInputTypes.CALENDAR, repeats: true, day, hour, minute: 0 };
}

/**
 * Makes the scheduled reminder match the settings: cancels the previous one, schedules the new one.
 * Idempotent, so it is safe to call at every start (e.g. after restoring a backup on a new phone).
 */
export async function syncMonthlyReminder(settings: ReminderSettings) {
  const N = loadNotifications();
  if (!N) return;
  await N.cancelAllScheduledNotificationsAsync();
  if (!settings.enabled) return;
  if (!isAllowed(N, await N.getPermissionsAsync())) return;
  await ensureChannel(N);
  await N.scheduleNotificationAsync({ content: CONTENT, trigger: monthlyTrigger(N, settings.day, settings.hour) });
}

/** Sends the same notification in a few seconds, to check it works on this phone. */
export async function sendTestReminder() {
  const N = loadNotifications();
  if (!N) return;
  await ensureChannel(N);
  await N.scheduleNotificationAsync({
    content: CONTENT,
    trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: CHANNEL_ID },
  });
}
