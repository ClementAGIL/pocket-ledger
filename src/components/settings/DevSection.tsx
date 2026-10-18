import type { SQLiteDatabase } from 'expo-sqlite';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { safetyBackup } from '@/backup/autoBackup';
import { clearAllData, resetWithDemoData } from '@/db/demo';
import { useData } from '@/state/DataProvider';

import { Card, SectionTitle } from '../ui';
import { Footnote, LinkRow, settingsStyles } from './rows';

/** Development builds only: demo data and wiping everything, always confirmed and backed up first. */
export function DevSection() {
  const { db, snapshot, settings, write } = useData();

  const confirm = (title: string, action: (txn: SQLiteDatabase) => Promise<void>, reason: 'before-reset' | 'before-delete') =>
    Alert.alert(title, `This replaces everything currently in the app (${snapshot.assets.length} investments).`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: async () => {
          try {
            await safetyBackup(db, reason, { enabled: settings.autoBackupEnabled, keep: settings.autoBackupKeep });
            await write(action);
            router.dismissTo('/');
          } catch (e) {
            Alert.alert('Failed', String(e));
          }
        },
      },
    ]);

  return (
    <>
      <SectionTitle>Development</SectionTitle>
      <Card style={settingsStyles.card}>
        <LinkRow icon="flask-outline" label="Reset with demo data" onPress={() => confirm('Load demo data?', resetWithDemoData, 'before-reset')} />
        <LinkRow icon="trash-outline" label="Delete all data" onPress={() => confirm('Delete all data?', clearAllData, 'before-delete')} />
      </Card>
      <Footnote>Only visible in development builds. Demo data: ~5 years of history across every category.</Footnote>
    </>
  );
}
