import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OfflineInvoiceWorkflow } from '../../../src/workflows/offline-invoice-workflow.js';
import { InMemoryOfflineInvoiceStorage } from '../../../src/offline/storage.js';
import type { VerificationLinkService } from '../../../src/qr/verification-link-service.js';
import type { OfflineInvoiceInputData } from '../../../src/offline/types.js';
import type { KSeFClient } from '../../../src/client.js';

function makeInput(overrides: Partial<OfflineInvoiceInputData> = {}): OfflineInvoiceInputData {
  return {
    invoiceNumber: 'FV/2026/001',
    invoiceDate: '2026-04-08',
    invoiceXml: '<FA><P_1>2026-04-08</P_1></FA>',
    sellerNip: '1234567890',
    sellerIdentifier: { type: 'Nip', value: '1234567890' },
    ...overrides,
  };
}

function mockQrService(): VerificationLinkService {
  return {
    buildInvoiceVerificationUrl: vi.fn().mockReturnValue('https://qr-test.ksef.mf.gov.pl/invoice/1234567890/08-04-2026/hash'),
    buildCertificateVerificationUrl: vi.fn().mockReturnValue('https://qr-test.ksef.mf.gov.pl/certificate/Nip/1234567890/1234567890/SERIAL/hash/sig'),
  } as unknown as VerificationLinkService;
}

function mockClient(): KSeFClient {
  return {
    crypto: {
      init: vi.fn(),
      getEncryptionData: vi.fn().mockReturnValue({
        cipherKey: new Uint8Array(32),
        cipherIv: new Uint8Array(16),
        encryptionInfo: { encryptedSymmetricKey: 'key', initializationVector: 'iv' },
      }),
      getFileMetadata: vi.fn().mockReturnValue({ hashSHA: 'hash==', fileSize: 100 }),
      encryptAES256: vi.fn().mockReturnValue(new Uint8Array(128)),
    },
    onlineSession: {
      openSession: vi.fn().mockResolvedValue({ referenceNumber: 'session-ref', validUntil: '2026-04-08T12:00:00Z' }),
      sendInvoice: vi.fn().mockResolvedValue({ referenceNumber: 'ksef-ref-123' }),
      closeSession: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as KSeFClient;
}

describe('OfflineInvoiceWorkflow', () => {
  let workflow: OfflineInvoiceWorkflow;
  let qrService: VerificationLinkService;

  beforeEach(() => {
    qrService = mockQrService();
    workflow = new OfflineInvoiceWorkflow(qrService);
  });

  describe('generate', () => {
    it('creates metadata with KOD I URL', async () => {
      const result = await workflow.generate(makeInput());
      expect(result.status).toBe('GENERATED');
      expect(result.kod1Url).toContain('invoice');
      expect(result.kod2Url).toBeUndefined();
      expect(result.id).toBeDefined();
      expect(result.mode).toBe('offline24');
      expect(result.reason).toBe('PLANNED');
    });

    it('includes KOD II URL when certificate provided', async () => {
      const result = await workflow.generate(makeInput(), {
        certificate: { privateKeyPem: 'PEM', certificateSerial: '01AA' },
      });
      expect(result.kod2Url).toContain('certificate');
      expect(qrService.buildCertificateVerificationUrl).toHaveBeenCalledWith(
        'Nip', '1234567890', '1234567890', '01AA',
        expect.any(String), 'PEM',
      );
    });

    it('defaults to offline24 mode', async () => {
      const result = await workflow.generate(makeInput());
      expect(result.mode).toBe('offline24');
      expect(result.reason).toBe('PLANNED');
    });

    it('uses specified mode', async () => {
      const result = await workflow.generate(makeInput(), { mode: 'awaryjny' });
      expect(result.mode).toBe('awaryjny');
      expect(result.reason).toBe('EMERGENCY');
    });

    it('uses custom deadline', async () => {
      const result = await workflow.generate(makeInput(), {
        customDeadline: '2026-05-01T23:59:59Z',
      });
      expect(result.submitBy).toBe('2026-05-01T23:59:59Z');
    });

    it('auto-saves to storage when provided', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const result = await workflow.generate(makeInput(), { storage });
      const stored = await storage.get(result.id);
      expect(stored).toEqual(result);
    });

    it('throws on empty invoiceXml', async () => {
      await expect(workflow.generate(makeInput({ invoiceXml: '' })))
        .rejects.toThrow('invoiceXml must not be empty');
    });

    it('throws on missing invoiceNumber', async () => {
      await expect(workflow.generate(makeInput({ invoiceNumber: '' })))
        .rejects.toThrow('invoiceNumber is required');
    });

    it('throws on missing sellerNip', async () => {
      await expect(workflow.generate(makeInput({ sellerNip: '' })))
        .rejects.toThrow('sellerNip is required');
    });
  });

  describe('submit', () => {
    it('submits all pending invoices', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv1 = await workflow.generate(makeInput({ invoiceNumber: 'FV/001' }), { storage });
      const inv2 = await workflow.generate(makeInput({ invoiceNumber: 'FV/002' }), { storage });

      const client = mockClient();
      const result = await workflow.submit(client, { storage });

      expect(result.total).toBe(2);
      expect(result.accepted).toBe(2);
      expect(result.submitted).toBe(2);
      expect(result.rejected).toBe(0);
      expect(result.expired).toBe(0);

      const updated1 = await storage.get(inv1.id);
      expect(updated1!.status).toBe('ACCEPTED');
      expect(updated1!.ksefReferenceNumber).toBe('ksef-ref-123');
    });

    it('submits specific IDs only', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv1 = await workflow.generate(makeInput({ invoiceNumber: 'FV/001' }), { storage });
      await workflow.generate(makeInput({ invoiceNumber: 'FV/002' }), { storage });

      const client = mockClient();
      const result = await workflow.submit(client, { storage, invoiceIds: [inv1.id] });

      expect(result.total).toBe(1);
      expect(result.accepted).toBe(1);
    });

    it('marks expired invoices', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), {
        storage,
        customDeadline: '2020-01-01T00:00:00Z',
      });

      const client = mockClient();
      const result = await workflow.submit(client, { storage });

      expect(result.expired).toBe(1);
      expect(result.accepted).toBe(0);
      const updated = await storage.get(inv.id);
      expect(updated!.status).toBe('EXPIRED');
    });

    it('handles partial failure', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      await workflow.generate(makeInput({ invoiceNumber: 'FV/001' }), { storage });
      await workflow.generate(makeInput({ invoiceNumber: 'FV/002' }), { storage });

      const client = mockClient();
      let callCount = 0;
      (client.onlineSession.sendInvoice as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        if (callCount === 2) throw new Error('KSeF rejected');
        return Promise.resolve({ referenceNumber: 'ksef-ref' });
      });

      const result = await workflow.submit(client, { storage });
      expect(result.accepted).toBe(1);
      expect(result.rejected).toBe(1);
      expect(result.submitted).toBe(2);
    });

    it('throws on session open failure without changing statuses', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), { storage });

      const client = mockClient();
      (client.onlineSession.openSession as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Auth failed'));

      await expect(workflow.submit(client, { storage })).rejects.toThrow('Auth failed');

      const unchanged = await storage.get(inv.id);
      expect(unchanged!.status).toBe('GENERATED');
    });

    it('returns empty result when no invoices', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const client = mockClient();
      const result = await workflow.submit(client, { storage });
      expect(result.total).toBe(0);
    });

    it('transitions through SUBMITTED before ACCEPTED', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), { storage });
      const updateSpy = vi.spyOn(storage, 'update');

      const client = mockClient();
      await workflow.submit(client, { storage });

      const statusUpdates = updateSpy.mock.calls
        .filter(([id]) => id === inv.id)
        .map(([, updates]) => (updates as Record<string, unknown>).status)
        .filter(Boolean);

      expect(statusUpdates).toEqual(['QUEUED', 'SUBMITTED', 'ACCEPTED']);
    });

    it('transitions through SUBMITTED before REJECTED', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), { storage });
      const updateSpy = vi.spyOn(storage, 'update');

      const client = mockClient();
      (client.onlineSession.sendInvoice as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new Error('KSeF rejected'));

      await workflow.submit(client, { storage });

      const statusUpdates = updateSpy.mock.calls
        .filter(([id]) => id === inv.id)
        .map(([, updates]) => (updates as Record<string, unknown>).status)
        .filter(Boolean);

      expect(statusUpdates).toEqual(['QUEUED', 'SUBMITTED', 'REJECTED']);
    });

    it('retries invoices stuck in SUBMITTED status', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), { storage });
      await storage.update(inv.id, { status: 'SUBMITTED', submittedAt: new Date().toISOString() });

      const client = mockClient();
      const result = await workflow.submit(client, { storage });

      expect(result.total).toBe(1);
      expect(result.accepted).toBe(1);
      const updated = await storage.get(inv.id);
      expect(updated!.status).toBe('ACCEPTED');
    });
  });

  describe('correct', () => {
    it('resubmits rejected invoice with hash', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), { storage });
      await storage.update(inv.id, { status: 'REJECTED', error: { code: 440, message: 'duplicate' } });

      const client = mockClient();
      const result = await workflow.correct(client, {
        rejectedInvoiceId: inv.id,
        correctedInvoiceXml: '<FA><P_1>2026-04-08</P_1><fixed/></FA>',
        storage,
      });

      expect(result.status).toBe('ACCEPTED');
      expect(result.ksefReferenceNumber).toBe('ksef-ref-123');

      // Verify hashOfCorrectedInvoice was passed
      const sendCall = (client.onlineSession.sendInvoice as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sendCall[1].offlineMode).toBe(true);
      expect(sendCall[1].hashOfCorrectedInvoice).toBeDefined();

      // Verify new metadata stored
      const correction = await storage.get(result.invoiceId);
      expect(correction).toBeDefined();
      expect(correction!.correctedInvoiceId).toBe(inv.id);
      expect(correction!.submittedAt).toBeDefined();
      expect(correction!.acceptedAt).toBeDefined();
    });

    it('throws for non-rejected invoice', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), { storage });

      const client = mockClient();
      await expect(workflow.correct(client, {
        rejectedInvoiceId: inv.id,
        correctedInvoiceXml: '<FA/>',
        storage,
      })).rejects.toThrow('Only rejected invoices can be corrected');
    });

    it('throws for missing invoice', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const client = mockClient();
      await expect(workflow.correct(client, {
        rejectedInvoiceId: 'missing',
        correctedInvoiceXml: '<FA/>',
        storage,
      })).rejects.toThrow('Offline invoice not found');
    });
  });
});
