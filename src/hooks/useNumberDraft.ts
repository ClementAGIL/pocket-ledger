import { useState } from 'react';

import { parseNumber } from '@/domain/format';

/** Text shown for a saved number: empty for 0, at most `decimals` decimals. */
export function draftText(n: number, scale = 1, decimals = 2) {
  if (n === 0) return '';
  const f = 10 ** decimals;
  return String(Math.round(n * scale * f) / f);
}

/**
 * A number input kept as typed text: `value` is the live number (0 when empty or invalid),
 * divided by `scale` (100 for a percent field). Saving is up to the caller (usually on end editing).
 */
export type NumberDraft = ReturnType<typeof useNumberDraft>;

export function useNumberDraft(initial: number, { scale = 1, decimals = 2 }: { scale?: number; decimals?: number } = {}) {
  const [text, setText] = useState(() => draftText(initial, scale, decimals));
  const value = (parseNumber(text) ?? 0) / scale;
  const reset = (n: number) => setText(draftText(n, scale, decimals));
  return { text, setText, value, reset };
}
