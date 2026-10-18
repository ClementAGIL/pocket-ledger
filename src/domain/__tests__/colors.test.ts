import { colorDistance, hexToOklab, tooSimilar } from '../colors';

describe('colors', () => {
  it('converts known colors to OKLab', () => {
    const white = hexToOklab('#ffffff')!;
    expect(white[0]).toBeCloseTo(1, 3);
    expect(Math.abs(white[1])).toBeLessThan(1e-3);
    expect(hexToOklab('#000')![0]).toBeCloseTo(0, 6);
    expect(hexToOklab('not a color')).toBeNull();
  });

  it('measures perceptual distance', () => {
    expect(colorDistance('#2a78d6', '#2a78d6')).toBe(0);
    // Validated neighbours (blue / orange) are far apart; two near-identical blues are not.
    expect(colorDistance('#2a78d6', '#eb6834')).toBeGreaterThan(15);
    expect(colorDistance('#2a78d6', '#2b7ad8')).toBeLessThan(2);
  });

  it('finds a category whose color is too close', () => {
    const others = [
      { name: 'ETF', color: '#2a78d6' },
      { name: 'Crypto', color: '#eda100' },
    ];
    expect(tooSimilar('#2c7bd9', others)?.name).toBe('ETF');
    expect(tooSimilar('#e34948', others)).toBeNull();
  });
});
