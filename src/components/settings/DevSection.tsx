import type { SQLiteDatabase } from 'expo-sqlite';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { safetyBackup } from '@/backup/autoBackup';
import { resetWithDemoData } from '@/db/demo';
import { useData } from '@/state/DataProvider';

import { Card, SectionTitle } from '../ui';
import { Footnote, LinkRow, settingsStyles } from './rows';

/** Development builds only: replace the current data with the demo data, confirmed and backed up first. */
export function DevSection() {
  const { db, snapshot, settings, write } = useData();

  const confirm = (title: string, action: (txn: SQLiteDatabase) => Promise<void>, reason: 'before-reset') =>
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
      </Card>
      <Footnote>Only visible in development builds. Demo data: ~5 years of history across every category. (Delete all data is in Settings › Data.)</Footnote>
    </>
  );
}
