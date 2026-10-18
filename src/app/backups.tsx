import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { deleteLocalBackup, listLocalBackups, readLocalBackup, safetyBackup, type LocalBackup } from '@/backup/autoBackup';
import { BACKUP_REASON_LABELS } from '@/backup/autoBackupRules';
import { restoreBackup } from '@/backup/backup';
import { useData } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

const formatWhen = (d: Date) =>
  d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const formatSize = (bytes: number | null) =>
  bytes === null ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Automatic backups kept on this phone: restore one, or delete it. */
export default function BackupsScreen() {
  const theme = useTheme();
  const { db, settings, refresh } = useData();
  const [backups, setBackups] = useState<LocalBackup[]>(() => listLocalBackups());

  const restore = async (backup: LocalBackup) => {
    let data;
    try {
      data = await readLocalBackup(backup.name);
    } catch (e) {
      return Alert.alert('Cannot read this backup', e instanceof Error ? e.message : String(e));
    }
    Alert.alert(
      `Restore the backup of ${formatWhen(backup.date)}?`,
      `It contains ${data.assets.length} investments and ${data.transactions.length} operations. Your current data will be replaced; a backup of it is made first.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            await safetyBackup(db, 'before-restore', { enabled: settings.autoBackupEnabled, keep: settings.autoBackupKeep });
            await restoreBackup(db, data);
            await refresh();
            Alert.alert('Backup restored');
            router.dismissTo('/');
          },
        },
      ],
    );
  };

  const remove = (backup: LocalBackup) =>
    Alert.alert(`Delete the backup of ${formatWhen(backup.date)}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteLocalBackup(backup.name);
          setBackups(listLocalBackups());
        },
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {backups.length === 0 ? (
        <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: space.xl, lineHeight: 20 }}>
          No automatic backup yet. One is made before the first change of each day, and before any restore or reset.
        </Text>
      ) : (
        <Card style={{ paddingVertical: 0 }}>
          {backups.map((b, i) => (
            <Pressable
              key={b.name}
              onPress={() => restore(b)}
              accessibilityRole="button"
              accessibilityHint="Restores this backup"
              style={({ pressed }) => [
                styles.row,
                { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
                i === backups.length - 1 && { borderBottomWidth: 0 },
              ]}>
              <Ionicons name={b.reason === 'daily' ? 'time-outline' : 'shield-checkmark-outline'} size={20} color={theme.textSecondary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: theme.text, fontSize: 15 }}>{formatWhen(b.date)}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                  {BACKUP_REASON_LABELS[b.reason]}
                  {b.size !== null ? ` · ${formatSize(b.size)}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => remove(b)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Delete backup">
                <Ionicons name="trash-outline" size={18} color={theme.textMuted} />
              </Pressable>
            </Pressable>
          ))}
        </Card>
      )}
      <Text style={[styles.footnote, { color: theme.textMuted }]}>
        Tap a backup to restore it. These files stay on this phone and are deleted with the app: use Export
        backup in Settings to keep a copy elsewhere.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl * 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 60,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  footnote: { fontSize: 12, marginTop: space.md, marginHorizontal: space.xs, lineHeight: 17 },
});
