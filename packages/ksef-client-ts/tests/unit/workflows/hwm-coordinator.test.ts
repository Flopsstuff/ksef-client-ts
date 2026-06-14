import { describe, it, expect } from 'vitest';
import {
  updateContinuationPoint,
  getEffectiveStartDate,
  deduplicateByKsefNumber,
} from '../../../src/workflows/hwm-coordinator.js';
import type { ContinuationPoints } from '../../../src/workflows/hwm-coordinator.js';
import type { InvoiceExportPackage } from '../../../src/models/invoices/types.js';

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

  it('falls back to permanentStorageHwmDate when truncated but no lastPermanentStorageDate', () => {
    const points: ContinuationPoints = {};
    const pkg = makePkg({
      isTruncated: true,
      permanentStorageHwmDate: '2025-06-14T08:00:00Z',
    });

    updateContinuationPoint(points, 'subject', pkg);

    expect(points['subject']).toBe('2025-06-14T08:00:00Z');
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
