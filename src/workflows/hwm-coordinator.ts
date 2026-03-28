import type { InvoiceExportPackage } from '../models/invoices/types.js';

export type ContinuationPoints = Record<string, string | undefined>;

export function updateContinuationPoint(
  points: ContinuationPoints,
  subjectType: string,
  pkg: Pick<InvoiceExportPackage, 'isTruncated' | 'lastPermanentStorageDate' | 'permanentStorageHwmDate'>,
): void {
  if (pkg.isTruncated && pkg.lastPermanentStorageDate) {
    points[subjectType] = pkg.lastPermanentStorageDate;
  } else if (pkg.permanentStorageHwmDate) {
    points[subjectType] = pkg.permanentStorageHwmDate;
  } else {
    delete points[subjectType];
  }
}

export function getEffectiveStartDate(
  points: ContinuationPoints,
  subjectType: string,
  windowFrom: string,
): string {
  return points[subjectType] ?? windowFrom;
}

export function deduplicateByKsefNumber<T extends { ksefNumber: string }>(
  entries: T[],
): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = entry.ksefNumber.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
