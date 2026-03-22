import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openOnlineSession, openSendAndClose } from '../../../src/workflows/online-session-workflow.js';

function createMockClient() {
  return {
    crypto: {
      init: vi.fn(),
      getEncryptionData: vi.fn().mockReturnValue({
        encryptionInfo: { encryptedSymmetricKey: 'enc-key', initializationVector: 'iv' },
        cipherKey: new Uint8Array(32),
        cipherIv: new Uint8Array(16),
      }),
      getFileMetadata: vi.fn().mockReturnValue({ hashSHA: 'hash-abc', fileSize: 100 }),
      encryptAES256: vi.fn().mockReturnValue(new Uint8Array(128)),
    },
    onlineSession: {
      openSession: vi.fn().mockResolvedValue({ referenceNumber: 'sess-ref-1', validUntil: '2099-01-01T00:00:00Z' }),
      sendInvoice: vi.fn().mockResolvedValue({ referenceNumber: 'inv-ref-1' }),
      closeSession: vi.fn().mockResolvedValue(undefined),
    },
    sessionStatus: {
      getSessionStatus: vi.fn().mockResolvedValue({
        status: { code: 200, description: 'OK' },
        upo: { pages: [{ referenceNumber: 'upo-ref-1', downloadUrl: 'https://example.com/upo' }] },
        invoiceCount: 1,
        successfulInvoiceCount: 1,
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

describe('openOnlineSession', () => {
  it('initializes crypto and opens session', async () => {
    const handle = await openOnlineSession(client);
    expect(client.crypto.init).toHaveBeenCalled();
    expect(client.crypto.getEncryptionData).toHaveBeenCalled();
    expect(client.onlineSession.openSession).toHaveBeenCalledWith(
      expect.objectContaining({
        formCode: { systemCode: 'FA', schemaVersion: '3', value: 'FA (3)' },
        encryption: expect.any(Object),
      }),
      undefined,
    );
    expect(handle.sessionRef).toBe('sess-ref-1');
    expect(handle.validUntil).toBe('2099-01-01T00:00:00Z');
  });

  it('passes custom formCode and upoVersion', async () => {
    const formCode = { systemCode: 'PEF', schemaVersion: '1', value: 'PEF (1)' };
    await openOnlineSession(client, { formCode, upoVersion: 'v4-3' });
    expect(client.onlineSession.openSession).toHaveBeenCalledWith(
      expect.objectContaining({ formCode }),
      'v4-3',
    );
  });

  it('handle.sendInvoice encrypts and sends', async () => {
    const handle = await openOnlineSession(client);
    const ref = await handle.sendInvoice('<invoice>test</invoice>');
    expect(ref).toBe('inv-ref-1');
    expect(client.crypto.getFileMetadata).toHaveBeenCalledTimes(2); // plain + encrypted
    expect(client.crypto.encryptAES256).toHaveBeenCalled();
    expect(client.onlineSession.sendInvoice).toHaveBeenCalledWith('sess-ref-1', expect.objectContaining({
      invoiceHash: 'hash-abc',
      invoiceSize: 100,
      encryptedInvoiceHash: 'hash-abc',
      encryptedInvoiceSize: 100,
      encryptedInvoiceContent: expect.any(String),
    }));
  });

  it('handle.sendInvoice accepts Uint8Array', async () => {
    const handle = await openOnlineSession(client);
    await handle.sendInvoice(new Uint8Array([1, 2, 3]));
    expect(client.crypto.getFileMetadata).toHaveBeenCalled();
    expect(client.onlineSession.sendInvoice).toHaveBeenCalled();
  });

  it('handle.close calls closeSession', async () => {
    const handle = await openOnlineSession(client);
    await handle.close();
    expect(client.onlineSession.closeSession).toHaveBeenCalledWith('sess-ref-1');
  });

  it('handle.waitForUpo polls and returns UpoInfo', async () => {
    const handle = await openOnlineSession(client);
    const upo = await handle.waitForUpo({ intervalMs: 1, maxAttempts: 5 });
    expect(upo.pages).toHaveLength(1);
    expect(upo.pages[0].referenceNumber).toBe('upo-ref-1');
    expect(upo.invoiceCount).toBe(1);
    expect(upo.successfulInvoiceCount).toBe(1);
    expect(upo.failedInvoiceCount).toBe(0);
  });

  it('handle.waitForUpo throws on non-200 status', async () => {
    client.sessionStatus.getSessionStatus.mockResolvedValue({
      status: { code: 500, description: 'Internal error' },
    });
    const handle = await openOnlineSession(client);
    await expect(handle.waitForUpo({ intervalMs: 1 })).rejects.toThrow('Session failed: 500');
  });

  it('handle.waitForUpo polls past code 100', async () => {
    let call = 0;
    client.sessionStatus.getSessionStatus.mockImplementation(async () => {
      call++;
      if (call < 3) return { status: { code: 100, description: 'Pending' } };
      return {
        status: { code: 200, description: 'OK' },
        upo: { pages: [] },
      };
    });
    const handle = await openOnlineSession(client);
    const upo = await handle.waitForUpo({ intervalMs: 1, maxAttempts: 10 });
    expect(upo.pages).toEqual([]);
    expect(client.sessionStatus.getSessionStatus).toHaveBeenCalledTimes(3);
  });
});

describe('openSendAndClose', () => {
  it('sends all invoices, closes, and returns UPO', async () => {
    const upo = await openSendAndClose(client, ['<inv1/>', '<inv2/>'], { pollOptions: { intervalMs: 1 } });
    expect(client.onlineSession.sendInvoice).toHaveBeenCalledTimes(2);
    expect(client.onlineSession.closeSession).toHaveBeenCalledWith('sess-ref-1');
    expect(upo.pages).toHaveLength(1);
  });
});
