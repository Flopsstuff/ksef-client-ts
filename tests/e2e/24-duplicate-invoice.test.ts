import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { authenticateWithCertAndCrypto } from './helpers/auth.js';
import { getFormCode, prepareInvoiceXml } from './helpers/invoices.js';
import { pollUntil } from './helpers/polling.js';
import { uploadBatch } from '../../src/workflows/batch-session-workflow.js';

const POLL_OPTIONS = { intervalMs: 5000, maxAttempts: 60 };

describe('24 - Duplicate Invoice Detection', { timeout: 300_000 }, () => {
  it('should detect duplicate when same invoice sent in batch then online', async () => {
    const { client, nip, encryptionData } = await authenticateWithCertAndCrypto();
    const { cipherKey, cipherIv, encryptionInfo } = encryptionData;
    const sharedInvoiceNumber = randomUUID();
    const formCode = getFormCode('FA_2');

    // Step 1: Send invoice in batch session
    const invoiceXml = prepareInvoiceXml('FA_2', { nip, invoiceNumber: sharedInvoiceNumber });
    const zip = new JSZip();
    zip.file('invoice-1.xml', invoiceXml);
    const zipData = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

    const batchResult = await uploadBatch(client, zipData, {
      formCode,
      pollOptions: POLL_OPTIONS,
    });
    expect(batchResult.upo.successfulInvoiceCount).toBe(1);
    expect(batchResult.upo.failedInvoiceCount ?? 0).toBe(0);

    // Step 2: Wait for invoice to be indexed
    await pollUntil(
      () => client.sessionStatus.getSessionInvoices(batchResult.sessionRef),
      (r) => r.invoices.length > 0 && !!r.invoices[0]!.ksefNumber,
      { intervalMs: 3000, maxAttempts: 20, description: 'batch invoice indexing' },
    );

    // Step 3: Send the same invoice in an online session
    const openResponse = await client.onlineSession.openSession({
      formCode,
      encryption: encryptionInfo,
    });
    const onlineSessionRef = openResponse.referenceNumber;

    // Encrypt the same invoice XML for online send
    const plainBytes = new TextEncoder().encode(invoiceXml);
    const encryptedBytes = client.crypto.encryptAES256(plainBytes, cipherKey, cipherIv);
    const plainMeta = client.crypto.getFileMetadata(plainBytes);
    const encryptedMeta = client.crypto.getFileMetadata(encryptedBytes);

    await client.onlineSession.sendInvoice(onlineSessionRef, {
      invoiceHash: plainMeta.hashSHA,
      invoiceSize: plainMeta.fileSize,
      encryptedInvoiceHash: encryptedMeta.hashSHA,
      encryptedInvoiceSize: encryptedMeta.fileSize,
      encryptedInvoiceContent: Buffer.from(encryptedBytes).toString('base64'),
    });

    // Step 4: Poll for failure detection
    await pollUntil(
      () => client.sessionStatus.getSessionStatus(onlineSessionRef),
      (s) => (s.failedInvoiceCount ?? 0) > 0,
      { intervalMs: 3000, maxAttempts: 40, description: 'duplicate invoice detection' },
    );

    // Step 5: Verify failed invoice has status 440 (duplicate)
    const failedResponse = await client.sessionStatus.getSessionFailedInvoices(onlineSessionRef);
    expect(failedResponse.invoices.length).toBeGreaterThanOrEqual(1);
    expect(failedResponse.invoices[0]!.status.code).toBe(440);

    // Step 6: Close online session and verify final status
    await client.onlineSession.closeSession(onlineSessionRef);
    const finalStatus = await pollUntil(
      () => client.sessionStatus.getSessionStatus(onlineSessionRef),
      (s) => s.status.code !== 100,
      { intervalMs: 3000, maxAttempts: 30, description: 'session close after duplicate' },
    );
    expect(finalStatus.failedInvoiceCount).toBeGreaterThanOrEqual(1);
  });
});
