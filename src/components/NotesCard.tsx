import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import * as repo from '@/db/repo';
import { addMonths } from '@/domain/dates';
import { formatDate } from '@/domain/format';
import { isReviewDue } from '@/domain/reviews';
import type { Asset, ISODate } from '@/domain/types';
import { useData, useToday } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

import { DateField } from './DateField';
import { Button, Card, Chips, Field, Input } from './ui';

const QUICK_DATES = [
  { value: '3', label: 'In 3 months' },
  { value: '6', label: 'In 6 months' },
  { value: '12', label: 'In 1 year' },
] as const;

/** Why you hold an investment and when to look at it again. */
export function NotesCard({ asset }: { asset: Asset }) {
  const theme = useTheme();
  const { write } = useData();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(asset.note ?? '');
  const [reviewDate, setReviewDate] = useState<ISODate | null>(asset.reviewDate);
  const now = useToday();
  const due = isReviewDue(asset, now);

  const save = async (next: { note: string | null; reviewDate: ISODate | null }) => {
    await write((txn) => repo.updateAssetNotes(txn, asset.id, next));
    setEditing(false);
  };

  const startEditing = () => {
    setNote(asset.note ?? '');
    setReviewDate(asset.reviewDate);
    setEditing(true);
  };

  if (editing) {
    return (
      <Card style={{ paddingTop: 0 }}>
        <Field label="Notes" hint="Why you bought it, your plan, when you would sell…">
          <Input
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="e.g. Long-term core holding, DCA every month. Sell if fees go up."
            style={{ minHeight: 96, paddingTop: space.md, textAlignVertical: 'top' }}
          />
        </Field>
        <Field label="Review on">
          {reviewDate ? (
            <View style={{ gap: space.sm }}>
              <DateField value={reviewDate} onChange={setReviewDate} allowFuture />
              <Pressable onPress={() => setReviewDate(null)} accessibilityRole="button" hitSlop={8}>
                <Text style={{ color: theme.textSecondary }}>Remove review date</Text>
              </Pressable>
            </View>
          ) : (
            <Chips
              options={[...QUICK_DATES]}
              value={'' as (typeof QUICK_DATES)[number]['value']}
              onChange={(months) => setReviewDate(addMonths(now, Number(months)))}
            />
          )}
        </Field>
        <View style={styles.buttons}>
          <Button
            title="Save"
            onPress={() => save({ note: note.trim() || null, reviewDate })}
            style={{ flex: 1 }}
          />
          <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} style={{ flex: 1 }} />
        </View>
      </Card>
    );
  }

  return (
    <Card style={{ gap: space.md }}>
      {asset.note ? (
        <Text style={{ color: theme.text, fontSize: 15, lineHeight: 21 }}>{asset.note}</Text>
      ) : (
        <Text style={{ color: theme.textMuted }}>No notes yet: why did you buy it, what is your plan?</Text>
      )}

      <View style={styles.review}>
        <Ionicons
          name={due ? 'flag' : 'calendar-outline'}
          size={18}
          color={due ? theme.staleWarning : theme.textSecondary}
        />
        <Text style={{ color: due ? theme.text : theme.textSecondary, flex: 1, fontWeight: due ? '600' : '400' }}>
          {!asset.reviewDate
            ? 'No review planned'
            : due
              ? `Review due since ${formatDate(asset.reviewDate)}`
              : `Review on ${formatDate(asset.reviewDate)}`}
        </Text>
      </View>

      {due && (
        <Button
          title="Reviewed: next in 6 months"
          onPress={() => save({ note: asset.note, reviewDate: addMonths(now, 6) })}
        />
      )}
      <Button title={asset.note || asset.reviewDate ? 'Edit notes' : 'Add notes'} variant="secondary" onPress={startEditing} />
    </Card>
  );
}

const styles = StyleSheet.create({
  review: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  buttons: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
});
