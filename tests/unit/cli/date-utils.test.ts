import { describe, it, expect } from 'vitest';
import { normalizeCliDate } from '../../../src/cli/date-utils.js';

describe('normalizeCliDate', () => {
  it('expands short date to start-of-day for "from"', () => {
    expect(normalizeCliDate('2026-03-01', 'from')).toBe('2026-03-01T00:00:00+00:00');
  });

  it('expands short date to end-of-day for "to"', () => {
    expect(normalizeCliDate('2026-03-01', 'to')).toBe('2026-03-01T23:59:59+00:00');
  });

  it('passes through full ISO-8601 datetime unchanged', () => {
    const full = '2026-03-01T12:30:00+00:00';
    expect(normalizeCliDate(full, 'from')).toBe(full);
    expect(normalizeCliDate(full, 'to')).toBe(full);
  });

  it('passes through ISO-8601 with non-UTC offset unchanged', () => {
    const withOffset = '2026-03-01T14:00:00+02:00';
    expect(normalizeCliDate(withOffset, 'from')).toBe(withOffset);
  });

  it('passes through ISO-8601 with Z suffix unchanged', () => {
    const withZ = '2026-03-01T00:00:00Z';
    expect(normalizeCliDate(withZ, 'from')).toBe(withZ);
  });
});
