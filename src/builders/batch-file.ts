import * as crypto from 'node:crypto';
import type { BatchFileInfo } from '../models/sessions/batch-types.js';
import { KSeFValidationError } from '../errors/ksef-validation-error.js';

/** Maximum size of a single unencrypted batch part (100 MB). */
export const BATCH_MAX_PART_SIZE = 100_000_000;

/** Maximum total unencrypted ZIP size (5 GB). */
export const BATCH_MAX_TOTAL_SIZE = 5_000_000_000;

/** Maximum number of batch parts allowed by KSeF API. */
export const BATCH_MAX_PARTS = 50;

export interface BatchFileBuildOptions {
  /** Max unencrypted part size in bytes. Default: 100 MB. */
  maxPartSize?: number;
}

export interface BatchFileBuildResult {
  /** Metadata for OpenBatchSessionRequest.batchFile. */
  batchFile: BatchFileInfo;
  /** Encrypted parts ready for upload, indexed 0..N-1. */
  encryptedParts: Uint8Array[];
}

/**
 * Splits a ZIP file into parts, encrypts each part, and computes
 * all SHA-256 hashes required by the KSeF batch API.
 */
export class BatchFileBuilder {
  /**
   * Build batch file metadata and encrypted parts from a raw ZIP.
   *
   * @param zipBytes - Unencrypted ZIP data
   * @param encryptFn - AES-256-CBC encryption function (called per part)
   * @param options - Optional configuration
   */
  static build(
    zipBytes: Uint8Array,
    encryptFn: (part: Uint8Array) => Uint8Array,
    options?: BatchFileBuildOptions,
  ): BatchFileBuildResult {
    const maxPartSize = options?.maxPartSize ?? BATCH_MAX_PART_SIZE;

    if (maxPartSize <= 0) {
      throw new KSeFValidationError('maxPartSize must be a positive number');
    }

    if (zipBytes.length === 0) {
      throw new KSeFValidationError('ZIP data must not be empty');
    }
    if (zipBytes.length > BATCH_MAX_TOTAL_SIZE) {
      throw new KSeFValidationError(
        `ZIP size ${zipBytes.length} exceeds maximum of ${BATCH_MAX_TOTAL_SIZE} bytes (5 GB)`,
      );
    }

    const rawParts = splitBuffer(zipBytes, maxPartSize);

    if (rawParts.length > BATCH_MAX_PARTS) {
      throw new KSeFValidationError(
        `Data requires ${rawParts.length} parts, exceeding maximum of ${BATCH_MAX_PARTS}`,
      );
    }

    const zipHash = sha256Base64(zipBytes);

    const encryptedParts: Uint8Array[] = [];
    const fileParts = rawParts.map((raw, i) => {
      const encrypted = encryptFn(raw);
      encryptedParts.push(encrypted);
      return {
        ordinalNumber: i + 1,
        fileSize: encrypted.length,
        fileHash: sha256Base64(encrypted),
      };
    });

    return {
      batchFile: {
        fileSize: zipBytes.length,
        fileHash: zipHash,
        fileParts,
      },
      encryptedParts,
    };
  }
}

function splitBuffer(data: Uint8Array, maxPartSize: number): Uint8Array[] {
  if (data.length <= maxPartSize) {
    return [data];
  }
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < data.length; offset += maxPartSize) {
    parts.push(data.subarray(offset, Math.min(offset + maxPartSize, data.length)));
  }
  return parts;
}

function sha256Base64(data: Uint8Array): string {
  return crypto.createHash('sha256').update(data).digest('base64');
}
