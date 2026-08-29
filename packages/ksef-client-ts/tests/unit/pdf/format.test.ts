import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  formatNumber,
  formatDate,
  formatNip,
  formatPaymentForm,
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

  // TKwotowy is 18 digits with 2 after the point — wider than a double holds
  // exactly, so anything routed through Number is rewritten before it prints.
  it('prints an 18-digit amount exactly', () => {
    expect(formatMoney('9999999999999999.99')).toBe(
      `9${NBSP}999${NBSP}999${NBSP}999${NBSP}999${NBSP}999,99`,
    );
  });

  it('keeps the last złoty of a large amount', () => {
    expect(formatMoney('123456789012345.67')).toBe(
      `123${NBSP}456${NBSP}789${NBSP}012${NBSP}345,67`,
    );
  });

  it('rounds a third decimal half away from zero', () => {
    expect(formatMoney('0.145')).toBe('0,15');
    expect(formatMoney('0.144')).toBe('0,14');
    expect(formatMoney('-0.145')).toBe('-0,15');
  });

  it('carries the rounding into the integer part', () => {
    expect(formatMoney('9.999')).toBe('10,00');
  });

  it('does not print a negative zero', () => {
    expect(formatMoney('-0.00')).toBe('0,00');
    expect(formatMoney('-0.001')).toBe('0,00');
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

  it('prints a quantity too wide for a double exactly', () => {
    expect(formatNumber('12345678901234567.5')).toBe(
      `12${NBSP}345${NBSP}678${NBSP}901${NBSP}234${NBSP}567,5`,
    );
  });

  it('keeps every decimal the document carries', () => {
    expect(formatNumber('1.23456789')).toBe('1,23456789');
  });

  it('drops trailing zeros rather than forcing a scale', () => {
    expect(formatNumber('1234.500')).toBe(`1${NBSP}234,5`);
    expect(formatNumber('1234.000')).toBe(`1${NBSP}234`);
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

describe('formatPaymentForm', () => {
  it('decodes each known FormaPlatnosci code to its Polish label', () => {
    expect(formatPaymentForm('1')).toBe('Gotówka');
    expect(formatPaymentForm('6')).toBe('Przelew');
    expect(formatPaymentForm('7')).toBe('Mobilna');
  });

  it('tolerates surrounding whitespace', () => {
    expect(formatPaymentForm(' 6 ')).toBe('Przelew');
  });

  it('passes an unknown code through unchanged', () => {
    expect(formatPaymentForm('99')).toBe('99');
    expect(formatPaymentForm('')).toBe('');
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

  it('routes to the paymentForm formatter', () => {
    expect(applyFormat('6', 'paymentForm')).toBe('Przelew');
  });
});
