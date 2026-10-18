import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useData } from '@/state/DataProvider';
import { space, useTheme } from '@/theme';

import { Button, ModalCard } from './ui';

/** What leaves the phone when fetching: shown everywhere the feature can be turned on. */
export const ONLINE_PRICES_PRIVACY =
  'Only the identifiers of your investments (tickers, ISINs, coin names) are sent to Yahoo Finance and CoinGecko, along with your IP address. Never amounts or quantities. Nothing is ever fetched automatically.';

/**
 * Entry point to online prices (Home sync icon, Update prices button): `open()` goes to the fetch
 * screen, or, while the feature is off, shows the intro. Render `intro` in the screen.
 */
export function useOnlinePricesEntry() {
  const { settings, updateSettings } = useData();
  const [introOpen, setIntroOpen] = useState(false);
  const enabled = settings.onlinePricesEnabled;
  const enable = async () => {
    setIntroOpen(false);
    await updateSettings({ onlinePricesEnabled: true });
    router.push('/fetch-prices');
  };
  return {
    enabled,
    open: () => (enabled ? router.push('/fetch-prices') : setIntroOpen(true)),
    intro: <OnlinePricesIntro visible={introOpen} onEnable={enable} onClose={() => setIntroOpen(false)} />,
  };
}

/** Discovery + consent for online prices, from the home header when the feature is off. */
export function OnlinePricesIntro({ visible, onEnable, onClose }: { visible: boolean; onEnable: () => void; onClose: () => void }) {
  const theme = useTheme();
  return (
    <ModalCard visible={visible} onClose={onClose} closeOnBackdrop>
      <View style={styles.title}>
        <Ionicons name="sync-outline" size={26} color={theme.primary} />
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', flex: 1 }}>Fetch prices online</Text>
      </View>
      <Text style={[styles.text, { color: theme.textSecondary }]}>
        Update the prices of your stocks, ETFs, funds, gold and crypto in one tap, instead of typing them.
      </Text>
      <View style={{ gap: space.xs }}>
        <Point icon="pricetag-outline" text="Uses each investment's identifier: GOOG, IWDA.AS, an ISIN, BTC, GC=F for gold…" />
        <Point icon="list-outline" text="You see old → new price for each one and choose what to save. You can undo." />
        <Point icon="swap-horizontal-outline" text="Prices in dollars or pounds are converted to euros." />
        <Point icon="shield-checkmark-outline" text={ONLINE_PRICES_PRIVACY} />
      </View>
      <Text style={{ color: theme.textMuted, fontSize: 12 }}>You can turn it off any time in Settings › Online prices.</Text>
      <View style={{ gap: space.sm }}>
        <Button title="Turn on and fetch" onPress={onEnable} />
        <Button title="Not now" variant="secondary" onPress={onClose} />
      </View>
    </ModalCard>
  );
}

function Point({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.point}>
      <Ionicons name={icon} size={16} color={theme.textSecondary} style={{ marginTop: 2 }} />
      <Text style={[styles.text, { color: theme.textSecondary, flex: 1, fontSize: 13 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  text: { fontSize: 14, lineHeight: 20 },
  point: { flexDirection: 'row', gap: space.sm },
});
