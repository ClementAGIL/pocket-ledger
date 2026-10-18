import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ColorField, PRESET_COLORS } from '@/components/ColorField';
import { Button, Card, Chips, Field, Input, Segmented } from '@/components/ui';
import { showSaveError } from '@/components/saveError';
import * as repo from '@/db/repo';
import { UPDATE_FREQUENCIES } from '@/domain/staleness';
import type { Category, CategoryKind, UpdateFrequency, Valuation } from '@/domain/types';
import { useData } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

const COLORS = PRESET_COLORS;

const REMINDER_NOTE: Record<UpdateFrequency, string> = {
  monthly: '',
  yearly: ' · yearly update reminder',
  never: ' · no update reminder',
};

const describe = (c: Pick<Category, 'kind' | 'valuation'>) =>
  c.kind === 'liability' ? 'Debt' : c.valuation === 'units' ? 'Quantity × price' : 'Single value';

export default function CategoriesScreen() {
  const theme = useTheme();
  const { snapshot, write } = useData();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('asset');
  const [valuation, setValuation] = useState<Valuation>('units');

  const usage = (id: number) => snapshot.assets.filter((a) => a.categoryId === id).length;

  const add = async () => {
    if (!name.trim()) return;
    const used = new Set(snapshot.categories.map((c) => c.color));
    try {
      await write((txn) =>
        repo.insertCategory(txn, {
          name,
          kind,
          valuation: kind === 'liability' ? 'balance' : valuation,
          color: COLORS.find((c) => !used.has(c)) ?? COLORS[COLORS.length - 1],
        }),
      );
      setName('');
    } catch (e) {
      showSaveError(e, 'A category with this name already exists.');
    }
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Card style={{ paddingVertical: 0 }}>
        {snapshot.categories.map((c) =>
          editingId === c.id ? (
            <CategoryEditor key={c.id} category={c} usage={usage(c.id)} onDone={() => setEditingId(null)} />
          ) : (
            <Pressable
              key={c.id}
              onPress={() => setEditingId(c.id)}
              accessibilityRole="button"
              style={[styles.row, { borderColor: theme.border }]}>
              <View style={[styles.dot, { backgroundColor: c.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 16 }}>{c.name}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>{describe(c)}
                  {REMINDER_NOTE[c.updateReminder]}
                </Text>
              </View>
              <Text style={{ color: theme.textMuted }}>{usage(c.id)}</Text>
            </Pressable>
          ),
        )}
      </Card>

      <Card style={{ marginTop: space.lg, paddingTop: 0 }}>
        <Field label="New category">
          <Input value={name} onChangeText={setName} placeholder="e.g. Crowdfunding, Watches…" />
        </Field>
        <Field label="Type">
          <Segmented
            options={[
              { value: 'asset', label: 'Asset' },
              { value: 'liability', label: 'Debt' },
            ]}
            value={kind}
            onChange={setKind}
          />
        </Field>
        {kind === 'asset' && (
          <Field label="Valued by" hint="Can't be changed later.">
            <Segmented
              options={[
                { value: 'units', label: 'Quantity × price' },
                { value: 'balance', label: 'Single value' },
              ]}
              value={valuation}
              onChange={setValuation}
            />
          </Field>
        )}
        <Button title="Add category" onPress={add} disabled={!name.trim()} style={{ marginTop: space.lg }} />
      </Card>
    </ScrollView>
  );
}

function CategoryEditor({ category, usage, onDone }: { category: Category; usage: number; onDone: () => void }) {
  const theme = useTheme();
  const { snapshot, write } = useData();
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [updateReminder, setUpdateReminder] = useState<UpdateFrequency>(category.updateReminder);

  const save = async () => {
    if (!name.trim()) return;
    try {
      await write((txn) => repo.updateCategory(txn, category.id, { name, color, updateReminder }));
      onDone();
    } catch (e) {
      showSaveError(e, 'A category with this name already exists.');
    }
  };

  const remove = () =>
    Alert.alert(`Delete ${category.name}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await write((txn) => repo.deleteCategory(txn, category.id));
          onDone();
        },
      },
    ]);

  return (
    <View style={[styles.editor, { borderColor: theme.border }]}>
      <Input value={name} onChangeText={setName} />
      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Remind me to update prices</Text>
      <Chips options={UPDATE_FREQUENCIES} value={updateReminder} onChange={setUpdateReminder} />
      <Text style={{ color: theme.textMuted, fontSize: 12 }}>
        {updateReminder === 'never'
          ? 'No reminder, e.g. real estate valued by an expert every few years.'
          : updateReminder === 'yearly'
            ? 'Reminder after a year without update (e.g. a retirement plan statement).'
            : 'Reminder after a month without update.'}
      </Text>
      <ColorField value={color} onChange={setColor} others={snapshot.categories.filter((c) => c.id !== category.id)} />
      <View style={styles.editorButtons}>
        <Button title="Save" onPress={save} style={{ flex: 1 }} />
        {usage === 0 && <Button title="Delete" variant="danger" onPress={remove} style={{ flex: 1 }} />}
        <Button title="Cancel" variant="secondary" onPress={onDone} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl * 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  editor: { gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  editorButtons: { flexDirection: 'row', gap: space.sm },
});
