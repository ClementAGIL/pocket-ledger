import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { BackupSection } from '@/components/settings/BackupSection';
import { ComparisonSection } from '@/components/settings/ComparisonSection';
import { DeleteAllDataRow, EraseEverythingRow } from '@/components/settings/DeleteData';
import { DemoSection } from '@/components/settings/DemoSection';
import { DevSection } from '@/components/settings/DevSection';
import { OnlinePricesSection } from '@/components/settings/OnlinePricesSection';
import { PrivacySection } from '@/components/settings/PrivacySection';
import { ReminderSection } from '@/components/settings/ReminderSection';
import { LinkRow, settingsStyles } from '@/components/settings/rows';
import { Card, SectionTitle } from '@/components/ui';
import { useDataMode } from '@/state/DataMode';
import { space, useTheme } from '@/theme';

/** Settings: each section owns its logic, see src/components/settings/. */
export default function SettingsScreen() {
  const theme = useTheme();
  const { isDemo } = useDataMode();
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <PrivacySection />
      {/* Demo mode: the reminder and the backups belong to the real data. */}
      {!isDemo && <ReminderSection />}
      <ComparisonSection />
      <OnlinePricesSection />

      <SectionTitle>Data</SectionTitle>
      <Card style={settingsStyles.card}>
        <LinkRow icon="business-outline" label="Accounts" onPress={() => router.push('/accounts')} />
        <LinkRow icon="pricetags-outline" label="Categories" onPress={() => router.push('/categories')} />
        {/* The demo has its own "Reset demo data". */}
        {!isDemo && (
          <>
            <DeleteAllDataRow />
            <EraseEverythingRow />
          </>
        )}
      </Card>

      {!isDemo && <BackupSection />}

      <SectionTitle>Help</SectionTitle>
      <Card style={settingsStyles.card}>
        <LinkRow icon="sparkles-outline" label="Show the introduction" onPress={() => router.push('/onboarding')} />
      </Card>

      {__DEV__ && <DevSection />}
      {isDemo && <DemoSection />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl * 2 },
});
