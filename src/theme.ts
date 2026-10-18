import { useColorScheme } from 'react-native';

const light = {
  background: '#f4f4f2',
  surface: '#fcfcfb',
  surfaceAlt: '#efeeeb',
  border: '#e2e1dc',
  text: '#0b0b0b',
  textSecondary: '#52514e',
  textMuted: '#85847f',
  primary: '#2a78d6',
  onPrimary: '#ffffff',
  positive: '#0a7d3e',
  negative: '#c8322f',
  // Chart series (validated categorical slots 1 & 2).
  seriesValue: '#2a78d6',
  seriesInvested: '#eb6834',
  /** "What if" comparison line (validated categorical slot 3). */
  seriesBenchmark: '#1baf7a',
  grid: '#e2e1dc',
  // Price-update reminders. Status steps are fixed across themes; always paired with icon + label.
  staleMild: '#85847f',
  staleWarning: '#fab219',
  staleSerious: '#ec835a',
  staleCritical: '#d03b3b',
  // Categorical slots 1–5 of the validated palette, in fixed order (allocation chart).
  categorical: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'] as readonly string[],
  /** "Other" slice: neutral, never a hue. */
  categoricalOther: '#b5b4ae',
};

export type Theme = typeof light;

const dark: Theme = {
  background: '#0f0f0e',
  surface: '#1a1a19',
  surfaceAlt: '#252523',
  border: '#33332f',
  text: '#f0efec',
  textSecondary: '#c3c2b7',
  textMuted: '#8d8c84',
  primary: '#3987e5',
  onPrimary: '#ffffff',
  positive: '#3cc274',
  negative: '#f06a67',
  seriesValue: '#3987e5',
  seriesInvested: '#d95926',
  seriesBenchmark: '#199e70',
  grid: '#33332f',
  staleMild: '#8d8c84',
  staleWarning: '#fab219',
  staleSerious: '#ec835a',
  staleCritical: '#d03b3b',
  categorical: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
  categoricalOther: '#5d5c57',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16 } as const;
