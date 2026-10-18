import { PERIODS } from '@/domain/performance';
import { useData } from '@/state/DataProvider';

import { Segmented } from './ui';

/** Changes the app-wide period: every gain shown in the app follows it. */
export function PeriodSelector() {
  const { settings, updateSettings } = useData();
  return <Segmented options={PERIODS} value={settings.period} onChange={(period) => updateSettings({ period })} />;
}
