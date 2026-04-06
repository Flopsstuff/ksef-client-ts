import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportInvoices, exportAndDownload } from '../../../src/workflows/invoice-export-workflow.js';
import type { InvoiceQueryFilters } from '../../../src/models/invoices/types.js';
import { sha256Base64 } from '../../../src/utils/hash.js';

function createMockClient() {
  return {
    crypto: {
      init: vi.fn(),
      getEncryptionData: vi.fn().mockReturnValue({
        encryptionInfo: { encryptedSymmetricKey: 'enc-key', initializationVector: 'iv' },
        cipherKey: new Uint8Array(32),
        cipherIv: new Uint8Array(16),
      }),
      decryptAES256: vi.fn().mockReturnValue(new Uint8Array([0x50, 0x4b, 0x03, 0x04])),
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

  it('polls through intermediate code 150 until 200', async () => {
    let call = 0;
    client.invoices.getInvoiceExportStatus.mockImplementation(async () => {
      call++;
      if (call === 1) return { status: { code: 100, description: 'Pending' } };
      if (call === 2) return { status: { code: 150, description: 'Processing' } };
      return {
        status: { code: 200, description: 'OK' },
        package: { invoiceCount: 5, size: 500, isTruncated: false, parts: [] },
      };
    });
    const result = await exportInvoices(client, filters, { pollOptions: { intervalMs: 1, maxAttempts: 10 } });
    expect(client.invoices.getInvoiceExportStatus).toHaveBeenCalledTimes(3);
    expect(result.invoiceCount).toBe(5);
  });
});

describe('exportAndDownload', () => {
  it('exports, downloads all parts, and decrypts them', async () => {
    const encryptedBytes = new Uint8Array([99, 99, 99]);
    const mockTransport = vi.fn().mockImplementation(async () =>
      new Response(encryptedBytes.slice().buffer, { status: 200 }),
    );

    const result = await exportAndDownload(client, filters, {
      pollOptions: { intervalMs: 1 },
      transport: mockTransport,
      verifyHash: false,
    });

    expect(mockTransport).toHaveBeenCalledTimes(2);
    expect(mockTransport).toHaveBeenCalledWith('https://download.example.com/1', { method: 'GET' });
    expect(mockTransport).toHaveBeenCalledWith('https://download.example.com/2', { method: 'GET' });
    expect(client.crypto.decryptAES256).toHaveBeenCalledTimes(2);
    expect(result.decryptedParts).toHaveLength(2);
    expect(result.decryptedParts[0]).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
    expect(result.invoiceCount).toBe(10);
    expect(result.parts).toHaveLength(2);
  });

  it('throws on download failure', async () => {
    const mockTransport = vi.fn().mockResolvedValue(
      new Response('Not Found', { status: 404 }),
    );

    await expect(
      exportAndDownload(client, filters, {
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      }),
    ).rejects.toThrow('Download failed for part 1: HTTP 404');
  });

  it('passes encryption keys from getEncryptionData to decryptAES256', async () => {
    const mockTransport = vi.fn().mockImplementation(async () =>
      new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }),
    );

    await exportAndDownload(client, filters, {
      pollOptions: { intervalMs: 1 },
      transport: mockTransport,
      verifyHash: false,
    });

    const encData = client.crypto.getEncryptionData();
    expect(client.crypto.decryptAES256).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      encData.cipherKey,
      encData.cipherIv,
    );
  });

  it('throws on hash mismatch when verifyHash is enabled', async () => {
    const mockTransport = vi.fn().mockImplementation(async () =>
      new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }),
    );

    await expect(
      exportAndDownload(client, filters, {
        pollOptions: { intervalMs: 1 },
        transport: mockTransport,
      }),
    ).rejects.toThrow('Hash mismatch for export part 1');
  });

  it('passes when encrypted data hash matches encryptedPartHash', async () => {
    const encryptedBytes = new Uint8Array([99, 99, 99]);
    const correctHash = sha256Base64(encryptedBytes);

    client.invoices.getInvoiceExportStatus.mockResolvedValue({
      status: { code: 200, description: 'OK' },
      package: {
        invoiceCount: 1,
        size: 100,
        isTruncated: false,
        parts: [{
          ordinalNumber: 1,
          partName: 'part-1.zip',
          method: 'GET',
          url: 'https://download.example.com/1',
          partSize: 3,
          partHash: 'ph',
          encryptedPartSize: 3,
          encryptedPartHash: correctHash,
          expirationDate: '2025-12-31',
        }],
      },
    });

    const mockTransport = vi.fn().mockImplementation(async () =>
      new Response(encryptedBytes.slice().buffer, { status: 200 }),
    );

    const result = await exportAndDownload(client, filters, {
      pollOptions: { intervalMs: 1 },
      transport: mockTransport,
    });

    expect(result.decryptedParts).toHaveLength(1);
  });
});
