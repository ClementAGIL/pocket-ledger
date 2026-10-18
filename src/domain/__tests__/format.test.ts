import { formatDuration } from '../format';

describe('formatDuration', () => {
  it('writes months and years in words', () => {
    expect(formatDuration(1)).toBe('1 month');
    expect(formatDuration(8)).toBe('8 months');
    expect(formatDuration(12)).toBe('1 year');
    expect(formatDuration(13)).toBe('1 year 1 month');
    expect(formatDuration(27)).toBe('2 years 3 months');
  });

  it('says "less than a month" for 0', () => {
    expect(formatDuration(0)).toBe('less than a month');
  });
});
