import type * as NotificationsModule from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useDataMode } from '@/state/DataMode';
import { useData } from '@/state/DataProvider';

import { loadNotifications, syncMonthlyReminder } from './reminders';

function openFromNotification(response: NotificationsModule.NotificationResponse | null) {
  const url = response?.notification.request.content.data?.url;
  if (typeof url !== 'string') return;
  // Forget it, so the screen doesn't open again on the next launch.
  loadNotifications()?.clearLastNotificationResponse();
  router.push(url as Href);
}

/**
 * Keeps the scheduled reminder in line with the settings, and opens the reminder's screen when the
 * notification is tapped (app running, in background, or launched by the tap). Renders nothing, and
 * does nothing where notifications are unavailable (Expo Go on Android).
 */
export function NotificationsBridge() {
  const { settings } = useData();
  const { reminderEnabled: enabled, reminderDay: day, reminderHour: hour } = settings;
  const { isDemo } = useDataMode();

  useEffect(() => {
    // The reminder follows the real data's settings: the demo leaves it as it is.
    if (isDemo) return;
    syncMonthlyReminder({ enabled, day, hour }).catch(() => {
      // Scheduling is best effort: a failure must never break the app.
    });
  }, [enabled, day, hour, isDemo]);

  useEffect(() => {
    const N = loadNotifications();
    if (!N) return;
    openFromNotification(N.getLastNotificationResponse());
    const sub = N.addNotificationResponseReceivedListener(openFromNotification);
    return () => sub.remove();
  }, []);

  return null;
}
