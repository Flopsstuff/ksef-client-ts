import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { authenticateWithCertAndCrypto } from './helpers/auth.js';
import { getFormCode, prepareInvoiceXml } from './helpers/invoices.js';
import { pollUntil } from './helpers/polling.js';

describe('05 - Batch Session E2E', { timeout: 300_000 }, () => {
  it('should complete full batch session with 5 invoices', async () => {
    const INVOICE_COUNT = 5;
    const { client, nip, encryptionData } = await authenticateWithCertAndCrypto();
    const { cipherKey, cipherIv, encryptionInfo } = encryptionData;

    // Step 1: Generate invoice XMLs
    const invoiceXmls: string[] = [];
    for (let i = 0; i < INVOICE_COUNT; i++) {
      invoiceXmls.push(prepareInvoiceXml('FA_2', { nip }));
    }

    // Step 2: Create ZIP archive
    const zip = new JSZip();
    for (let i = 0; i < invoiceXmls.length; i++) {
      zip.file(`invoice-${i + 1}.xml`, invoiceXmls[i]!);
    }
    const zipArrayBuffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const zipBuffer = new Uint8Array(zipArrayBuffer);

    // Step 3: Compute ZIP metadata BEFORE encryption
    const zipMeta = client.crypto.getFileMetadata(zipBuffer);

    // Step 4: Encrypt ZIP
    const encryptedZip = client.crypto.encryptAES256(zipBuffer, cipherKey, cipherIv);

    // Step 5: Single part (small zip)
    const partMeta = client.crypto.getFileMetadata(encryptedZip);
    const partInfos = [{
      ordinalNumber: 1,
      fileSize: partMeta.fileSize,
      fileHash: partMeta.hashSHA,
    }];

    // Step 6: Open batch session
    const openResp = await client.batchSession.openSession({
      formCode: getFormCode('FA_2'),
      batchFile: {
        fileSize: zipMeta.fileSize,
        fileHash: zipMeta.hashSHA,
        fileParts: partInfos,
      },
      encryption: encryptionInfo,
    });
    expect(openResp.referenceNumber).toBeTruthy();
    expect(openResp.partUploadRequests.length).toBe(1);

    // Step 7: Upload parts
    const batchParts = [{
      data: encryptedZip.buffer as ArrayBuffer,
      metadata: partMeta,
      ordinalNumber: 1,
    }];
    await client.batchSession.sendParts(openResp, batchParts);

    // Step 8: Close session
    await client.batchSession.closeSession(openResp.referenceNumber);

    // Step 9: Poll for completion
    const finalStatus = await pollUntil(
      () => client.sessionStatus.getSessionStatus(openResp.referenceNumber),
      (s) => s.status.code === 200 || s.status.code >= 400,
      { intervalMs: 5000, maxAttempts: 60, description: 'batch processing' },
    );
    expect(finalStatus.status.code).toBe(200);
    expect(finalStatus.successfulInvoiceCount).toBe(INVOICE_COUNT);
    expect(finalStatus.failedInvoiceCount ?? 0).toBe(0);

    // Step 10: Verify invoices
    const invoicesResp = await client.sessionStatus.getSessionInvoices(openResp.referenceNumber);
    expect(invoicesResp.invoices.length).toBe(INVOICE_COUNT);
    for (const inv of invoicesResp.invoices) {
      expect(inv.ksefNumber).toBeTruthy();
      expect(inv.status.code).toBe(200);
    }

    // Step 11: Get UPO
    if (finalStatus.upo && finalStatus.upo.pages.length > 0) {
      const upoRef = finalStatus.upo.pages[0]!.referenceNumber;
      const upo = await client.sessionStatus.getSessionUpo(openResp.referenceNumber, upoRef);
      expect(upo.upo).toBeTruthy();
    }
  });
});
