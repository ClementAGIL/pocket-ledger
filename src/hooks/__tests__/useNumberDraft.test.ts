import { draftText } from '../useNumberDraft';

describe('draftText', () => {
  it('leaves 0 empty, so the placeholder shows', () => {
    expect(draftText(0)).toBe('');
    expect(draftText(0, 100)).toBe('');
  });

  it('scales percents and rounds to the decimals', () => {
    expect(draftText(0.0525, 100)).toBe('5.25');
    expect(draftText(1234.567)).toBe('1234.57');
    expect(draftText(2083.33, 1, 0)).toBe('2083');
    expect(draftText(-1200)).toBe('-1200');
  });
});
