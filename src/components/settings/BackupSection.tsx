import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { listLocalBackups, safetyBackup } from '@/backup/autoBackup';
import { exportBackup, pickBackup, restoreBackup, unlockBackup } from '@/backup/backup';
import type { Snapshot } from '@/domain/types';
import { useData } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

import { PasswordModal } from '../PasswordModal';
import { Card, Chips, SectionTitle } from '../ui';
import { Footnote, LinkRow, settingsStyles, SwitchRow } from './rows';

const BACKUP_KEEP = [5, 10, 20].map((n) => ({ value: String(n), label: `${n} backups` }));

/** Export (optionally encrypted), restore from a file, automatic local backups. */
export function BackupSection() {
  const theme = useTheme();
  const { db, settings, updateSettings, refresh } = useData();
  const [passwordMode, setPasswordMode] = useState<'export' | 'import' | null>(null);
  const [encryptedText, setEncryptedText] = useState<string | null>(null);
  const backupOptions = { enabled: settings.autoBackupEnabled, keep: settings.autoBackupKeep };

  const confirmRestore = (data: Snapshot) =>
    Alert.alert(
      'Replace all data?',
      `The backup contains ${data.assets.length} investments and ${data.transactions.length} operations. Everything currently in the app will be replaced.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: async () => {
            await safetyBackup(db, 'before-restore', backupOptions);
            await restoreBackup(db, data);
            await refresh();
            Alert.alert('Backup restored');
          },
        },
      ],
    );

  const importFile = async () => {
    try {
      const picked = await pickBackup();
      if (!picked) return;
      if (picked.kind === 'plain') return confirmRestore(picked.data);
      setEncryptedText(picked.text);
      setPasswordMode('import');
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  const submitPassword = async (password: string | null, onProgress: (f: number) => void) => {
    if (passwordMode === 'export') {
      await exportBackup(db, password, onProgress);
    } else if (encryptedText && password) {
      // Throws WrongPasswordError: the modal shows it and stays open.
      const data = await unlockBackup(encryptedText, password, onProgress);
      setEncryptedText(null);
      // Let the modal close before the confirmation shows.
      setTimeout(() => confirmRestore(data), 300);
    }
  };

  return (
    <>
      <PasswordModal
        visible={passwordMode !== null}
        mode={passwordMode ?? 'export'}
        onSubmit={submitPassword}
        onClose={() => {
          setPasswordMode(null);
          setEncryptedText(null);
        }}
      />
      <SectionTitle>Backup</SectionTitle>
      <Card style={settingsStyles.card}>
        <LinkRow icon="share-outline" label="Export backup" onPress={() => setPasswordMode('export')} />
        <LinkRow icon="download-outline" label="Restore from a file" onPress={importFile} />
        <SwitchRow
          icon="time-outline"
          label="Automatic backups"
          value={settings.autoBackupEnabled}
          onChange={(v) => updateSettings({ autoBackupEnabled: v })}
        />
        {settings.autoBackupEnabled && (
          <View style={[settingsStyles.chipsRow, { borderColor: theme.border }]}>
            <Text style={{ color: theme.textSecondary, marginBottom: space.sm }}>Keep the last</Text>
            <Chips options={BACKUP_KEEP} value={String(settings.autoBackupKeep)} onChange={(v) => updateSettings({ autoBackupKeep: Number(v) })} />
          </View>
        )}
        <LinkRow
          icon="albums-outline"
          label={`Automatic backups on this phone (${listLocalBackups().length})`}
          onPress={() => router.push('/backups')}
        />
      </Card>
      <Footnote>
        Export: protect the file with a password (recommended): without it, nobody can open the backup. Automatic backups: made before the first
        change of each day and before any restore or reset; kept on this phone only, so they are lost if the app is uninstalled. Export regularly
        to protect against losing the phone.
      </Footnote>
    </>
  );
}
