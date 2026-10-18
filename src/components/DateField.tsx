import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { fromISODate, toISODate } from '@/domain/dates';
import { formatDate } from '@/domain/format';
import type { ISODate } from '@/domain/types';
import { radius, space, useTheme } from '@/theme';

import { Button, ModalCard } from './ui';

/** Date picker. Future dates are refused unless `allowFuture` (e.g. a planned review). */
export function DateField({
  value,
  onChange,
  allowFuture = false,
}: {
  value: ISODate;
  onChange: (d: ISODate) => void;
  allowFuture?: boolean;
}) {
  const maximumDate = allowFuture ? undefined : new Date();
  const theme = useTheme();
  const [iosOpen, setIosOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState(() => fromISODate(value));

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fromISODate(value),
        mode: 'date',
        maximumDate,
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(toISODate(date));
        },
      });
    } else {
      setIosDraft(fromISODate(value));
      setIosOpen(true);
    }
  };

  return (
    <>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        style={[styles.trigger, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>{formatDate(value)}</Text>
        <Ionicons name="calendar-outline" size={20} color={theme.textMuted} />
      </Pressable>
      {Platform.OS !== 'android' && (
        <ModalCard visible={iosOpen} onClose={() => setIosOpen(false)}>
          <DateTimePicker
            value={iosDraft}
            mode="date"
            display="inline"
            maximumDate={maximumDate}
            onChange={(_, date) => date && setIosDraft(date)}
          />
          <Button
            title="Done"
            onPress={() => {
              onChange(toISODate(iosDraft));
              setIosOpen(false);
            }}
          />
        </ModalCard>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
