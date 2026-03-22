import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportInvoices } from '../../../src/workflows/invoice-export-workflow.js';
import type { InvoiceQueryFilters } from '../../../src/models/invoices/types.js';

function createMockClient() {
  return {
    crypto: {
      init: vi.fn(),
      getEncryptionData: vi.fn().mockReturnValue({
        encryptionInfo: { encryptedSymmetricKey: 'enc-key', initializationVector: 'iv' },
        cipherKey: new Uint8Array(32),
        cipherIv: new Uint8Array(16),
      }),
    },
    invoices: {
      exportInvoices: vi.fn().mockResolvedValue({ referenceNumber: 'export-ref-1' }),
      getInvoiceExportStatus: vi.fn().mockResolvedValue({
        status: { code: 200, description: 'OK' },
        package: {
          invoiceCount: 10,
          size: 5000,
          isTruncated: false,
          permanentStorageHwmDate: '2025-01-01',
          parts: [
            {
              ordinalNumber: 1,
              partName: 'part-1.zip',
              method: 'GET',
              url: 'https://download.example.com/1',
              partSize: 2500,
              partHash: 'plain-hash-1',
              encryptedPartSize: 2600,
              encryptedPartHash: 'enc-hash-1',
              expirationDate: '2025-12-31',
            },
            {
              ordinalNumber: 2,
              partName: 'part-2.zip',
              method: 'GET',
              url: 'https://download.example.com/2',
              partSize: 2500,
              partHash: 'plain-hash-2',
              encryptedPartSize: 2600,
              encryptedPartHash: 'enc-hash-2',
              expirationDate: '2025-12-31',
            },
          ],
        },
      }),
    },
  } as any;
}

const filters: InvoiceQueryFilters = {
  subjectType: 'Subject1',
  dateRange: { dateType: 'Invoicing', from: '2025-01-01' },
};

let client: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  client = createMockClient();
});

describe('exportInvoices', () => {
  it('initiates export, polls, and returns parts', async () => {
    const result = await exportInvoices(client, filters, { pollOptions: { intervalMs: 1 } });
    expect(client.crypto.init).toHaveBeenCalled();
    expect(client.invoices.exportInvoices).toHaveBeenCalledWith(expect.objectContaining({
      encryption: expect.any(Object),
      filters,
    }));
    expect(result.parts).toHaveLength(2);
    expect(result.parts[0].url).toBe('https://download.example.com/1');
    expect(result.parts[1].encryptedPartHash).toBe('enc-hash-2');
    expect(result.invoiceCount).toBe(10);
    expect(result.isTruncated).toBe(false);
    expect(result.permanentStorageHwmDate).toBe('2025-01-01');
  });

  it('passes onlyMetadata option', async () => {
    await exportInvoices(client, filters, { onlyMetadata: true, pollOptions: { intervalMs: 1 } });
    expect(client.invoices.exportInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ onlyMetadata: true }),
    );
  });

  it('throws on non-200 status', async () => {
    client.invoices.getInvoiceExportStatus.mockResolvedValue({
      status: { code: 500, description: 'Server error' },
    });
    await expect(
      exportInvoices(client, filters, { pollOptions: { intervalMs: 1 } }),
    ).rejects.toThrow('Export failed: 500');
  });

  it('throws when no package in response', async () => {
    client.invoices.getInvoiceExportStatus.mockResolvedValue({
      status: { code: 200, description: 'OK' },
    });
    await expect(
      exportInvoices(client, filters, { pollOptions: { intervalMs: 1 } }),
    ).rejects.toThrow('Export completed but no package available');
  });

  it('polls past code 100', async () => {
    let call = 0;
    client.invoices.getInvoiceExportStatus.mockImplementation(async () => {
      call++;
      if (call < 3) return { status: { code: 100, description: 'Pending' } };
      return {
        status: { code: 200, description: 'OK' },
        package: { invoiceCount: 1, size: 100, isTruncated: false, parts: [] },
      };
    });
    const result = await exportInvoices(client, filters, { pollOptions: { intervalMs: 1, maxAttempts: 10 } });
    expect(client.invoices.getInvoiceExportStatus).toHaveBeenCalledTimes(3);
    expect(result.invoiceCount).toBe(1);
  });
});
