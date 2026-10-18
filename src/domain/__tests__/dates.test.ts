import { addMonths, dayNumber, fromISODate, toISODate } from '../dates';

/** The previous Date-based implementation, kept as the reference. */
const referenceDayNumber = (date: string) => {
  const d = fromISODate(date);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
};

describe('dayNumber', () => {
  it('matches the Date-based reference on every day from 1990 to 2060', () => {
    for (let d = new Date(1990, 0, 1); d.getFullYear() < 2060; d.setDate(d.getDate() + 1)) {
      const iso = toISODate(d);
      if (dayNumber(iso) !== referenceDayNumber(iso)) throw new Error(`Mismatch on ${iso}`);
    }
  });

  it('counts days since 1970-01-01, across leap years', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2024-03-01') - dayNumber('2024-02-28')).toBe(2);
    expect(dayNumber('2023-03-01') - dayNumber('2023-02-28')).toBe(1);
    expect(dayNumber('2000-03-01') - dayNumber('2000-02-28')).toBe(2);
  });
});

describe('addMonths', () => {
  it('clamps to the end of shorter months', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2023-01-31', 1)).toBe('2023-02-28');
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
    expect(addMonths('2024-12-15', 1)).toBe('2025-01-15');
  });
});
