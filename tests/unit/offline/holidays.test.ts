import { describe, it, expect } from 'vitest';
import {
  computeEasterSunday,
  getPolishHolidays,
  isPolishHoliday,
} from '../../../src/offline/holidays.js';

describe('computeEasterSunday', () => {
  const knownDates: [number, string][] = [
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
    [2029, '2029-04-01'],
    [2030, '2030-04-21'],
  ];

  it.each(knownDates)('returns correct date for %i', (year, expected) => {
    const result = computeEasterSunday(year);
    expect(result.toISOString().slice(0, 10)).toBe(expected);
  });

  it('returns a Sunday', () => {
    for (let y = 2020; y <= 2035; y++) {
      expect(computeEasterSunday(y).getUTCDay()).toBe(0);
    }
  });
});

describe('getPolishHolidays', () => {
  it('returns 14 holidays for 2026 (includes Wigilia since 2025)', () => {
    expect(getPolishHolidays(2026).size).toBe(14);
  });

  it('returns 13 holidays for 2024 (before Wigilia amendment)', () => {
    expect(getPolishHolidays(2024).size).toBe(13);
  });

  it('includes all fixed holidays', () => {
    const holidays = getPolishHolidays(2026);
    expect(holidays.has('2026-01-01')).toBe(true); // Nowy Rok
    expect(holidays.has('2026-01-06')).toBe(true); // Trzech Kroli
    expect(holidays.has('2026-05-01')).toBe(true); // Swieto Pracy
    expect(holidays.has('2026-05-03')).toBe(true); // Konstytucja
    expect(holidays.has('2026-08-15')).toBe(true); // Wniebowziecie
    expect(holidays.has('2026-11-01')).toBe(true); // Wszystkich Swietych
    expect(holidays.has('2026-11-11')).toBe(true); // Niepodleglosc
    expect(holidays.has('2026-12-25')).toBe(true); // Boze Narodzenie 1
    expect(holidays.has('2026-12-26')).toBe(true); // Boze Narodzenie 2
  });

  it('includes moveable holidays for 2026 (Easter Apr 5)', () => {
    const holidays = getPolishHolidays(2026);
    expect(holidays.has('2026-04-05')).toBe(true); // Easter Sunday
    expect(holidays.has('2026-04-06')).toBe(true); // Easter Monday
    expect(holidays.has('2026-05-24')).toBe(true); // Pentecost (Easter + 49)
    expect(holidays.has('2026-06-04')).toBe(true); // Corpus Christi (Easter + 60)
  });

  it('includes moveable holidays for 2025 (Easter Apr 20)', () => {
    const holidays = getPolishHolidays(2025);
    expect(holidays.has('2025-04-20')).toBe(true); // Easter Sunday
    expect(holidays.has('2025-04-21')).toBe(true); // Easter Monday
    expect(holidays.has('2025-06-08')).toBe(true); // Pentecost (Easter + 49)
    expect(holidays.has('2025-06-19')).toBe(true); // Corpus Christi
  });

  it('returns cached instance on repeated calls', () => {
    const a = getPolishHolidays(2026);
    const b = getPolishHolidays(2026);
    expect(a).toBe(b);
  });

  it('returns correct holiday count for a range of years', () => {
    for (let y = 2020; y <= 2024; y++) {
      expect(getPolishHolidays(y).size).toBe(13);
    }
    for (let y = 2025; y <= 2035; y++) {
      expect(getPolishHolidays(y).size).toBe(14);
    }
  });

  it('includes Wigilia (Dec 24) for 2025+', () => {
    expect(getPolishHolidays(2025).has('2025-12-24')).toBe(true);
    expect(getPolishHolidays(2026).has('2026-12-24')).toBe(true);
  });

  it('does not include Wigilia (Dec 24) for 2024', () => {
    expect(getPolishHolidays(2024).has('2024-12-24')).toBe(false);
  });
});

describe('isPolishHoliday', () => {
  it('returns true for Christmas Day', () => {
    expect(isPolishHoliday(new Date('2026-12-25T00:00:00Z'))).toBe(true);
  });

  it('returns true for New Year', () => {
    expect(isPolishHoliday(new Date('2026-01-01T12:00:00Z'))).toBe(true);
  });

  it('returns true for Easter Monday 2026', () => {
    expect(isPolishHoliday(new Date('2026-04-06T00:00:00Z'))).toBe(true);
  });

  it('returns true for Corpus Christi 2026', () => {
    expect(isPolishHoliday(new Date('2026-06-04T00:00:00Z'))).toBe(true);
  });

  it('returns false for a regular weekday', () => {
    expect(isPolishHoliday(new Date('2026-03-10T00:00:00Z'))).toBe(false);
  });

  it('returns true for Christmas Eve 2026 (statutory since 2025)', () => {
    expect(isPolishHoliday(new Date('2026-12-24T00:00:00Z'))).toBe(true);
  });

  it('returns false for Christmas Eve 2024 (before amendment)', () => {
    expect(isPolishHoliday(new Date('2024-12-24T00:00:00Z'))).toBe(false);
  });

  it('returns false for Dec 27', () => {
    expect(isPolishHoliday(new Date('2026-12-27T00:00:00Z'))).toBe(false);
  });
});
