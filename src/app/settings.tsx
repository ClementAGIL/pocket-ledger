import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { BackupSection } from '@/components/settings/BackupSection';
import { ComparisonSection } from '@/components/settings/ComparisonSection';
import { DevSection } from '@/components/settings/DevSection';
import { OnlinePricesSection } from '@/components/settings/OnlinePricesSection';
import { PrivacySection } from '@/components/settings/PrivacySection';
import { ReminderSection } from '@/components/settings/ReminderSection';
import { LinkRow, settingsStyles } from '@/components/settings/rows';
import { Card, SectionTitle } from '@/components/ui';
import { space, useTheme } from '@/theme';

/** Settings: each section owns its logic, see src/components/settings/. */
export default function SettingsScreen() {
  const theme = useTheme();
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <PrivacySection />
      <ReminderSection />
      <ComparisonSection />
      <OnlinePricesSection />

      <SectionTitle>Data</SectionTitle>
      <Card style={settingsStyles.card}>
        <LinkRow icon="business-outline" label="Accounts" onPress={() => router.push('/accounts')} />
        <LinkRow icon="pricetags-outline" label="Categories" onPress={() => router.push('/categories')} />
      </Card>

      <BackupSection />
      {__DEV__ && <DevSection />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl * 2 },
});
