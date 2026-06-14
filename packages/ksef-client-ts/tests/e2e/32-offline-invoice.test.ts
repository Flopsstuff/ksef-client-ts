import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { authenticateWithCertAndCrypto } from './helpers/auth.js';
import { getFormCode, prepareInvoiceXml, prepareAndEncryptInvoice } from './helpers/invoices.js';
import { pollUntil } from './helpers/polling.js';
import { InMemoryOfflineInvoiceStorage } from '../../src/offline/storage.js';
import { CertificateService } from '../../src/crypto/certificate-service.js';
import type { SendInvoiceRequest } from '../../src/models/sessions/online-types.js';

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function futureDateString(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

const POLL_OPTIONS = { intervalMs: 5000, maxAttempts: 40 };

describe('32 - Offline Invoice E2E', { timeout: 300_000 }, () => {
  it('should generate offline invoice metadata with QR KOD I', async () => {
    const { client, nip } = await authenticateWithCertAndCrypto();
    const storage = new InMemoryOfflineInvoiceStorage();

    const invoiceXml = prepareInvoiceXml('FA_3', { nip });

    const metadata = await client.offline.generate(
      {
        invoiceNumber: `OFFLINE-E2E-${Date.now()}`,
        invoiceDate: todayString(),
        invoiceXml,
        sellerNip: nip,
        sellerIdentifier: { type: 'Nip', value: nip },
      },
      { storage, mode: 'offline24' },
    );

    expect(metadata.id).toBeTruthy();
    expect(metadata.status).toBe('GENERATED');
    expect(metadata.mode).toBe('offline24');
    expect(metadata.reason).toBe('PLANNED');
    expect(metadata.kod1Url).toContain('/invoice/');
    expect(metadata.kod2Url).toBeUndefined();
    expect(metadata.submitBy).toBeTruthy();
    expect(metadata.sellerNip).toBe(nip);

    const stored = await storage.get(metadata.id);
    expect(stored).toEqual(metadata);
  });

  it('should generate offline invoice with QR KOD II (certificate signing)', async () => {
    const { client, nip } = await authenticateWithCertAndCrypto();

    const invoiceXml = prepareInvoiceXml('FA_3', { nip });

    // Generate a self-signed cert for KOD II signing
    const cert = await CertificateService.generateCompanySeal(
      'Offline Test Company', `VATPL-${nip}`, `Offline E2E ${nip}`, 'RSA',
    );

    const metadata = await client.offline.generate(
      {
        invoiceNumber: `OFFLINE-KOD2-${Date.now()}`,
        invoiceDate: todayString(),
        invoiceXml,
        sellerNip: nip,
        sellerIdentifier: { type: 'Nip', value: nip },
      },
      {
        mode: 'offline24',
        certificate: {
          privateKeyPem: cert.privateKeyPem,
          certificateSerial: cert.fingerprint,
        },
      },
    );

    expect(metadata.kod1Url).toContain('/invoice/');
    expect(metadata.kod2Url).toBeTruthy();
    expect(metadata.kod2Url).toContain('/certificate/');
    // KOD II URL has 6 path segments: contextType/contextId/sellerNip/serial/hash/signature
    const kod2Path = new URL(metadata.kod2Url!).pathname;
    const segments = kod2Path.split('/').filter(Boolean);
    expect(segments.length).toBeGreaterThanOrEqual(7); // "certificate" + 6 segments
  });

  it('should generate and submit offline invoice via workflow', async () => {
    const { client, nip } = await authenticateWithCertAndCrypto();
    const storage = new InMemoryOfflineInvoiceStorage();

    const invoiceXml = prepareInvoiceXml('FA_3', { nip });

    const metadata = await client.offline.generate(
      {
        invoiceNumber: `OFFLINE-SUBMIT-${Date.now()}`,
        invoiceDate: todayString(),
        invoiceXml,
        sellerNip: nip,
        sellerIdentifier: { type: 'Nip', value: nip },
      },
      { storage, mode: 'offline24' },
    );
    expect(metadata.status).toBe('GENERATED');

    // Submit via workflow — opens session, sends with offlineMode: true, closes
    const result = await client.offline.submit(client, { storage });

    expect(result.total).toBe(1);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.expired).toBe(0);
    expect(result.results[0].ksefReferenceNumber).toBeTruthy();

    // Verify storage updated
    const updated = await storage.get(metadata.id);
    expect(updated!.status).toBe('ACCEPTED');
    expect(updated!.ksefReferenceNumber).toBeTruthy();
    expect(updated!.submittedAt).toBeTruthy();
  });

  it('should submit multiple offline invoices in a single workflow call', async () => {
    const { client, nip } = await authenticateWithCertAndCrypto();
    const storage = new InMemoryOfflineInvoiceStorage();

    const inv1 = await client.offline.generate(
      {
        invoiceNumber: `OFFLINE-MULTI-1-${Date.now()}`,
        invoiceDate: todayString(),
        invoiceXml: prepareInvoiceXml('FA_3', { nip }),
        sellerNip: nip,
        sellerIdentifier: { type: 'Nip', value: nip },
      },
      { storage },
    );
    const inv2 = await client.offline.generate(
      {
        invoiceNumber: `OFFLINE-MULTI-2-${Date.now()}`,
        invoiceDate: todayString(),
        invoiceXml: prepareInvoiceXml('FA_3', { nip }),
        sellerNip: nip,
        sellerIdentifier: { type: 'Nip', value: nip },
      },
      { storage },
    );

    const result = await client.offline.submit(client, { storage });

    expect(result.total).toBe(2);
    expect(result.accepted).toBe(2);
    expect(result.results).toHaveLength(2);

    // Both should have KSeF references
    for (const r of result.results) {
      expect(r.ksefReferenceNumber).toBeTruthy();
      expect(r.status).toBe('ACCEPTED');
    }

    // Verify storage
    const stored1 = await storage.get(inv1.id);
    const stored2 = await storage.get(inv2.id);
    expect(stored1!.status).toBe('ACCEPTED');
    expect(stored2!.status).toBe('ACCEPTED');
    expect(stored1!.ksefReferenceNumber).not.toBe(stored2!.ksefReferenceNumber);
  });

  it('should correct a rejected offline invoice via workflow', async () => {
    const { client, nip, encryptionData } = await authenticateWithCertAndCrypto();
    const { cipherKey, cipherIv, encryptionInfo } = encryptionData;
    const storage = new InMemoryOfflineInvoiceStorage();

    // Step 1: Send invoice with future date to trigger rejection (status 450)
    const badInvoiceXml = prepareInvoiceXml('FA_3', { nip, invoicingDate: futureDateString(2) });

    const formCode = getFormCode('FA_3');
    const openResp = await client.onlineSession.openSession({
      formCode,
      encryption: encryptionInfo,
    });
    const sessionRef = openResp.referenceNumber;

    let rejectedInvoiceHash: string;

    try {
      const plain = new TextEncoder().encode(badInvoiceXml);
      const encrypted = client.crypto.encryptAES256(plain, cipherKey, cipherIv);
      const plainMeta = client.crypto.getFileMetadata(plain);
      const encMeta = client.crypto.getFileMetadata(encrypted);

      const badRequest: SendInvoiceRequest = {
        invoiceHash: plainMeta.hashSHA,
        invoiceSize: plainMeta.fileSize,
        encryptedInvoiceHash: encMeta.hashSHA,
        encryptedInvoiceSize: encMeta.fileSize,
        encryptedInvoiceContent: Buffer.from(encrypted).toString('base64'),
        offlineMode: true,
      };

      const badSend = await client.onlineSession.sendInvoice(sessionRef, badRequest);
      const badRef = badSend.referenceNumber;

      // Poll for rejection
      await pollUntil(
        () => client.sessionStatus.getSessionStatus(sessionRef),
        (s) => (s.failedInvoiceCount ?? 0) > 0,
        { ...POLL_OPTIONS, description: 'offline rejection detection' },
      );

      const failedInvoice = await client.sessionStatus.getSessionInvoice(sessionRef, badRef);
      expect(failedInvoice.status.code).toBe(450);
      rejectedInvoiceHash = failedInvoice.invoiceHash;
    } finally {
      await client.onlineSession.closeSession(sessionRef).catch(() => {});
    }

    // Step 2: Store the rejected invoice in offline storage
    // The hash correct() computes must match what KSeF has, so we store the exact same XML
    const rejectedMetadata = await client.offline.generate(
      {
        invoiceNumber: `OFFLINE-REJECTED-${Date.now()}`,
        invoiceDate: futureDateString(2),
        invoiceXml: badInvoiceXml,
        sellerNip: nip,
        sellerIdentifier: { type: 'Nip', value: nip },
      },
      { storage },
    );
    // Manually mark as REJECTED (in real flow KSeF would reject during submit)
    await storage.update(rejectedMetadata.id, {
      status: 'REJECTED',
      error: { code: 450, message: 'Future date rejection' },
    });

    // Verify hash matches what KSeF has
    const localHash = crypto.createHash('sha256').update(badInvoiceXml).digest('base64');
    expect(localHash).toBe(rejectedInvoiceHash);

    // Step 3: Correct via workflow — re-authenticate with same NIP for new session
    const { client: client2 } = await authenticateWithCertAndCrypto(nip);

    const correctedXml = prepareInvoiceXml('FA_3', { nip, invoicingDate: todayString() });

    const correctionResult = await client2.offline.correct(client2, {
      rejectedInvoiceId: rejectedMetadata.id,
      correctedInvoiceXml: correctedXml,
      storage,
    });

    expect(correctionResult.status).toBe('ACCEPTED');
    expect(correctionResult.ksefReferenceNumber).toBeTruthy();

    // Verify correction stored with link to original
    const correctionStored = await storage.get(correctionResult.invoiceId);
    expect(correctionStored).toBeTruthy();
    expect(correctionStored!.correctedInvoiceId).toBe(rejectedMetadata.id);
    expect(correctionStored!.status).toBe('ACCEPTED');
  });
});
