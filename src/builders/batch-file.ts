import * as crypto from 'node:crypto';
import type { BatchFileInfo, BatchPartStreamSendingInfo } from '../models/sessions/batch-types.js';
import type { CompressionType, FileMetadata } from '../models/common.js';
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
  /** Compression type of the supplied archive bytes (KSeF API v2.6.0). Default: `Zip`. */
  compressionType?: CompressionType;
}

export interface BatchFileBuildResult {
  /** Metadata for OpenBatchSessionRequest.batchFile. */
  batchFile: BatchFileInfo;
  /** Encrypted parts ready for upload, indexed 0..N-1. */
  encryptedParts: Uint8Array[];
}

export interface BatchStreamBuildResult {
  /** Metadata for OpenBatchSessionRequest.batchFile. */
  batchFile: BatchFileInfo;
  /** Stream-based encrypted parts ready for upload. */
  streamParts: BatchPartStreamSendingInfo[];
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
        ...(options?.compressionType && { compressionType: options.compressionType }),
        fileParts,
      },
      encryptedParts,
    };
  }
  /**
   * Stream-based variant: two-pass build from a stream factory.
   *
   * Pass 1: consume stream to compute ZIP hash.
   * Pass 2: re-create stream, split into parts, encrypt each, compute per-part metadata.
   *
   * @param zipStreamFactory - Factory that creates a fresh ReadableStream of the ZIP data
   * @param zipSize - Total ZIP byte size (from fs.stat or known in advance)
   * @param encryptStreamFn - Stream-to-stream AES-256-CBC encryption function
   * @param hashStreamFn - Stream-to-FileMetadata hashing function
   * @param options - Optional configuration
   */
  static async buildFromStream(
    zipStreamFactory: () => ReadableStream<Uint8Array>,
    zipSize: number,
    encryptStreamFn: (stream: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>,
    hashStreamFn: (stream: ReadableStream<Uint8Array>) => Promise<FileMetadata>,
    options?: BatchFileBuildOptions,
  ): Promise<BatchStreamBuildResult> {
    const maxPartSize = options?.maxPartSize ?? BATCH_MAX_PART_SIZE;

    if (maxPartSize <= 0) {
      throw new KSeFValidationError('maxPartSize must be a positive number');
    }
    if (zipSize === 0) {
      throw new KSeFValidationError('ZIP data must not be empty');
    }
    if (zipSize > BATCH_MAX_TOTAL_SIZE) {
      throw new KSeFValidationError(
        `ZIP size ${zipSize} exceeds maximum of ${BATCH_MAX_TOTAL_SIZE} bytes (5 GB)`,
      );
    }

    const partCount = Math.ceil(zipSize / maxPartSize);
    if (partCount > BATCH_MAX_PARTS) {
      throw new KSeFValidationError(
        `Data requires ${partCount} parts, exceeding maximum of ${BATCH_MAX_PARTS}`,
      );
    }

    // Pass 1: hash the ZIP
    const zipMeta = await hashStreamFn(zipStreamFactory());

    // Pass 2: split, encrypt, and hash each part
    const fileParts: Array<{ ordinalNumber: number; fileSize: number; fileHash: string }> = [];
    const streamParts: BatchPartStreamSendingInfo[] = [];

    const reader = zipStreamFactory().getReader();
    let pending: Uint8Array[] = [];
    let pendingSize = 0;

    for (let partIndex = 0; partIndex < partCount; partIndex++) {
      // Accumulate up to maxPartSize bytes for this part
      const isLastPart = partIndex === partCount - 1;
      const targetSize = isLastPart
        ? zipSize - partIndex * maxPartSize
        : maxPartSize;

      while (pendingSize < targetSize) {
        const { done, value } = await reader.read();
        if (done) break;
        pending.push(value);
        pendingSize += value.byteLength;
      }

      const buffer = new Uint8Array(Buffer.concat(pending));
      const partData = buffer.subarray(0, targetSize);
      if (buffer.byteLength > targetSize) {
        const remainder = buffer.subarray(targetSize);
        pending = [remainder];
        pendingSize = remainder.byteLength;
      } else {
        pending = [];
        pendingSize = 0;
      }

      // Create a ReadableStream from the part data, pipe through encryption
      const partStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(partData);
          controller.close();
        },
      });
      const encryptedStream = encryptStreamFn(partStream);

      // Collect encrypted data to compute hash (per-part buffering, per design D5)
      const encryptedChunks: Uint8Array[] = [];
      const encReader = encryptedStream.getReader();
      for (;;) {
        const { done, value } = await encReader.read();
        if (done) break;
        encryptedChunks.push(value);
      }
      const encryptedData = new Uint8Array(Buffer.concat(encryptedChunks));
      const encryptedMeta = sha256Base64(encryptedData);

      fileParts.push({
        ordinalNumber: partIndex + 1,
        fileSize: encryptedData.byteLength,
        fileHash: encryptedMeta,
      });

      // Create a fresh stream from the encrypted data for upload
      const uploadStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encryptedData);
          controller.close();
        },
      });

      streamParts.push({
        dataStream: uploadStream,
        metadata: {
          hashSHA: encryptedMeta,
          fileSize: encryptedData.byteLength,
        },
        ordinalNumber: partIndex + 1,
      });
    }

    reader.releaseLock();

    return {
      batchFile: {
        fileSize: zipSize,
        fileHash: zipMeta.hashSHA,
        ...(options?.compressionType && { compressionType: options.compressionType }),
        fileParts,
      },
      streamParts,
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
