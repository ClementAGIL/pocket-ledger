import { planPriceUpdates, relativeChange } from '../priceUpdates';

describe('planPriceUpdates', () => {
  it('keeps valid inputs, skips empty ones and flags invalid ones', () => {
    const { updates, invalid } = planPriceUpdates({ 1: '520,5', 2: '', 3: '  ', 4: 'abc', 5: '-3', 6: '1 234.5', 7: '0' });
    expect(updates).toEqual([
      { assetId: 1, price: 520.5 },
      { assetId: 6, price: 1234.5 },
      { assetId: 7, price: 0 },
    ]);
    expect([...invalid].sort()).toEqual([4, 5]);
  });
});

describe('relativeChange', () => {
  it('computes the change and handles missing or zero references', () => {
    expect(relativeChange(100, 110)).toBeCloseTo(0.1);
    expect(relativeChange(100, 90)).toBeCloseTo(-0.1);
    expect(relativeChange(null, 5)).toBeNull();
    expect(relativeChange(0, 5)).toBeNull();
  });
});
