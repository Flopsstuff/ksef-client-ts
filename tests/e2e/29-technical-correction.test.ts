import { describe, it, expect } from 'vitest';
import { authenticateWithCertAndCrypto } from './helpers/auth.js';
import { getFormCode, prepareInvoiceXml } from './helpers/invoices.js';
import { pollUntil } from './helpers/polling.js';
import type { KSeFClient } from '../../src/client.js';
import type { SendInvoiceRequest } from '../../src/models/sessions/online-types.js';

function futureDateString(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function prepareAndEncryptInvoiceWithDate(
  client: KSeFClient,
  nip: string,
  invoicingDate: string,
  cipherKey: Uint8Array,
  cipherIv: Uint8Array,
): SendInvoiceRequest {
  const xml = prepareInvoiceXml('FA_3', { nip, invoicingDate });
  const plain = new TextEncoder().encode(xml);
  const encrypted = client.crypto.encryptAES256(plain, cipherKey, cipherIv);
  const plainMeta = client.crypto.getFileMetadata(plain);
  const encMeta = client.crypto.getFileMetadata(encrypted);
  return {
    invoiceHash: plainMeta.hashSHA,
    invoiceSize: plainMeta.fileSize,
    encryptedInvoiceHash: encMeta.hashSHA,
    encryptedInvoiceSize: encMeta.fileSize,
    encryptedInvoiceContent: Buffer.from(encrypted).toString('base64'),
    offlineMode: true,
  };
}

const POLL_OPTIONS = { intervalMs: 5000, maxAttempts: 40 };

describe('29 - Technical Correction', { timeout: 300_000 }, () => {
  it('should correct a rejected invoice in the same session', async () => {
    const { client, nip, encryptionData } = await authenticateWithCertAndCrypto();
    const { cipherKey, cipherIv, encryptionInfo } = encryptionData;

    // Open session
    const formCode = getFormCode('FA_3');
    const openResponse = await client.onlineSession.openSession({
      formCode,
      encryption: encryptionInfo,
    });
    const sessionRef = openResponse.referenceNumber;
    expect(sessionRef).toBeTruthy();

    // Use a future date to trigger KSeF semantic rejection (status 450) — this is
    // intentional to produce a rejected invoice for testing the technical correction flow.
    const badRequest = prepareAndEncryptInvoiceWithDate(client, nip, futureDateString(2), cipherKey, cipherIv);

    try {
      const badSendResponse = await client.onlineSession.sendInvoice(sessionRef, badRequest);
      const badInvoiceRef = badSendResponse.referenceNumber;
      expect(badInvoiceRef).toBeTruthy();

      // Poll for failure detection
      await pollUntil(
        () => client.sessionStatus.getSessionStatus(sessionRef),
        (s) => (s.failedInvoiceCount ?? 0) > 0,
        { ...POLL_OPTIONS, description: 'semantic rejection detection' },
      );

      // Get failed invoice hash
      const failedInvoice = await client.sessionStatus.getSessionInvoice(sessionRef, badInvoiceRef);
      expect(failedInvoice.status.code).toBe(450);
      const rejectedInvoiceHash = failedInvoice.invoiceHash;
      expect(rejectedInvoiceHash).toBeTruthy();

      // Send corrected invoice referencing the rejected hash
      const correctionRequest: SendInvoiceRequest = {
        ...prepareAndEncryptInvoiceWithDate(client, nip, todayString(), cipherKey, cipherIv),
        hashOfCorrectedInvoice: rejectedInvoiceHash,
      };
      const correctionResponse = await client.onlineSession.sendInvoice(sessionRef, correctionRequest);
      const correctionRef = correctionResponse.referenceNumber;
      expect(correctionRef).toBeTruthy();

      // Poll for correction success (100/150 = processing, 200 = success, ≥400 = failure)
      const correctionStatus = await pollUntil(
        () => client.sessionStatus.getSessionInvoice(sessionRef, correctionRef),
        (s) => s.status.code === 200 || s.status.code >= 400,
        { ...POLL_OPTIONS, description: 'technical correction processing' },
      );
      expect(correctionStatus.status.code).toBe(200);
    } finally {
      await client.onlineSession.closeSession(sessionRef).catch(() => {});
    }
  });

  it('should correct a rejected invoice in a different session', async () => {
    const { client, nip, encryptionData } = await authenticateWithCertAndCrypto();
    const { cipherKey, cipherIv, encryptionInfo } = encryptionData;

    // Open first session
    const formCode = getFormCode('FA_3');
    const openResponse = await client.onlineSession.openSession({
      formCode,
      encryption: encryptionInfo,
    });
    const sessionRef = openResponse.referenceNumber;
    expect(sessionRef).toBeTruthy();

    // Use a future date to trigger KSeF semantic rejection (status 450) — this is
    // intentional to produce a rejected invoice for testing cross-session technical correction.
    const badRequest = prepareAndEncryptInvoiceWithDate(client, nip, futureDateString(2), cipherKey, cipherIv);

    let rejectedInvoiceHash: string;

    try {
      const badSendResponse = await client.onlineSession.sendInvoice(sessionRef, badRequest);
      const badInvoiceRef = badSendResponse.referenceNumber;
      expect(badInvoiceRef).toBeTruthy();

      // Poll for failure detection
      await pollUntil(
        () => client.sessionStatus.getSessionStatus(sessionRef),
        (s) => (s.failedInvoiceCount ?? 0) > 0,
        { ...POLL_OPTIONS, description: 'semantic rejection detection' },
      );

      // Get failed invoice hash
      const failedInvoice = await client.sessionStatus.getSessionInvoice(sessionRef, badInvoiceRef);
      expect(failedInvoice.status.code).toBe(450);
      rejectedInvoiceHash = failedInvoice.invoiceHash;
      expect(rejectedInvoiceHash).toBeTruthy();
    } finally {
      await client.onlineSession.closeSession(sessionRef).catch(() => {});
    }

    // Re-authenticate with the same NIP, open second session
    const { client: client2, encryptionData: encryptionData2 } = await authenticateWithCertAndCrypto(nip);
    const openResponse2 = await client2.onlineSession.openSession({
      formCode,
      encryption: encryptionData2.encryptionInfo,
    });
    const sessionRef2 = openResponse2.referenceNumber;
    expect(sessionRef2).toBeTruthy();

    try {
      // Send corrected invoice in second session
      const correctionRequest: SendInvoiceRequest = {
        ...prepareAndEncryptInvoiceWithDate(
          client2, nip, todayString(),
          encryptionData2.cipherKey, encryptionData2.cipherIv,
        ),
        hashOfCorrectedInvoice: rejectedInvoiceHash,
      };
      const correctionResponse = await client2.onlineSession.sendInvoice(sessionRef2, correctionRequest);
      const correctionRef = correctionResponse.referenceNumber;
      expect(correctionRef).toBeTruthy();

      // Poll for correction success (100/150 = processing, 200 = success, ≥400 = failure)
      const correctionStatus = await pollUntil(
        () => client2.sessionStatus.getSessionInvoice(sessionRef2, correctionRef),
        (s) => s.status.code === 200 || s.status.code >= 400,
        { ...POLL_OPTIONS, description: 'technical correction in new session' },
      );
      expect(correctionStatus.status.code).toBe(200);
    } finally {
      await client2.onlineSession.closeSession(sessionRef2).catch(() => {});
    }
  });
});
