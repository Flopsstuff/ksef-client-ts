import type { KSeFClient } from '../client.js';
import type { EncryptionData } from '../models/crypto/types.js';
import type { InvoiceQueryFilters } from '../models/invoices/types.js';
import type { ExportDownloadResult, ExportExtractedResult, ExportResult, PollOptions } from './types.js';
import type { UnzipOptions } from '../utils/zip.js';
import { unzip } from '../utils/zip.js';
import { pollUntil } from './polling.js';
import { verifyHash } from '../utils/hash.js';

export interface ExportOptions {
  onlyMetadata?: boolean;
  pollOptions?: PollOptions;
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
  const encData = client.crypto.getEncryptionData();

  const opResp = await client.invoices.exportInvoices({
    encryption: encData.encryptionInfo,
    filters,
    onlyMetadata: options?.onlyMetadata,
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
    const zipBuffer = Buffer.concat(decryptedParts);
    const files = await unzip(zipBuffer, options.unzipOptions);
    return { ...exportResult, files };
  }

  return {
    ...exportResult,
    decryptedParts,
  };
}
