import { describe, it, expect } from 'vitest';
import {
  calculateOfflineDeadline,
  extendDeadlineForMaintenance,
  nextBusinessDay,
  addBusinessDays,
  isExpired,
  getTimeUntilDeadline,
  getDefaultReason,
} from '../../../src/offline/deadline.js';
import type { MaintenanceWindow } from '../../../src/offline/types.js';

function mw(overrides: Partial<MaintenanceWindow> = {}): MaintenanceWindow {
  return {
    id: 'mw-1',
    startTime: '2026-04-06T10:00:00Z',
    active: false,
    planned: true,
    ...overrides,
  };
}

describe('getDefaultReason', () => {
  it('maps offline24 to PLANNED', () => {
    expect(getDefaultReason('offline24')).toBe('PLANNED');
  });
  it('maps offline to SYSTEM_UNAVAILABLE', () => {
    expect(getDefaultReason('offline')).toBe('SYSTEM_UNAVAILABLE');
  });
  it('maps awaryjny to EMERGENCY', () => {
    expect(getDefaultReason('awaryjny')).toBe('EMERGENCY');
  });
  it('maps awaria_calkowita to TOTAL_FAILURE', () => {
    expect(getDefaultReason('awaria_calkowita')).toBe('TOTAL_FAILURE');
  });
});

describe('nextBusinessDay', () => {
  it('returns next day for weekday (Wednesday → Thursday)', () => {
    const result = nextBusinessDay(new Date('2026-04-08T00:00:00Z'));
    expect(result.getUTCDay()).toBe(4); // Thursday
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-09');
  });

  it('skips weekend (Friday → Monday)', () => {
    const result = nextBusinessDay(new Date('2026-04-10T00:00:00Z'));
    expect(result.getUTCDay()).toBe(1); // Monday
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-13');
  });

  it('skips weekend (Saturday → Monday)', () => {
    const result = nextBusinessDay(new Date('2026-04-11T00:00:00Z'));
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-13');
  });

  it('skips weekend (Sunday → Monday)', () => {
    const result = nextBusinessDay(new Date('2026-04-12T00:00:00Z'));
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-13');
  });
});

describe('addBusinessDays', () => {
  it('adds 7 business days from Monday', () => {
    // Monday 2026-04-06 + 7bd = Mon 2026-04-15 (skips 2 weekends)
    const result = addBusinessDays(new Date('2026-04-06T00:00:00Z'), 7);
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-15');
  });

  it('adds 1 business day from Thursday', () => {
    const result = addBusinessDays(new Date('2026-04-09T00:00:00Z'), 1);
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-10');
  });

  it('adds 1 business day from Friday (skips weekend)', () => {
    const result = addBusinessDays(new Date('2026-04-10T00:00:00Z'), 1);
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-13');
  });

  it('adds 0 business days returns same date', () => {
    const result = addBusinessDays(new Date('2026-04-08T00:00:00Z'), 0);
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-08');
  });
});

describe('calculateOfflineDeadline', () => {
  describe('offline24', () => {
    it('returns next business day EOD for weekday (Wednesday)', () => {
      const result = calculateOfflineDeadline('offline24', '2026-04-08');
      expect(result.toISOString().slice(0, 10)).toBe('2026-04-09');
      expect(result.getUTCHours()).toBe(23);
    });

    it('skips weekend for Friday', () => {
      const result = calculateOfflineDeadline('offline24', '2026-04-10');
      expect(result.toISOString().slice(0, 10)).toBe('2026-04-13');
    });

    it('skips weekend for Saturday', () => {
      const result = calculateOfflineDeadline('offline24', '2026-04-11');
      expect(result.toISOString().slice(0, 10)).toBe('2026-04-13');
    });

    it('accepts Date object', () => {
      const result = calculateOfflineDeadline('offline24', new Date('2026-04-08T12:00:00Z'));
      expect(result.toISOString().slice(0, 10)).toBe('2026-04-09');
    });
  });

  describe('offline', () => {
    it('returns next business day after maintenance end', () => {
      const result = calculateOfflineDeadline('offline', '2026-04-01',
        mw({ endTime: '2026-04-07T14:00:00Z' })); // Tuesday
      expect(result.toISOString().slice(0, 10)).toBe('2026-04-08'); // Wednesday
    });

    it('uses 7-day fallback when no endTime', () => {
      const result = calculateOfflineDeadline('offline', '2026-04-01',
        mw({ startTime: '2026-04-06T10:00:00Z', endTime: undefined }));
      // fallback: 2026-04-06 + 7 days = 2026-04-13 (Monday) → next bd = 2026-04-14
      expect(result.toISOString().slice(0, 10)).toBe('2026-04-14');
    });

    it('falls back to invoiceDate when no maintenance window', () => {
      const result = calculateOfflineDeadline('offline', '2026-04-08');
      expect(result.toISOString().slice(0, 10)).toBe('2026-04-09');
    });
  });

  describe('awaryjny', () => {
    it('returns 7 business days after maintenance end', () => {
      // Monday 2026-04-06 endTime → +7bd = Mon 2026-04-15
      const result = calculateOfflineDeadline('awaryjny', '2026-04-01',
        mw({ endTime: '2026-04-06T10:00:00Z' }));
      expect(result.toISOString().slice(0, 10)).toBe('2026-04-15');
    });

    it('uses fallback when no endTime', () => {
      const result = calculateOfflineDeadline('awaryjny', '2026-04-01',
        mw({ startTime: '2026-04-06T10:00:00Z', endTime: undefined }));
      // fallback: 2026-04-06 + 7 = 2026-04-13 (Mon) → +7bd = Mon 2026-04-22
      expect(result.toISOString().slice(0, 10)).toBe('2026-04-22');
    });
  });

  describe('awaria_calkowita', () => {
    it('returns far-future date', () => {
      const result = calculateOfflineDeadline('awaria_calkowita', '2026-04-08');
      expect(result.getUTCFullYear()).toBe(9999);
    });

    it('is never expired', () => {
      const result = calculateOfflineDeadline('awaria_calkowita', '2026-04-08');
      expect(isExpired(result)).toBe(false);
    });
  });
});

describe('extendDeadlineForMaintenance', () => {
  it('extends deadline when maintenance ends after current', () => {
    const current = new Date('2026-04-10T23:59:59Z');
    const result = extendDeadlineForMaintenance(current,
      mw({ endTime: '2026-04-12T10:00:00Z' })); // Sunday
    // +7bd from Sunday 2026-04-12 → Mon 2026-04-21
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-21');
  });

  it('keeps current deadline when maintenance ends before', () => {
    const current = new Date('2026-04-15T23:59:59Z');
    const result = extendDeadlineForMaintenance(current,
      mw({ endTime: '2026-04-10T10:00:00Z' }));
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-15');
  });

  it('accepts string deadline', () => {
    const result = extendDeadlineForMaintenance('2026-04-10T23:59:59Z',
      mw({ endTime: '2026-04-12T10:00:00Z' }));
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-21');
  });

  it('extends to next business day for offline24 mode', () => {
    const current = new Date('2026-04-10T23:59:59Z');
    const result = extendDeadlineForMaintenance(current,
      mw({ endTime: '2026-04-12T10:00:00Z' }), 'offline24'); // Sunday
    // next bd after Sunday 2026-04-12 = Monday 2026-04-13
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-13');
  });

  it('extends to next business day for offline mode', () => {
    const current = new Date('2026-04-10T23:59:59Z');
    const result = extendDeadlineForMaintenance(current,
      mw({ endTime: '2026-04-12T10:00:00Z' }), 'offline');
    expect(result.toISOString().slice(0, 10)).toBe('2026-04-13');
  });

  it('extends to far future for awaria_calkowita mode', () => {
    const current = new Date('2026-04-10T23:59:59Z');
    const result = extendDeadlineForMaintenance(current,
      mw({ endTime: '2026-04-12T10:00:00Z' }), 'awaria_calkowita');
    expect(result.getUTCFullYear()).toBe(9999);
  });
});

describe('isExpired', () => {
  it('returns true for past date', () => {
    expect(isExpired('2020-01-01T00:00:00Z')).toBe(true);
  });

  it('returns false for future date', () => {
    expect(isExpired('2099-01-01T00:00:00Z')).toBe(false);
  });

  it('accepts Date object', () => {
    expect(isExpired(new Date('2020-01-01'))).toBe(true);
  });
});

describe('getTimeUntilDeadline', () => {
  it('returns 0 for past date', () => {
    expect(getTimeUntilDeadline('2020-01-01T00:00:00Z')).toBe(0);
  });

  it('returns positive for future date', () => {
    expect(getTimeUntilDeadline('2099-01-01T00:00:00Z')).toBeGreaterThan(0);
  });
});
