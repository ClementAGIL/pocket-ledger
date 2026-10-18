import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radius, space, useTheme } from '@/theme';

import { Input } from './ui';

export interface SelectOption<V> {
  value: V;
  label: string;
  description?: string;
  color?: string;
}

/** A field that opens a searchable list in a modal. Optionally offers a "create new" action. */
export function Select<V extends string | number>({
  title,
  placeholder,
  options,
  value,
  onChange,
  createLabel,
  onCreate,
}: {
  title: string;
  placeholder: string;
  options: SelectOption<V>[];
  value: V | null;
  onChange: (v: V) => void;
  createLabel?: string;
  onCreate?: () => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q))
    : options;

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${selected?.label ?? placeholder}`}
        style={[styles.trigger, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {selected?.color && <View style={[styles.dot, { backgroundColor: selected.color }]} />}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: selected ? theme.text : theme.textMuted, fontSize: 16 }}>
            {selected?.label ?? placeholder}
          </Text>
          {selected?.description ? (
            <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 12 }}>
              {selected.description}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-down" size={18} color={theme.textMuted} />
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={26} color={theme.text} />
            </Pressable>
          </View>
          {options.length > 6 && (
            <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
              <Input placeholder="Search" value={query} onChangeText={setQuery} autoCorrect={false} />
            </View>
          )}
          <FlatList
            data={filtered}
            keyExtractor={(o) => String(o.value)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}
            ListHeaderComponent={
              onCreate ? (
                <Pressable
                  onPress={() => {
                    close();
                    onCreate();
                  }}
                  style={[styles.option, { borderColor: theme.border }]}>
                  <Ionicons name="add-circle" size={22} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontSize: 16, fontWeight: '600' }}>{createLabel ?? 'Create new'}</Text>
                </Pressable>
              ) : null
            }
            ListEmptyComponent={<Text style={{ color: theme.textMuted, padding: space.lg }}>Nothing found.</Text>}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item.value);
                  close();
                }}
                style={[styles.option, { borderColor: theme.border }]}>
                {item.color && <View style={[styles.dot, { backgroundColor: item.color }]} />}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 16 }}>{item.label}</Text>
                  {item.description ? <Text style={{ color: theme.textMuted, fontSize: 13 }}>{item.description}</Text> : null}
                </View>
                {item.value === value && <Ionicons name="checkmark" size={20} color={theme.primary} />}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.lg,
  },
  title: { fontSize: 20, fontWeight: '700' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
