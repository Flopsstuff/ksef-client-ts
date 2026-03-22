import type { KSeFClient } from '../client.js';
import type { InvoiceQueryFilters } from '../models/invoices/types.js';
import type { ExportDownloadResult, ExportResult, PollOptions } from './types.js';
import { pollUntil } from './polling.js';

export interface ExportOptions {
  onlyMetadata?: boolean;
  pollOptions?: PollOptions;
}

export interface ExportAndDownloadOptions extends ExportOptions {
  /** Custom fetch function for downloading parts (defaults to global fetch). */
  transport?: typeof fetch;
}

export async function exportInvoices(
  client: KSeFClient,
  filters: InvoiceQueryFilters,
  options?: ExportOptions,
): Promise<ExportResult> {
  await client.crypto.init();
  const encData = client.crypto.getEncryptionData();

  const opResp = await client.invoices.exportInvoices({
    encryption: encData.encryptionInfo,
    filters,
    onlyMetadata: options?.onlyMetadata,
  });

  const result = await pollUntil(
    () => client.invoices.getInvoiceExportStatus(opResp.referenceNumber),
    (s) => s.status.code !== 100,
    { ...options?.pollOptions, description: `export ${opResp.referenceNumber}` },
  );

  if (result.status.code !== 200) {
    throw new Error(`Export failed: ${result.status.code} — ${result.status.description}`);
  }
  if (!result.package) {
    throw new Error('Export completed but no package available');
  }

  return {
    parts: result.package.parts.map((p) => ({
      ordinalNumber: p.ordinalNumber,
      url: p.url,
      method: p.method,
      partSize: p.partSize,
      encryptedPartSize: p.encryptedPartSize,
      encryptedPartHash: p.encryptedPartHash,
      expirationDate: p.expirationDate,
    })),
    invoiceCount: result.package.invoiceCount,
    isTruncated: result.package.isTruncated,
    permanentStorageHwmDate: result.package.permanentStorageHwmDate,
  };
}

export async function exportAndDownload(
  client: KSeFClient,
  filters: InvoiceQueryFilters,
  options?: ExportAndDownloadOptions,
): Promise<ExportDownloadResult> {
  const encData = client.crypto.getEncryptionData();
  const exportResult = await exportInvoices(client, filters, options);

  const download = options?.transport ?? fetch;
  const decryptedParts: Uint8Array[] = [];

  for (const part of exportResult.parts) {
    const resp = await download(part.url, { method: part.method });
    if (!resp.ok) {
      throw new Error(`Download failed for part ${part.ordinalNumber}: HTTP ${resp.status}`);
    }
    const encryptedData = new Uint8Array(await resp.arrayBuffer());
    const decrypted = client.crypto.decryptAES256(encryptedData, encData.cipherKey, encData.cipherIv);
    decryptedParts.push(decrypted);
  }

  return {
    ...exportResult,
    decryptedParts,
  };
}
