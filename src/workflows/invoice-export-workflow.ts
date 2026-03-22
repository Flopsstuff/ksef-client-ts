import type { KSeFClient } from '../client.js';
import type { InvoiceQueryFilters } from '../models/invoices/types.js';
import type { ExportResult, PollOptions } from './types.js';
import { pollUntil } from './polling.js';

export interface ExportOptions {
  onlyMetadata?: boolean;
  pollOptions?: PollOptions;
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
