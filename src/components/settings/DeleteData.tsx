import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { deleteAllLocalBackups, listLocalBackups, safetyBackup } from '@/backup/autoBackup';
import { clearAllData } from '@/db/demo';
import * as repo from '@/db/repo';
import { useData } from '@/state/DataProvider';
import { useUndo } from '@/state/UndoProvider';
import { radius, space, useTheme } from '@/theme';

import { Button, Field, Input, ModalCard } from '../ui';
import { LinkRow } from './rows';

/**
 * Starts over from zero: deletes every account, investment, operation and price (settings are kept).
 * Confirmed, backed up first (when automatic backups are on), and undoable for a few seconds.
 */
export function DeleteAllDataRow() {
  const { db, snapshot, settings, write } = useData();
  const showUndo = useUndo();

  const backupNote = settings.autoBackupEnabled
    ? 'A backup of your current data is saved first. It, and any earlier backup or exported file, can still be restored from Settings › Backup.'
    : 'Automatic backups are off, so no backup is saved now. Backups already on this phone and exported files are not deleted and can still be restored from Settings › Backup.';

  const confirm = () =>
    Alert.alert(
      'Delete all data?',
      `This deletes everything in the app: ${snapshot.accounts.length} accounts, ${snapshot.assets.length} investments and all their operations and prices. Your settings are kept.\n\n${backupNote}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            const previous = snapshot;
            try {
              await safetyBackup(db, 'before-delete', { enabled: settings.autoBackupEnabled, keep: settings.autoBackupKeep });
              await write(clearAllData);
              router.dismissTo('/');
              showUndo('All data deleted', () => write((txn) => repo.replaceAll(txn, previous)));
            } catch (e) {
              Alert.alert('Failed', String(e));
            }
          },
        },
      ],
    );

  return <LinkRow icon="trash-outline" label="Delete all data" onPress={confirm} />;
}

const CONFIRM_WORD = 'DELETE';

/**
 * Deletes the data AND every automatic backup on this phone: nothing left to restore except exported
 * files. No undo, so a loud warning and the word DELETE to type.
 */
export function EraseEverythingRow() {
  const theme = useTheme();
  const { snapshot, write } = useData();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const backups = open ? listLocalBackups().length : 0;

  const close = () => {
    setOpen(false);
    setTyped('');
  };

  const erase = async () => {
    setBusy(true);
    try {
      await write(clearAllData);
      // After the data: if clearing failed, the backups are still there.
      deleteAllLocalBackups();
      close();
      router.dismissTo('/');
    } catch (e) {
      Alert.alert('Failed', String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <LinkRow icon="nuclear-outline" label="Erase data and backups" onPress={() => setOpen(true)} />
      <ModalCard visible={open} onClose={close}>
        <View style={styles.header}>
          <Ionicons name="warning" size={56} color={theme.negative} />
          <Text style={[styles.title, { color: theme.negative }]}>Erase everything?</Text>
        </View>
        <View style={[styles.warning, { borderColor: theme.negative }]}>
          <Text style={[styles.strong, { color: theme.negative }]}>THIS CANNOT BE UNDONE.</Text>
          <Text style={{ color: theme.text }}>
            It permanently deletes all your data ({snapshot.accounts.length} accounts, {snapshot.assets.length} investments, all their operations
            and prices) <Text style={styles.bold}>and all {backups} automatic backups on this phone</Text>.
          </Text>
          <Text style={{ color: theme.text }}>
            Nothing will be left to restore, except backup files you exported and saved elsewhere. Your settings are kept.
          </Text>
        </View>
        <Field label={`Type ${CONFIRM_WORD} to confirm`}>
          <Input value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} placeholder={CONFIRM_WORD} />
        </Field>
        <View style={styles.buttons}>
          <Button title="Cancel" variant="secondary" onPress={close} style={{ flex: 1 }} />
          <Button
            title="Erase everything"
            variant="danger"
            icon="trash"
            disabled={busy || typed.trim().toUpperCase() !== CONFIRM_WORD}
            onPress={erase}
            style={{ flex: 1 }}
          />
        </View>
      </ModalCard>
    </>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: space.sm, marginBottom: space.md },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  warning: { borderWidth: 2, borderRadius: radius.sm, padding: space.md, gap: space.sm, marginBottom: space.md },
  strong: { fontSize: 16, fontWeight: '800' },
  bold: { fontWeight: '700' },
  buttons: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
});
