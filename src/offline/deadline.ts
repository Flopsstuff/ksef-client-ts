/**
 * Offline invoice deadline calculation.
 *
 * All business-day arithmetic uses UTC methods (getUTCDay, setUTCDate).
 * KSeF deadlines are specified as calendar dates, not wall-clock times,
 * so UTC produces correct results for date-only calculations regardless
 * of the caller's timezone. The endOfDay() helper sets 23:59:59.999 UTC
 * as a conservative cutoff.
 */

import type { MaintenanceWindow, OfflineMode, OfflineReason } from './types.js';

const FAR_FUTURE = new Date('9999-12-31T23:59:59Z');

export function getDefaultReason(mode: OfflineMode): OfflineReason {
  switch (mode) {
    case 'offline24': return 'PLANNED';
    case 'offline': return 'SYSTEM_UNAVAILABLE';
    case 'awaryjny': return 'EMERGENCY';
    case 'awaria_calkowita': return 'TOTAL_FAILURE';
  }
}

export function nextBusinessDay(from: Date): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

export function addBusinessDays(from: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error(`days must be a non-negative integer, got ${days}`);
  }
  const d = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) {
      remaining--;
    }
  }
  return d;
}

function endOfDay(d: Date): Date {
  const result = new Date(d);
  result.setUTCHours(23, 59, 59, 999);
  return result;
}

function getMaintenanceEndFallback(mw: MaintenanceWindow): Date {
  if (mw.endTime) {
    return new Date(mw.endTime);
  }
  const start = new Date(mw.startTime);
  start.setUTCDate(start.getUTCDate() + 7);
  return start;
}

/**
 * Calculate submission deadline for offline invoice.
 *
 * - offline24: next business day after invoiceDate
 * - offline: next business day after maintenance window ends
 * - awaryjny: 7 business days after maintenance window ends
 * - awaria_calkowita: far-future (obligation suspended)
 */
export function calculateOfflineDeadline(
  mode: OfflineMode,
  invoiceDate: Date | string,
  maintenanceWindow?: MaintenanceWindow,
): Date {
  const date = typeof invoiceDate === 'string' ? new Date(invoiceDate) : invoiceDate;

  switch (mode) {
    case 'offline24': {
      return endOfDay(nextBusinessDay(date));
    }
    case 'offline': {
      const base = maintenanceWindow ? getMaintenanceEndFallback(maintenanceWindow) : date;
      return endOfDay(nextBusinessDay(base));
    }
    case 'awaryjny': {
      const base = maintenanceWindow ? getMaintenanceEndFallback(maintenanceWindow) : date;
      return endOfDay(addBusinessDays(base, 7));
    }
    case 'awaria_calkowita': {
      return new Date(FAR_FUTURE);
    }
  }
}

/**
 * Extend deadline when a new maintenance window cascades.
 * Returns the new deadline if maintenance ends after current deadline, otherwise keeps current.
 */
export function extendDeadlineForMaintenance(
  currentDeadline: Date | string,
  maintenanceWindow: MaintenanceWindow,
  mode: OfflineMode = 'awaryjny',
): Date {
  const current = typeof currentDeadline === 'string' ? new Date(currentDeadline) : new Date(currentDeadline);
  const mwEnd = getMaintenanceEndFallback(maintenanceWindow);

  if (mwEnd.getTime() > current.getTime()) {
    switch (mode) {
      case 'offline24':
      case 'offline':
        return endOfDay(nextBusinessDay(mwEnd));
      case 'awaryjny':
        return endOfDay(addBusinessDays(mwEnd, 7));
      case 'awaria_calkowita':
        return new Date(FAR_FUTURE);
    }
  }
  return current;
}

export function isExpired(submitBy: Date | string): boolean {
  const deadline = typeof submitBy === 'string' ? new Date(submitBy) : submitBy;
  return Date.now() > deadline.getTime();
}

export function getTimeUntilDeadline(submitBy: Date | string): number {
  const deadline = typeof submitBy === 'string' ? new Date(submitBy) : submitBy;
  return Math.max(0, deadline.getTime() - Date.now());
}
