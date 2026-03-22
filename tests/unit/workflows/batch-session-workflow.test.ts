import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadBatch } from '../../../src/workflows/batch-session-workflow.js';

function createMockClient() {
  return {
    crypto: {
      init: vi.fn(),
      getEncryptionData: vi.fn().mockReturnValue({
        encryptionInfo: { encryptedSymmetricKey: 'enc-key', initializationVector: 'iv' },
        cipherKey: new Uint8Array(32),
        cipherIv: new Uint8Array(16),
      }),
      getFileMetadata: vi.fn().mockReturnValue({ hashSHA: 'part-hash', fileSize: 500 }),
    },
    batchSession: {
      openSession: vi.fn().mockResolvedValue({
        referenceNumber: 'batch-ref-1',
        partUploadRequests: [
          { method: 'PUT', ordinalNumber: 1, url: 'https://upload.example.com/1', headers: {} },
        ],
      }),
      sendParts: vi.fn().mockResolvedValue(undefined),
      closeSession: vi.fn().mockResolvedValue(undefined),
    },
    sessionStatus: {
      getSessionStatus: vi.fn().mockResolvedValue({
        status: { code: 200, description: 'OK' },
        upo: { pages: [{ referenceNumber: 'upo-batch-1', downloadUrl: 'https://example.com/upo' }] },
        invoiceCount: 5,
        successfulInvoiceCount: 5,
        failedInvoiceCount: 0,
      }),
    },
  } as any;
}

let client: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  client = createMockClient();
});

describe('uploadBatch', () => {
  const parts = [{ data: new ArrayBuffer(500) }];

  it('executes full open -> upload -> close -> poll flow', async () => {
    const result = await uploadBatch(client, parts, 500, 'total-hash', { pollOptions: { intervalMs: 1 } });
    expect(client.crypto.init).toHaveBeenCalled();
    expect(client.batchSession.openSession).toHaveBeenCalled();
    expect(client.batchSession.sendParts).toHaveBeenCalled();
    expect(client.batchSession.closeSession).toHaveBeenCalledWith('batch-ref-1');
    expect(result.sessionRef).toBe('batch-ref-1');
    expect(result.upo.pages).toHaveLength(1);
    expect(result.upo.invoiceCount).toBe(5);
  });

  it('passes formCode and upoVersion', async () => {
    const formCode = { systemCode: 'PEF', schemaVersion: '1', value: 'PEF (1)' };
    await uploadBatch(client, parts, 500, 'hash', { formCode, upoVersion: 'v4-3', pollOptions: { intervalMs: 1 } });
    expect(client.batchSession.openSession).toHaveBeenCalledWith(
      expect.objectContaining({ formCode }),
      'v4-3',
    );
  });

  it('throws on non-200 final status', async () => {
    client.sessionStatus.getSessionStatus.mockResolvedValue({
      status: { code: 400, description: 'Bad request' },
    });
    await expect(
      uploadBatch(client, parts, 500, 'hash', { pollOptions: { intervalMs: 1 } }),
    ).rejects.toThrow('Batch session failed: 400');
  });

  it('computes file part info for each part', async () => {
    const multiParts = [{ data: new ArrayBuffer(100) }, { data: new ArrayBuffer(200) }];
    client.batchSession.openSession.mockResolvedValue({
      referenceNumber: 'batch-ref-2',
      partUploadRequests: [
        { method: 'PUT', ordinalNumber: 1, url: 'https://upload.example.com/1', headers: {} },
        { method: 'PUT', ordinalNumber: 2, url: 'https://upload.example.com/2', headers: {} },
      ],
    });
    await uploadBatch(client, multiParts, 300, 'hash', { pollOptions: { intervalMs: 1 } });
    const openCall = client.batchSession.openSession.mock.calls[0][0];
    expect(openCall.batchFile.fileParts).toHaveLength(2);
    expect(openCall.batchFile.fileParts[0].ordinalNumber).toBe(1);
    expect(openCall.batchFile.fileParts[1].ordinalNumber).toBe(2);
  });

  it('returns empty pages when upo is undefined', async () => {
    client.sessionStatus.getSessionStatus.mockResolvedValue({
      status: { code: 200, description: 'OK' },
    });
    const result = await uploadBatch(client, parts, 500, 'hash', { pollOptions: { intervalMs: 1 } });
    expect(result.upo.pages).toEqual([]);
  });
});
