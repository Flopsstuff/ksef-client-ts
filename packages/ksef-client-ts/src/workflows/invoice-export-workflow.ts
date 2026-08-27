import type { KSeFClient } from '../client.js';
import type { EncryptionData } from '../models/crypto/types.js';
import type { InvoiceQueryFilters } from '../models/invoices/types.js';
import type { ExportDownloadResult, ExportExtractedResult, ExportResult, PollOptions } from './types.js';
import type { CompressionType } from '../models/common.js';
import type { UnzipOptions } from '../utils/zip.js';
import { unzip } from '../utils/zip.js';
import { extractTarGz } from '../utils/targz.js';
import { pollUntil } from './polling.js';
import { withKeyRotationRetry } from '../crypto/with-key-rotation-retry.js';
import { verifyHash } from '../utils/hash.js';

export interface ExportOptions {
  onlyMetadata?: boolean;
  pollOptions?: PollOptions;
  /** Compression type for the export package (KSeF API v2.6.0). Default: `Zip`. */
  compressionType?: CompressionType;
}

export interface ExportAndDownloadOptions extends ExportOptions {
  /** Custom fetch function for downloading parts (defaults to global fetch). */
  transport?: typeof fetch;
  /** When true, concatenate and extract the ZIP, returning named files. */
  extract?: boolean;
  /** Options for ZIP extraction safety limits (only used when extract is true). */
  unzipOptions?: UnzipOptions;
  /** Verify SHA-256 hash of encrypted parts after download. Defaults to true. */
  verifyHash?: boolean;
}

export async function doExport(
  client: KSeFClient,
  filters: InvoiceQueryFilters,
  options?: ExportOptions,
): Promise<{ result: ExportResult; encData: EncryptionData; referenceNumber: string }> {
  await client.crypto.init();

  const { encData, opResp } = await withKeyRotationRetry(client.crypto, async () => {
    const encData = await client.crypto.getEncryptionData();
    const opResp = await client.invoices.exportInvoices({
      encryption: encData.encryptionInfo,
      filters,
      onlyMetadata: options?.onlyMetadata,
      ...(options?.compressionType && { compressionType: options.compressionType }),
    });
    return { encData, opResp };
  });

  const result = await pollUntil(
    () => client.invoices.getInvoiceExportStatus(opResp.referenceNumber),
    (s) => s.status.code === 200 || s.status.code >= 400,
    { ...options?.pollOptions, description: `export ${opResp.referenceNumber}` },
  );

  if (result.status.code !== 200) {
    throw new Error(`Export failed: ${result.status.code} — ${result.status.description}`);
  }
  if (!result.package) {
    throw new Error('Export completed but no package available');
  }

  return {
    encData,
    referenceNumber: opResp.referenceNumber,
    result: {
      parts: result.package.parts.map((p) => ({
        ordinalNumber: p.ordinalNumber,
        url: p.url,
        method: p.method,
        partSize: p.partSize,
        partHash: p.partHash,
        encryptedPartSize: p.encryptedPartSize,
        encryptedPartHash: p.encryptedPartHash,
        expirationDate: p.expirationDate,
      })),
      invoiceCount: result.package.invoiceCount,
      isTruncated: result.package.isTruncated,
      permanentStorageHwmDate: result.package.permanentStorageHwmDate,
      lastPermanentStorageDate: result.package.lastPermanentStorageDate,
      compressionType: result.package.compressionType,
    },
  };
}

export async function exportInvoices(
  client: KSeFClient,
  filters: InvoiceQueryFilters,
  options?: ExportOptions,
): Promise<ExportResult> {
  const { result } = await doExport(client, filters, options);
  return result;
}

export async function exportAndDownload(
  client: KSeFClient,
  filters: InvoiceQueryFilters,
  options: ExportAndDownloadOptions & { extract: true },
): Promise<ExportExtractedResult>;
export async function exportAndDownload(
  client: KSeFClient,
  filters: InvoiceQueryFilters,
  options?: ExportAndDownloadOptions,
): Promise<ExportDownloadResult>;
export async function exportAndDownload(
  client: KSeFClient,
  filters: InvoiceQueryFilters,
  options?: ExportAndDownloadOptions,
): Promise<ExportDownloadResult | ExportExtractedResult> {
  const { result: exportResult, encData } = await doExport(client, filters, options);

  const download = options?.transport ?? fetch;
  const decryptedParts: Uint8Array[] = [];

  for (const part of exportResult.parts) {
    const resp = await download(part.url, { method: part.method });
    if (!resp.ok) {
      throw new Error(`Download failed for part ${part.ordinalNumber}: HTTP ${resp.status}`);
    }
    const encryptedData = new Uint8Array(await resp.arrayBuffer());
    if (options?.verifyHash !== false && !verifyHash(encryptedData, part.encryptedPartHash)) {
      throw new Error(`Hash mismatch for export part ${part.ordinalNumber}`);
    }
    const decrypted = client.crypto.decryptAES256(encryptedData, encData.cipherKey, encData.cipherIv);
    decryptedParts.push(decrypted);
  }

  if (options?.extract) {
    const archiveBuffer = Buffer.concat(decryptedParts);
    // The extractor is chosen by the caller-requested compression type, not by the
    // actual format of the returned package: the KSeF export status response
    // (InvoiceExportStatusResponse / InvoicePackage) carries no compression-type field,
    // so the server does not report which format it actually produced. The caller MUST
    // pass the same `compressionType` here that was used to request the export
    // (defaults to Zip). If a mismatch occurs, extraction will fail.
    const files = options.compressionType === 'TarGz'
      ? await extractTarGz(archiveBuffer, options.unzipOptions)
      : await unzip(archiveBuffer, options.unzipOptions);
    return { ...exportResult, files };
  }

  return {
    ...exportResult,
    decryptedParts,
  };
}
