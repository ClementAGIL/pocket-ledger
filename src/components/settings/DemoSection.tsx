import { router } from 'expo-router';
import { Alert } from 'react-native';

import { resetWithDemoData } from '@/db/demo';
import { useDataMode } from '@/state/DataMode';
import { useData } from '@/state/DataProvider';

import { Card, SectionTitle } from '../ui';
import { Footnote, LinkRow, settingsStyles } from './rows';

/** Demo mode only: rebuild the demo portfolio, or go back to the real data (always confirmed). */
export function DemoSection() {
  const { switchTo } = useDataMode();
  const { write } = useData();

  const reset = async () => {
    try {
      await write(resetWithDemoData);
      router.dismissTo('/');
    } catch (e) {
      Alert.alert('Failed', String(e));
    }
  };

  const backToMyData = () =>
    Alert.alert('Back to your data?', 'Your own amounts will be on screen again. Changes made to the demo data are discarded.', [
      { text: 'Stay in demo', style: 'cancel' },
      { text: 'Show my data', style: 'destructive', onPress: () => switchTo('real') },
    ]);

  return (
    <>
      <SectionTitle>Demo data</SectionTitle>
      <Card style={settingsStyles.card}>
        <LinkRow icon="refresh-outline" label="Reset demo data" onPress={reset} />
        <LinkRow icon="person-circle-outline" label="Back to my data" onPress={backToMyData} />
      </Card>
      <Footnote>
        You are viewing a sample portfolio. Your own data is kept apart and unchanged. Automatic backups and reminders are paused
        until you go back to it.
      </Footnote>
    </>
  );
}
