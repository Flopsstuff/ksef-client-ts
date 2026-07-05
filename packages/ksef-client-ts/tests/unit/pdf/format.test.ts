import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  formatNumber,
  formatDate,
  formatNip,
  applyFormat,
} from '../../../src/pdf/format.js';

/**
 * The thousands separator is a non-breaking space (U+00A0), NOT an ASCII space.
 * Spelled as an escape so the assertions are unambiguous.
 */
const NBSP = ' ';

describe('formatMoney', () => {
  it('groups thousands with a non-breaking space and forces 2 decimals', () => {
    expect(formatMoney('1234.5')).toBe(`1${NBSP}234,50`);
  });

  it('formats a value below 1000 without a group separator', () => {
    expect(formatMoney('12.3')).toBe('12,30');
  });

  it('groups multiple thousands groups', () => {
    expect(formatMoney('1234567.8')).toBe(`1${NBSP}234${NBSP}567,80`);
  });

  it('preserves a negative sign in front of the grouped value', () => {
    expect(formatMoney('-1234.5')).toBe(`-1${NBSP}234,50`);
  });

  it('passes a non-numeric string through unchanged', () => {
    expect(formatMoney('abc')).toBe('abc');
  });

  it('returns an empty string unchanged', () => {
    expect(formatMoney('')).toBe('');
  });

  it('returns a whitespace-only string unchanged', () => {
    expect(formatMoney('   ')).toBe('   ');
  });
});

describe('formatNumber', () => {
  it('groups thousands but does not force decimals', () => {
    expect(formatNumber('1234.5')).toBe(`1${NBSP}234,5`);
  });

  it('omits the decimal part for an integer', () => {
    expect(formatNumber('1000')).toBe(`1${NBSP}000`);
  });

  it('preserves a negative sign', () => {
    expect(formatNumber('-1234.5')).toBe(`-1${NBSP}234,5`);
  });

  it('passes a non-numeric string through unchanged', () => {
    expect(formatNumber('abc')).toBe('abc');
  });

  it('returns an empty string unchanged', () => {
    expect(formatNumber('')).toBe('');
  });
});

describe('formatDate', () => {
  it('reformats an ISO date to DD.MM.YYYY', () => {
    expect(formatDate('2025-01-15')).toBe('15.01.2025');
  });

  it('reformats the date portion of a datetime', () => {
    expect(formatDate('2025-01-15T10:00:00Z')).toBe('15.01.2025');
  });

  it('passes a non-date string through unchanged', () => {
    expect(formatDate('not a date')).toBe('not a date');
  });
});

describe('formatNip', () => {
  it('inserts group separators into a 10-digit NIP', () => {
    expect(formatNip('5213003700')).toBe('521-300-37-00');
  });

  it('passes a wrong-length value through unchanged', () => {
    expect(formatNip('123')).toBe('123');
  });
});

describe('applyFormat', () => {
  it('returns the value unchanged when no formatter is named', () => {
    expect(applyFormat('1234.5', undefined)).toBe('1234.5');
  });

  it('returns the value unchanged for an unknown formatter name', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(applyFormat('1234.5', 'bogus' as any)).toBe('1234.5');
  });

  it('routes to the money formatter', () => {
    expect(applyFormat('1234.5', 'money')).toBe(`1${NBSP}234,50`);
  });

  it('routes to the number formatter', () => {
    expect(applyFormat('1234.5', 'number')).toBe(`1${NBSP}234,5`);
  });

  it('routes to the date formatter', () => {
    expect(applyFormat('2025-01-15', 'date')).toBe('15.01.2025');
  });

  it('routes to the nip formatter', () => {
    expect(applyFormat('5213003700', 'nip')).toBe('521-300-37-00');
  });
});
