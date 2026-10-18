import { Alert } from 'react-native';

import { ONLINE_PRICES_PRIVACY } from '@/components/OnlinePricesIntro';
import { useData } from '@/state/DataProvider';

import { Card, SectionTitle } from '../ui';
import { Footnote, settingsStyles, SwitchRow } from './rows';

/** Opt-in for the user-triggered price fetch: the only feature that uses the internet. */
export function OnlinePricesSection() {
  const { settings, updateSettings } = useData();

  const toggle = (enabled: boolean) => {
    if (!enabled) return updateSettings({ onlinePricesEnabled: false });
    Alert.alert(
      'Allow online prices?',
      `Prices are fetched only when you press "Fetch prices online". ${ONLINE_PRICES_PRIVACY}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Allow', onPress: () => updateSettings({ onlinePricesEnabled: true }) },
      ],
    );
  };

  return (
    <>
      <SectionTitle>Online prices</SectionTitle>
      <Card style={settingsStyles.card}>
        <SwitchRow icon="sync-outline" label="Fetch prices on request" value={settings.onlinePricesEnabled} onChange={toggle} />
      </Card>
      <Footnote>
        Adds &quot;Fetch prices online&quot; to Update prices. It only runs when you press it, and you review the prices before saving.
        Uses each investment&apos;s identifier: a ticker (GOOG, IWDA.AS for Amsterdam, CW8.PA for Paris), an ISIN, a coin for
        crypto (BTC, ethereum), or GC=F for gold per troy ounce. Prices in another currency are converted to euros.
      </Footnote>
    </>
  );
}
