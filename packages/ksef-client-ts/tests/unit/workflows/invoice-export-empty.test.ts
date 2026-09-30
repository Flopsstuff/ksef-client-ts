import { describe, it, expect, vi } from 'vitest';
import { exportAndDownload } from '../../../src/workflows/invoice-export-workflow.js';
import type { InvoiceQueryFilters } from '../../../src/models/invoices/types.js';

// Uses the real unzip/untar: an export window with no invoices must not reach them.
function clientWithEmptyPackage(parts: unknown[], compressionType: 'Zip' | 'TarGz' = 'Zip') {
  return {
    crypto: {
      init: vi.fn(),
      getEncryptionData: vi.fn().mockReturnValue({
        encryptionInfo: { encryptedSymmetricKey: 'enc-key', initializationVector: 'iv' },
        cipherKey: new Uint8Array(32),
        cipherIv: new Uint8Array(16),
      }),
      decryptAES256: vi.fn().mockReturnValue(new Uint8Array(0)),
    },
    invoices: {
      exportInvoices: vi.fn().mockResolvedValue({ referenceNumber: 'export-ref-empty' }),
      getInvoiceExportStatus: vi.fn().mockResolvedValue({
        status: { code: 200, description: 'OK' },
        package: {
          invoiceCount: 0,
          size: 0,
          isTruncated: false,
          compressionType,
          permanentStorageHwmDate: '2026-09-29T10:00:00Z',
          parts,
        },
      }),
    },
  } as any;
}

const filters: InvoiceQueryFilters = {
  subjectType: 'Subject2',
  dateRange: { dateType: 'PermanentStorage', from: '2026-09-01', restrictToPermanentStorageHwmDate: true },
};

describe('exportAndDownload with an empty export window', () => {
  it.each(['Zip', 'TarGz'] as const)('returns no files for a %s package without parts', async (compressionType) => {
    const client = clientWithEmptyPackage([], compressionType);

    const result = await exportAndDownload(client, filters, { pollOptions: { intervalMs: 1 }, extract: true });

    expect(result.files.size).toBe(0);
    expect(result.invoiceCount).toBe(0);
    expect(result.permanentStorageHwmDate).toBe('2026-09-29T10:00:00Z');
  });

  it('returns no files when the only part is empty', async () => {
    const client = clientWithEmptyPackage([{
      ordinalNumber: 1, partName: 'part-1.zip', method: 'GET', url: 'https://download.example.com/1',
      partSize: 0, partHash: 'h', encryptedPartSize: 0, encryptedPartHash: 'h', expirationDate: '2026-12-31',
    }]);
    const transport = vi.fn(async () => new Response(new Uint8Array(0), { status: 200 }));

    const result = await exportAndDownload(client, filters, {
      pollOptions: { intervalMs: 1 }, extract: true, transport, verifyHash: false,
    });

    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.files.size).toBe(0);
  });
});
