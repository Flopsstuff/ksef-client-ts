import { describe, it, expect } from 'vitest';
import {
  updateContinuationPoint,
  getEffectiveStartDate,
  deduplicateByKsefNumber,
} from '../../../src/workflows/hwm-coordinator.js';
import type { ContinuationPoints } from '../../../src/workflows/hwm-coordinator.js';
import type { InvoiceExportPackage } from '../../../src/models/invoices/types.js';
import { KSeFError } from '../../../src/errors/ksef-error.js';

function makePkg(overrides: Partial<InvoiceExportPackage> = {}): InvoiceExportPackage {
  return {
    invoiceCount: 0,
    size: 0,
    parts: [],
    isTruncated: false,
    ...overrides,
  };
}

describe('updateContinuationPoint', () => {
  it('stores lastPermanentStorageDate when package is truncated', () => {
    const points: ContinuationPoints = {};
    const pkg = makePkg({
      isTruncated: true,
      lastPermanentStorageDate: '2025-06-15T10:00:00Z',
      permanentStorageHwmDate: '2025-06-14T08:00:00Z',
    });

    updateContinuationPoint(points, 'subject', pkg);

    expect(points['subject']).toBe('2025-06-15T10:00:00Z');
  });

  it('stores permanentStorageHwmDate when package is not truncated', () => {
    const points: ContinuationPoints = {};
    const pkg = makePkg({
      isTruncated: false,
      permanentStorageHwmDate: '2025-06-14T08:00:00Z',
    });

    updateContinuationPoint(points, 'subject', pkg);

    expect(points['subject']).toBe('2025-06-14T08:00:00Z');
  });

  // B2 — lastPermanentStorageDate is nullable; resuming a truncated package from
  // the HWM skipped every invoice between the package's last record and the HWM.
  describe('truncated package without lastPermanentStorageDate', () => {
    it('resumes from the last record, not from permanentStorageHwmDate', () => {
      const points: ContinuationPoints = {};
      const pkg = makePkg({
        isTruncated: true,
        permanentStorageHwmDate: '2025-06-20T08:00:00Z',
      });

      updateContinuationPoint(points, 'subject', pkg, [
        { permanentStorageDate: '2025-06-14T08:00:00Z' },
        { permanentStorageDate: '2025-06-15T09:30:00Z' },
      ]);

      expect(points['subject']).toBe('2025-06-15T09:30:00Z');
    });

    it('takes the latest instant, not the last array entry or the largest string', () => {
      const points: ContinuationPoints = {};

      updateContinuationPoint(points, 'subject', makePkg({ isTruncated: true }), [
        { permanentStorageDate: '2025-06-15T11:00:00+02:00' }, // 09:00Z — latest
        { permanentStorageDate: '2025-06-15T08:30:00Z' },
        { permanentStorageDate: '2025-06-15T10:00:00+05:00' }, // 05:00Z — largest string
        { permanentStorageDate: '2025-06-14T00:00:00Z' },
      ]);

      expect(points['subject']).toBe('2025-06-15T11:00:00+02:00');
    });

    it('breaks a millisecond tie on the full 7-digit fraction and keeps the server string', () => {
      const points: ContinuationPoints = {};

      updateContinuationPoint(points, 'subject', makePkg({ isTruncated: true }), [
        { permanentStorageDate: '2025-06-15T08:30:00.1234569+00:00' },
        { permanentStorageDate: '2025-06-15T08:30:00.1234561+00:00' },
      ]);

      expect(points['subject']).toBe('2025-06-15T08:30:00.1234569+00:00');
    });

    it('ignores records without a usable date', () => {
      const points: ContinuationPoints = {};

      updateContinuationPoint(points, 'subject', makePkg({ isTruncated: true }), [
        { permanentStorageDate: '2025-06-15T08:30:00Z' },
        { permanentStorageDate: null },
        {},
        { permanentStorageDate: 'not-a-date' },
      ]);

      expect(points['subject']).toBe('2025-06-15T08:30:00Z');
    });

    it('prefers lastPermanentStorageDate over the records when KSeF reports it', () => {
      const points: ContinuationPoints = {};
      const pkg = makePkg({
        isTruncated: true,
        lastPermanentStorageDate: '2025-06-15T10:00:00Z',
        permanentStorageHwmDate: '2025-06-20T08:00:00Z',
      });

      updateContinuationPoint(points, 'subject', pkg, [{ permanentStorageDate: '2025-06-16T00:00:00Z' }]);

      expect(points['subject']).toBe('2025-06-15T10:00:00Z');
    });

    it('ignores the records when the package is not truncated', () => {
      const points: ContinuationPoints = {};
      const pkg = makePkg({ isTruncated: false, permanentStorageHwmDate: '2025-06-20T08:00:00Z' });

      updateContinuationPoint(points, 'subject', pkg, [{ permanentStorageDate: '2025-06-15T00:00:00Z' }]);

      expect(points['subject']).toBe('2025-06-20T08:00:00Z');
    });

    it.each([
      ['no records argument', undefined],
      ['an empty record list', []],
      ['records without dates', [{}, { permanentStorageDate: null }]],
    ])('throws and leaves the point unchanged with %s, never jumping to the HWM', (_label, records) => {
      const points: ContinuationPoints = { subject: '2025-06-10T00:00:00Z' };
      const pkg = makePkg({ isTruncated: true, permanentStorageHwmDate: '2025-06-20T08:00:00Z' });

      expect(() => updateContinuationPoint(points, 'subject', pkg, records)).toThrow(KSeFError);
      expect(() => updateContinuationPoint(points, 'subject', pkg, records)).toThrow(/truncated/);
      expect(points['subject']).toBe('2025-06-10T00:00:00Z');
    });
  });

  it('deletes the entry when no HWM dates are present', () => {
    const points: ContinuationPoints = { subject: '2025-06-10T00:00:00Z' };
    const pkg = makePkg({ isTruncated: false });

    updateContinuationPoint(points, 'subject', pkg);

    expect(points).not.toHaveProperty('subject');
  });

  it('tracks multiple subject types independently', () => {
    const points: ContinuationPoints = {};

    updateContinuationPoint(
      points,
      'subject_authorized',
      makePkg({
        isTruncated: true,
        lastPermanentStorageDate: '2025-06-15T10:00:00Z',
      }),
    );
    updateContinuationPoint(
      points,
      'subject_other',
      makePkg({
        isTruncated: false,
        permanentStorageHwmDate: '2025-06-12T06:00:00Z',
      }),
    );

    expect(points['subject_authorized']).toBe('2025-06-15T10:00:00Z');
    expect(points['subject_other']).toBe('2025-06-12T06:00:00Z');
  });
});

describe('getEffectiveStartDate', () => {
  it('returns saved continuation point when it exists', () => {
    const points: ContinuationPoints = { subject: '2025-06-15T10:00:00Z' };

    const result = getEffectiveStartDate(points, 'subject', '2025-01-01T00:00:00Z');

    expect(result).toBe('2025-06-15T10:00:00Z');
  });

  it('returns windowFrom when no entry exists', () => {
    const points: ContinuationPoints = {};

    const result = getEffectiveStartDate(points, 'subject', '2025-01-01T00:00:00Z');

    expect(result).toBe('2025-01-01T00:00:00Z');
  });

  it('returns windowFrom when entry is undefined', () => {
    const points: ContinuationPoints = { subject: undefined };

    const result = getEffectiveStartDate(points, 'subject', '2025-01-01T00:00:00Z');

    expect(result).toBe('2025-01-01T00:00:00Z');
  });
});

describe('deduplicateByKsefNumber', () => {
  it('returns all entries when there are no duplicates', () => {
    const entries = [
      { ksefNumber: 'KSeF-001', amount: 100 },
      { ksefNumber: 'KSeF-002', amount: 200 },
      { ksefNumber: 'KSeF-003', amount: 300 },
    ];

    const result = deduplicateByKsefNumber(entries);

    expect(result).toEqual(entries);
    expect(result).toHaveLength(3);
  });

  it('removes duplicates and preserves first occurrence', () => {
    const entries = [
      { ksefNumber: 'KSeF-001', amount: 100 },
      { ksefNumber: 'KSeF-002', amount: 200 },
      { ksefNumber: 'KSeF-001', amount: 999 },
    ];

    const result = deduplicateByKsefNumber(entries);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ ksefNumber: 'KSeF-001', amount: 100 });
    expect(result[1]).toEqual({ ksefNumber: 'KSeF-002', amount: 200 });
  });

  it('matches ksefNumber case-insensitively', () => {
    const entries = [
      { ksefNumber: 'KSEF-ABC-123' },
      { ksefNumber: 'ksef-abc-123' },
      { ksefNumber: 'KSeF-ABC-123' },
    ];

    const result = deduplicateByKsefNumber(entries);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ ksefNumber: 'KSEF-ABC-123' });
  });

  it('returns empty array for empty input', () => {
    const result = deduplicateByKsefNumber([]);

    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });
});
