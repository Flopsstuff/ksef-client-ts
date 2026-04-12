import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OfflineInvoiceWorkflow } from '../../../src/workflows/offline-invoice-workflow.js';
import { InMemoryOfflineInvoiceStorage } from '../../../src/offline/storage.js';
import type { VerificationLinkService } from '../../../src/qr/verification-link-service.js';
import type { OfflineInvoiceInputData } from '../../../src/offline/types.js';
import type { KSeFClient } from '../../../src/client.js';
import { KSeFApiError } from '../../../src/errors/ksef-api-error.js';

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
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-08T10:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

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

    it('handles network failure (counts as failed, not rejected)', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      await workflow.generate(makeInput({ invoiceNumber: 'FV/001' }), { storage });
      await workflow.generate(makeInput({ invoiceNumber: 'FV/002' }), { storage });

      const client = mockClient();
      let callCount = 0;
      (client.onlineSession.sendInvoice as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        if (callCount === 2) throw new Error('ECONNREFUSED');
        return Promise.resolve({ referenceNumber: 'ksef-ref' });
      });

      const result = await workflow.submit(client, { storage });
      expect(result.accepted).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.rejected).toBe(0);
      expect(result.submitted).toBe(1);
    });

    it('counts KSeFApiError as rejected', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), { storage });

      const client = mockClient();
      (client.onlineSession.sendInvoice as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new KSeFApiError('Duplikat faktury', 440));

      const result = await workflow.submit(client, { storage });
      expect(result.rejected).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.submitted).toBe(1);

      const updated = await storage.get(inv.id);
      expect(updated!.status).toBe('REJECTED');
      expect(updated!.error!.code).toBe(440);
    });

    it('reverts to QUEUED on network error', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), { storage });

      const client = mockClient();
      (client.onlineSession.sendInvoice as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await workflow.submit(client, { storage });
      expect(result.failed).toBe(1);
      expect(result.rejected).toBe(0);

      const updated = await storage.get(inv.id);
      expect(updated!.status).toBe('QUEUED');
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

    it('throws when requested IDs not found', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const client = mockClient();
      await expect(workflow.submit(client, {
        storage,
        invoiceIds: ['nonexistent-id'],
      })).rejects.toThrow('Offline invoice(s) not found: nonexistent-id');
    });

    it('lists all missing IDs in error message', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), { storage });
      const client = mockClient();
      await expect(workflow.submit(client, {
        storage,
        invoiceIds: [inv.id, 'missing-1', 'missing-2'],
      })).rejects.toThrow('Offline invoice(s) not found: missing-1, missing-2');
    });

    it('returns empty result when no invoices', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const client = mockClient();
      const result = await workflow.submit(client, { storage });
      expect(result.total).toBe(0);
    });

    it('calls closeSession in finally block after successful submit', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      await workflow.generate(makeInput(), { storage });

      const client = mockClient();
      await workflow.submit(client, { storage });

      expect(client.onlineSession.closeSession).toHaveBeenCalledWith('session-ref');
      expect(client.onlineSession.closeSession).toHaveBeenCalledTimes(1);
    });

    it('calls closeSession even when sendInvoice fails', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      await workflow.generate(makeInput(), { storage });

      const client = mockClient();
      (client.onlineSession.sendInvoice as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new Error('ECONNREFUSED'));

      await workflow.submit(client, { storage });

      expect(client.onlineSession.closeSession).toHaveBeenCalledWith('session-ref');
    });

    it('submits expired invoices when checkExpiry is false', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), {
        storage,
        customDeadline: '2020-01-01T00:00:00Z',
      });

      const client = mockClient();
      const result = await workflow.submit(client, { storage, checkExpiry: false });

      expect(result.expired).toBe(0);
      expect(result.accepted).toBe(1);
      expect(result.submitted).toBe(1);
      const updated = await storage.get(inv.id);
      expect(updated!.status).toBe('ACCEPTED');
    });

    it('handles mixed expired and valid invoices in batch', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const expired1 = await workflow.generate(makeInput({ invoiceNumber: 'FV/EXP1' }), {
        storage,
        customDeadline: '2020-01-01T00:00:00Z',
      });
      const expired2 = await workflow.generate(makeInput({ invoiceNumber: 'FV/EXP2' }), {
        storage,
        customDeadline: '2020-06-01T00:00:00Z',
      });
      const valid = await workflow.generate(makeInput({ invoiceNumber: 'FV/VALID' }), {
        storage,
        customDeadline: '2099-12-31T00:00:00Z',
      });

      const client = mockClient();
      const result = await workflow.submit(client, { storage });

      expect(result.total).toBe(3);
      expect(result.expired).toBe(2);
      expect(result.accepted).toBe(1);
      expect(result.submitted).toBe(1);

      expect((await storage.get(expired1.id))!.status).toBe('EXPIRED');
      expect((await storage.get(expired2.id))!.status).toBe('EXPIRED');
      expect((await storage.get(valid.id))!.status).toBe('ACCEPTED');
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
        .mockRejectedValue(new KSeFApiError('Invalid XML', 400));

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

    it('updates original invoice to CORRECTED', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), { storage });
      await storage.update(inv.id, { status: 'REJECTED', error: { code: 440, message: 'duplicate' } });

      const client = mockClient();
      const result = await workflow.correct(client, {
        rejectedInvoiceId: inv.id,
        correctedInvoiceXml: '<FA><P_1>2026-04-08</P_1><fixed/></FA>',
        storage,
      });

      const original = await storage.get(inv.id);
      expect(original!.status).toBe('CORRECTED');
      expect(original!.correctedBy).toBe(result.invoiceId);
    });

    it('regenerates QR codes from corrected XML', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), { storage });
      await storage.update(inv.id, { status: 'REJECTED', error: { code: 440, message: 'duplicate' } });

      const client = mockClient();
      const result = await workflow.correct(client, {
        rejectedInvoiceId: inv.id,
        correctedInvoiceXml: '<FA><P_1>2026-04-08</P_1><fixed/></FA>',
        storage,
      });

      // QR service should be called with the corrected XML's hash, not the original's
      expect(qrService.buildInvoiceVerificationUrl).toHaveBeenCalledTimes(2); // once for generate, once for correct
      const correctCall = (qrService.buildInvoiceVerificationUrl as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(correctCall[0]).toBe('1234567890'); // sellerNip
      // The hash argument should differ from the original generate call
      const generateCall = (qrService.buildInvoiceVerificationUrl as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(correctCall[2]).not.toBe(generateCall[2]);
    });

    it('generates KOD II for correction when certificate provided', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), { storage });
      await storage.update(inv.id, { status: 'REJECTED', error: { code: 440, message: 'duplicate' } });

      const client = mockClient();
      const result = await workflow.correct(client, {
        rejectedInvoiceId: inv.id,
        correctedInvoiceXml: '<FA><P_1>2026-04-08</P_1><fixed/></FA>',
        storage,
        certificate: { privateKeyPem: 'PEM', certificateSerial: '01AA' },
      });

      const correction = await storage.get(result.invoiceId);
      expect(correction!.kod2Url).toBeDefined();
      expect(qrService.buildCertificateVerificationUrl).toHaveBeenCalledTimes(1);
    });

    it('prevents duplicate correction of same invoice', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), { storage });
      await storage.update(inv.id, { status: 'REJECTED', error: { code: 440, message: 'duplicate' } });

      const client = mockClient();
      await workflow.correct(client, {
        rejectedInvoiceId: inv.id,
        correctedInvoiceXml: '<FA><P_1>2026-04-08</P_1><fixed/></FA>',
        storage,
      });

      await expect(workflow.correct(client, {
        rejectedInvoiceId: inv.id,
        correctedInvoiceXml: '<FA><P_1>2026-04-08</P_1><fixed2/></FA>',
        storage,
      })).rejects.toThrow('has already been corrected');
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

    it('calls closeSession in finally block after successful correction', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), { storage });
      await storage.update(inv.id, { status: 'REJECTED', error: { code: 440, message: 'duplicate' } });

      const client = mockClient();
      await workflow.correct(client, {
        rejectedInvoiceId: inv.id,
        correctedInvoiceXml: '<FA><P_1>2026-04-08</P_1><fixed/></FA>',
        storage,
      });

      expect(client.onlineSession.closeSession).toHaveBeenCalledWith('session-ref');
      expect(client.onlineSession.closeSession).toHaveBeenCalledTimes(1);
    });

    it('calls closeSession even when sendInvoice fails during correction', async () => {
      const storage = new InMemoryOfflineInvoiceStorage();
      const inv = await workflow.generate(makeInput(), { storage });
      await storage.update(inv.id, { status: 'REJECTED', error: { code: 440, message: 'duplicate' } });

      const client = mockClient();
      (client.onlineSession.sendInvoice as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(workflow.correct(client, {
        rejectedInvoiceId: inv.id,
        correctedInvoiceXml: '<FA><P_1>2026-04-08</P_1><fixed/></FA>',
        storage,
      })).rejects.toThrow('ECONNREFUSED');

      expect(client.onlineSession.closeSession).toHaveBeenCalledWith('session-ref');
    });
  });
});
