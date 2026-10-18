import type { InvoiceExportPackage } from '../models/invoices/types.js';
import { KSeFError } from '../errors/ksef-error.js';

export type ContinuationPoints = Record<string, string | undefined>;

/**
 * One record of an export package, as listed in the package's `_metadata.json`
 * (`InvoiceMetadata` satisfies it). Only the storage date matters here.
 */
export interface ContinuationPackageRecord {
  permanentStorageDate?: string | null;
}

/**
 * Moves the continuation point for `subjectType` past the given export package.
 *
 * A truncated package resumes from its last record: `lastPermanentStorageDate`
 * when KSeF reports it, otherwise the latest `permanentStorageDate` among
 * `records` (the package's `_metadata.json` entries). KSeF may omit the field,
 * and resuming from `permanentStorageHwmDate` instead would skip every invoice
 * between the last record and the HWM for good. If a truncated package gives
 * neither, the point is left as it was and a {@link KSeFError} is thrown, so the
 * export stops rather than reporting itself complete with a gap.
 *
 * A complete package moves the point to `permanentStorageHwmDate`, or clears it
 * when the HWM is absent.
 */
export function updateContinuationPoint(
  points: ContinuationPoints,
  subjectType: string,
  pkg: Pick<InvoiceExportPackage, 'isTruncated' | 'lastPermanentStorageDate' | 'permanentStorageHwmDate'>,
  records?: readonly ContinuationPackageRecord[],
): void {
  if (pkg.isTruncated) {
    const resumeFrom = pkg.lastPermanentStorageDate || latestPermanentStorageDate(records);
    if (!resumeFrom) {
      throw new KSeFError(
        `Export package for ${subjectType} is truncated but reports no last permanent storage date ` +
        'and lists no records to resume from; continuation point left unchanged',
      );
    }
    points[subjectType] = resumeFrom;
  } else if (pkg.permanentStorageHwmDate) {
    points[subjectType] = pkg.permanentStorageHwmDate;
  } else {
    delete points[subjectType];
  }
}

/**
 * Latest `permanentStorageDate` among the records, by instant rather than by
 * array order or string form (KSeF does not promise a sort order in
 * `_metadata.json`, and offsets may differ). The original string is returned,
 * keeping the server's precision. Unparseable values are ignored.
 */
function latestPermanentStorageDate(
  records: readonly ContinuationPackageRecord[] | undefined,
): string | undefined {
  let latest: { value: string; ms: number; fraction: string } | undefined;
  for (const record of records ?? []) {
    const value = record.permanentStorageDate;
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) continue;
    // Date.parse stops at milliseconds; KSeF sends up to 7 fractional digits,
    // so ties are broken on the full fraction.
    const fraction = (/\.(\d+)/.exec(value)?.[1] ?? '').padEnd(9, '0');
    if (!latest || ms > latest.ms || (ms === latest.ms && fraction > latest.fraction)) {
      latest = { value, ms, fraction };
    }
  }
  return latest?.value;
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
