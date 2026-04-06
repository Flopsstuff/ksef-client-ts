import type { KSeFClient } from '../client.js';
import type { InvoiceMetadata, InvoiceQueryFilters, InvoiceSubjectType } from '../models/invoices/types.js';
import type { ExportResult, PollOptions } from './types.js';
import type { ContinuationPoints } from './hwm-coordinator.js';
import type { HwmStore } from './hwm-storage.js';
import { doExport } from './invoice-export-workflow.js';
import { updateContinuationPoint, getEffectiveStartDate } from './hwm-coordinator.js';
import { verifyHash } from '../utils/hash.js';

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

    const download = options.transport ?? fetch;
    for (const part of result.parts) {
      const resp = await download(part.url, { method: part.method });
      if (!resp.ok) {
        throw new Error(`Download failed for part ${part.ordinalNumber}: HTTP ${resp.status}`);
      }
      const encryptedData = new Uint8Array(await resp.arrayBuffer());
      if (options.verifyHash !== false && !verifyHash(encryptedData, part.encryptedPartHash)) {
        throw new Error(`Hash mismatch for export part ${part.ordinalNumber}`);
      }
      const decrypted = client.crypto.decryptAES256(encryptedData, encData.cipherKey, encData.cipherIv);
      decryptedParts.push(decrypted);
    }

    updateContinuationPoint(points, options.subjectType, {
      isTruncated: result.isTruncated,
      lastPermanentStorageDate: result.lastPermanentStorageDate,
      permanentStorageHwmDate: result.permanentStorageHwmDate,
    });

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
    },
  };
}
