import type { KSeFClient } from '../client.js';
import type { InvoiceMetadata, InvoiceQueryFilters, InvoiceSubjectType } from '../models/invoices/types.js';
import type { ExportResult, PollOptions } from './types.js';
import type { ContinuationPackageRecord, ContinuationPoints } from './hwm-coordinator.js';
import type { HwmStore } from './hwm-storage.js';
import type { CompressionType } from '../models/common.js';
import { unzip } from '../utils/zip.js';
import { extractTarGz } from '../utils/targz.js';
import { doExport } from './invoice-export-workflow.js';
import { updateContinuationPoint, getEffectiveStartDate } from './hwm-coordinator.js';
import { verifyHash } from '../utils/hash.js';
import { downloadWithRetry, DEFAULT_PART_DOWNLOAD_TIMEOUT_MS } from '../http/download-with-retry.js';

export interface IncrementalExportOptions {
  subjectType: InvoiceSubjectType;
  windowFrom: string;
  windowTo: string;
  continuationPoints: ContinuationPoints;
  maxIterations?: number;
  filtersFactory?: (from: string, to: string) => InvoiceQueryFilters;
  pollOptions?: PollOptions;
  onlyMetadata?: boolean;
  transport?: typeof fetch;
  /** Per-attempt timeout for each part download, in ms. Default: 120000. */
  downloadTimeoutMs?: number;
  /** Verify SHA-256 hash of encrypted parts after download. Defaults to true. */
  verifyHash?: boolean;
  store?: HwmStore;
  onIterationComplete?: (iteration: number, result: ExportResult) => void;
}

export interface IncrementalExportResult {
  referenceNumbers: string[];
  /** Deduplicated invoice metadata. Empty until P3.2 (UPO Parsing) integrates metadata extraction. */
  invoices: InvoiceMetadata[];
  decryptedParts: Uint8Array[];
  continuationPoints: ContinuationPoints;
  iterationCount: number;
}

export async function incrementalExportAndDownload(
  client: KSeFClient,
  options: IncrementalExportOptions,
): Promise<IncrementalExportResult> {
  const maxIterations = options.maxIterations ?? 20;
  const points = options.continuationPoints;

  if (options.store) {
    const loaded = await options.store.load();
    for (const [key, value] of Object.entries(loaded)) {
      if (value !== undefined && points[key] === undefined) {
        points[key] = value;
      }
    }
  }

  const referenceNumbers: string[] = [];
  const decryptedParts: Uint8Array[] = [];
  let previousFrom: string | undefined;

  let iteration = 0;
  for (; iteration < maxIterations; iteration++) {
    const effectiveFrom = getEffectiveStartDate(points, options.subjectType, options.windowFrom);

    if (previousFrom !== undefined && effectiveFrom === previousFrom) {
      break;
    }
    previousFrom = effectiveFrom;

    const filters = options.filtersFactory
      ? options.filtersFactory(effectiveFrom, options.windowTo)
      : buildDefaultFilters(options.subjectType, effectiveFrom, options.windowTo);

    const { result, encData, referenceNumber } = await doExport(client, filters, {
      onlyMetadata: options.onlyMetadata,
      pollOptions: options.pollOptions,
    });

    referenceNumbers.push(referenceNumber);

    const iterationParts: Uint8Array[] = [];
    for (const part of result.parts) {
      const encryptedData = await downloadWithRetry(part.url, { method: part.method }, {
        transport: options.transport,
        timeoutMs: options.downloadTimeoutMs ?? DEFAULT_PART_DOWNLOAD_TIMEOUT_MS,
        label: `part ${part.ordinalNumber}`,
      });
      if (options.verifyHash !== false && !verifyHash(encryptedData, part.encryptedPartHash)) {
        throw new Error(`Hash mismatch for export part ${part.ordinalNumber}`);
      }
      const decrypted = client.crypto.decryptAES256(encryptedData, encData.cipherKey, encData.cipherIv);
      iterationParts.push(decrypted);
      decryptedParts.push(decrypted);
    }

    // A truncated package without lastPermanentStorageDate resumes from its
    // last record, which only the package's own _metadata.json lists. The
    // storage dates there only make sense as a resume point when the window is
    // filtered by storage date, so other date types get no records.
    const records = result.isTruncated
      && !result.lastPermanentStorageDate
      && filters.dateRange?.dateType === 'PermanentStorage'
      ? await readPackageRecords(iterationParts, result.compressionType)
      : undefined;

    updateContinuationPoint(points, options.subjectType, {
      isTruncated: result.isTruncated,
      lastPermanentStorageDate: result.lastPermanentStorageDate,
      permanentStorageHwmDate: result.permanentStorageHwmDate,
    }, records);

    if (options.store) {
      await options.store.save(points);
    }

    options.onIterationComplete?.(iteration, result);

    if (!result.isTruncated) {
      iteration++;
      break;
    }
  }

  return {
    referenceNumbers,
    invoices: [],
    decryptedParts,
    continuationPoints: points,
    iterationCount: iteration,
  };
}

/**
 * Reads the invoice records from the `_metadata.json` of one decrypted export
 * package (its parts concatenated form a single archive). Returns an empty list
 * when the package has no archive or no metadata file.
 */
async function readPackageRecords(
  parts: Uint8Array[],
  compressionType: CompressionType | undefined,
): Promise<ContinuationPackageRecord[]> {
  const archive = Buffer.concat(parts);
  if (archive.length === 0) return [];
  const files = compressionType === 'TarGz' ? await extractTarGz(archive) : await unzip(archive);
  for (const [name, content] of files) {
    if (name.split('/').pop()?.toLowerCase() !== '_metadata.json') continue;
    const parsed = JSON.parse(content.toString('utf-8')) as { invoices?: unknown };
    return Array.isArray(parsed.invoices) ? (parsed.invoices as ContinuationPackageRecord[]) : [];
  }
  return [];
}

function buildDefaultFilters(
  subjectType: InvoiceSubjectType,
  from: string,
  to: string,
): InvoiceQueryFilters {
  return {
    subjectType,
    dateRange: {
      dateType: 'PermanentStorage',
      from,
      to,
      // Enables the HWM mechanism: KSeF caps the range at PermanentStorageHwmDate,
      // the point the next window resumes from, so windows stay adjacent.
      restrictToPermanentStorageHwmDate: true,
    },
  };
}
