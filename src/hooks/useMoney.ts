import { formatEuro } from '@/domain/format';
import { useData } from '@/state/DataProvider';

type MoneyOptions = { signed?: boolean; rounded?: boolean };

/**
 * € formatting that respects "hide amounts", with the screen's default options
 * (`useMoney({ rounded: true })`). `hidden` is also returned for inputs (`secureTextEntry`) and charts.
 */
export function useMoney(defaults: MoneyOptions = {}) {
  const hidden = useData().settings.hideAmounts;
  const money = (value: number, opts: MoneyOptions = {}) => formatEuro(value, { ...defaults, ...opts, hidden });
  return { money, hidden };
}
