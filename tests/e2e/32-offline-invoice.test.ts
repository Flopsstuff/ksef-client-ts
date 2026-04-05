import { describe, it, expect } from 'vitest';
import { authenticateWithCertAndCrypto } from './helpers/auth.js';
import { getFormCode, prepareAndEncryptInvoice } from './helpers/invoices.js';
import { pollUntil } from './helpers/polling.js';
import { OfflineInvoiceWorkflow } from '../../src/workflows/offline-invoice-workflow.js';
import { InMemoryOfflineInvoiceStorage } from '../../src/offline/storage.js';
import { VerificationLinkService } from '../../src/qr/verification-link-service.js';

describe('32 - Offline Invoice E2E', { timeout: 180_000 }, () => {
  it('should generate offline invoice metadata with QR codes', async () => {
    const { client, nip } = await authenticateWithCertAndCrypto();
    const workflow = client.offline;

    const storage = new InMemoryOfflineInvoiceStorage();
    const metadata = await workflow.generate(
      {
        invoiceNumber: `OFFLINE-E2E-${Date.now()}`,
        invoiceDate: new Date().toISOString().slice(0, 10),
        invoiceXml: '<FA><P_1>2026-04-05</P_1></FA>',
        sellerNip: nip,
        sellerIdentifier: { type: 'Nip', value: nip },
      },
      { storage, mode: 'offline24' },
    );

    expect(metadata.id).toBeTruthy();
    expect(metadata.status).toBe('GENERATED');
    expect(metadata.mode).toBe('offline24');
    expect(metadata.kod1Url).toContain('/invoice/');
    expect(metadata.submitBy).toBeTruthy();

    const stored = await storage.get(metadata.id);
    expect(stored).toEqual(metadata);
  });

  it('should submit offline invoice to KSeF with offlineMode flag', async () => {
    const { client, nip, encryptionData } = await authenticateWithCertAndCrypto();
    const { cipherKey, cipherIv, encryptionInfo } = encryptionData;

    // Open session
    const formCode = getFormCode('FA_3');
    const openResponse = await client.onlineSession.openSession({
      formCode,
      encryption: encryptionInfo,
    });
    const sessionRef = openResponse.referenceNumber;

    // Send invoice with offlineMode: true
    const { sendRequest } = prepareAndEncryptInvoice(client, 'FA_3', nip, cipherKey, cipherIv);
    const offlineRequest = { ...sendRequest, offlineMode: true };
    const sendResponse = await client.onlineSession.sendInvoice(sessionRef, offlineRequest);
    expect(sendResponse.referenceNumber).toBeTruthy();

    // Close and verify
    await client.onlineSession.closeSession(sessionRef);

    const finalStatus = await pollUntil(
      () => client.sessionStatus.getSessionStatus(sessionRef),
      (s) => s.status.code === 200,
      { intervalMs: 5000, maxAttempts: 30, description: 'offline session close' },
    );
    expect(finalStatus.successfulInvoiceCount).toBe(1);
  });
});
