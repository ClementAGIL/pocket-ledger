import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { isExpoGoAndroid, notificationsAvailable, requestReminderPermission, sendTestReminder } from '@/notifications/reminders';
import { useData } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

import { Card, Chips, SectionTitle } from '../ui';
import { Footnote, LinkRow, settingsStyles, StepButton, SwitchRow } from './rows';

const REMINDER_HOURS = [8, 9, 12, 18, 20].map((h) => ({ value: String(h), label: `${h}:00` }));

const ordinal = (n: number) =>
  `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** Monthly local notification: on/off, day (1–28), hour, test. */
export function ReminderSection() {
  const theme = useTheme();
  const { settings, updateSettings } = useData();

  if (!notificationsAvailable()) {
    return (
      <>
        <SectionTitle>Reminder</SectionTitle>
        <Card style={{ flexDirection: 'row', gap: space.md }}>
          <Ionicons name="notifications-off-outline" size={20} color={theme.textSecondary} />
          <Text style={{ color: theme.textSecondary, flex: 1, lineHeight: 20 }}>
            {isExpoGoAndroid
              ? 'Reminders are not available in Expo Go on Android. They work in a development build of the app (still offline, no server).'
              : 'Notifications are not available on this device.'}
          </Text>
        </Card>
      </>
    );
  }

  const toggleReminder = async (enabled: boolean) => {
    if (enabled && !(await requestReminderPermission())) {
      return Alert.alert('Notifications are off', 'Allow notifications for this app in your phone settings to receive the monthly reminder.');
    }
    await updateSettings({ reminderEnabled: enabled });
  };

  const changeDay = (delta: number) => updateSettings({ reminderDay: Math.min(28, Math.max(1, settings.reminderDay + delta)) });

  const testReminder = async () => {
    if (!(await requestReminderPermission())) {
      return Alert.alert('Notifications are off', 'Allow notifications for this app in your phone settings.');
    }
    await sendTestReminder();
    Alert.alert('Test scheduled', 'The notification arrives in about 5 seconds. You can leave the app to see it.');
  };

  return (
    <>
      <SectionTitle>Reminder</SectionTitle>
      <Card style={settingsStyles.card}>
        <SwitchRow icon="notifications-outline" label="Monthly reminder" value={settings.reminderEnabled} onChange={toggleReminder} />
        {settings.reminderEnabled && (
          <>
            <View style={[settingsStyles.row, { borderColor: theme.border }]}>
              <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} />
              <Text style={[settingsStyles.rowLabel, { color: theme.text }]}>Day of the month</Text>
              <View style={styles.stepper}>
                <StepButton icon="remove" label="Earlier day" disabled={settings.reminderDay <= 1} onPress={() => changeDay(-1)} />
                <Text style={[styles.stepValue, { color: theme.text }]}>{ordinal(settings.reminderDay)}</Text>
                <StepButton icon="add" label="Later day" disabled={settings.reminderDay >= 28} onPress={() => changeDay(1)} />
              </View>
            </View>
            <View style={[settingsStyles.chipsRow, { borderColor: theme.border }]}>
              <Chips options={REMINDER_HOURS} value={String(settings.reminderHour)} onChange={(h) => updateSettings({ reminderHour: Number(h) })} />
            </View>
          </>
        )}
        <LinkRow icon="paper-plane-outline" label="Send a test notification" onPress={testReminder} />
      </Card>
      <Footnote>
        {settings.reminderEnabled
          ? `Every month on the ${ordinal(settings.reminderDay)} at ${settings.reminderHour}:00: a reminder to update your prices. Tapping it opens Update prices.`
          : 'A notification each month to update your prices and record your investments.'}{' '}
        Scheduled by your phone: it works offline and never shows amounts.
      </Footnote>
    </>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepValue: { minWidth: 40, textAlign: 'center', fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
