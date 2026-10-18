/*
 * Perceptual color distance, to warn when two categories get colors that are hard to tell apart
 * (they sit side by side in the allocation donut and the lists). OKLab Euclidean distance ×100:
 * the same scale as the palette validator, where 15 is the normal-vision floor between neighbours.
 */

export const MIN_DISTINCT_DISTANCE = 15;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** '#rrggbb' (or '#rgb') → OKLab [L, a, b]. Null when the string isn't a hex color. */
export function hexToOklab(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Perceptual distance ×100 (0 = identical). Infinity if a color can't be parsed. */
export function colorDistance(a: string, b: string): number {
  const x = hexToOklab(a);
  const y = hexToOklab(b);
  if (!x || !y) return Infinity;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
}

/** The most similar of `others` when it is too close to `color`, else null. */
export function tooSimilar<T extends { color: string }>(color: string, others: T[]): T | null {
  let closest: T | null = null;
  let best = Infinity;
  for (const o of others) {
    const d = colorDistance(color, o.color);
    if (d < best) {
      best = d;
      closest = o;
    }
  }
  return best < MIN_DISTINCT_DISTANCE ? closest : null;
}
