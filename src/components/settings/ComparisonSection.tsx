import { useData } from '@/state/DataProvider';

import { Card, Chips, SectionTitle } from '../ui';
import { Footnote } from './rows';

const BENCHMARK_RATES = [
  { value: '0', label: 'Off' },
  { value: '0.02', label: '2%' },
  { value: '0.03', label: '3%' },
  { value: '0.04', label: '4%' },
  { value: '0.05', label: '5%' },
  { value: '0.07', label: '7%' },
];

/** Yearly rate of the "what if" line on the home chart. */
export function ComparisonSection() {
  const { settings, updateSettings } = useData();
  return (
    <>
      <SectionTitle>Comparison line</SectionTitle>
      <Card>
        <Chips options={BENCHMARK_RATES} value={String(settings.benchmarkRate)} onChange={(v) => updateSettings({ benchmarkRate: Number(v) })} />
      </Card>
      <Footnote>
        Shows on the home chart where your money would be if every euro you invested had earned this yearly rate instead (like a bond or a
        savings account).
      </Footnote>
    </>
  );
}
