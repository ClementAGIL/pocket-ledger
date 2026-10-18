import { Alert } from 'react-native';

import { authenticate, checkLockAvailable } from '@/security/LockGate';
import { useData } from '@/state/DataProvider';

import { Card, SectionTitle } from '../ui';
import { Footnote, settingsStyles, SwitchRow } from './rows';

/** App lock and "hide amounts". */
export function PrivacySection() {
  const { settings, updateSettings } = useData();

  const toggleLock = async (enabled: boolean) => {
    if (enabled) {
      const problem = await checkLockAvailable();
      if (problem) return Alert.alert('Screen lock unavailable', problem);
    }
    // Ask for authentication both ways, so nobody can silently disable it.
    if (!(await authenticate(enabled ? 'Enable app lock' : 'Disable app lock'))) return;
    await updateSettings({ lockEnabled: enabled });
  };

  return (
    <>
      <SectionTitle>Privacy</SectionTitle>
      <Card style={settingsStyles.card}>
        <SwitchRow icon="finger-print" label="Lock with biometrics / PIN" value={settings.lockEnabled} onChange={toggleLock} />
        <SwitchRow
          icon="eye-off-outline"
          label="Hide amounts"
          value={settings.hideAmounts}
          onChange={(v) => updateSettings({ hideAmounts: v })}
        />
      </Card>
      <Footnote>
        All data stays on this phone. The app never connects to your banks, and only goes online if you turn on Online
        prices below and press its button.
      </Footnote>
    </>
  );
}
