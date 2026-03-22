import { describe, it, expect } from 'vitest';
import { authenticateWithCertAndCrypto } from './helpers/auth.js';
import { getFormCode, prepareAndEncryptInvoice } from './helpers/invoices.js';
import { pollUntil } from './helpers/polling.js';

describe('04 - Online Session E2E', { timeout: 180_000 }, () => {
  it('should complete full online session lifecycle with FA_2', async () => {
    const { client, nip, encryptionData } = await authenticateWithCertAndCrypto();
    const { cipherKey, cipherIv, encryptionInfo } = encryptionData;

    // Step 1: Open session
    const formCode = getFormCode('FA_2');
    const openResponse = await client.onlineSession.openSession({
      formCode,
      encryption: encryptionInfo,
    });
    const sessionRef = openResponse.referenceNumber;
    expect(sessionRef).toBeTruthy();
    expect(openResponse.validUntil).toBeTruthy();

    // Step 2: Prepare and send invoice
    const { sendRequest } = prepareAndEncryptInvoice(client, 'FA_2', nip, cipherKey, cipherIv);
    const sendResponse = await client.onlineSession.sendInvoice(sessionRef, sendRequest);
    const invoiceRef = sendResponse.referenceNumber;
    expect(invoiceRef).toBeTruthy();

    // Step 3: Poll for invoice processing
    await pollUntil(
      () => client.sessionStatus.getSessionStatus(sessionRef),
      (s) => (s.successfulInvoiceCount ?? 0) > 0,
      { intervalMs: 5000, maxAttempts: 30, description: 'invoice processing' },
    );

    // Step 4: Close session
    await client.onlineSession.closeSession(sessionRef);

    // Step 5: Poll for session completion (UPO generation)
    const finalStatus = await pollUntil(
      () => client.sessionStatus.getSessionStatus(sessionRef),
      (s) => s.status.code === 200,
      { intervalMs: 5000, maxAttempts: 30, description: 'session close + UPO' },
    );
    expect(finalStatus.successfulInvoiceCount).toBe(1);
    expect(finalStatus.failedInvoiceCount ?? 0).toBe(0);
    expect(finalStatus.upo).toBeDefined();
    expect(finalStatus.upo!.pages.length).toBeGreaterThan(0);
    const upoRef = finalStatus.upo!.pages[0]!.referenceNumber;

    // Step 6: Get session invoices
    const invoicesResponse = await client.sessionStatus.getSessionInvoices(sessionRef);
    expect(invoicesResponse.invoices.length).toBe(1);
    const invoiceStatus = invoicesResponse.invoices[0]!;
    expect(invoiceStatus.ksefNumber).toBeTruthy();
    expect(invoiceStatus.invoiceNumber).toBeTruthy();
    expect(invoiceStatus.status.code).toBe(200);
    const ksefNumber = invoiceStatus.ksefNumber!;

    // Step 7: Get UPO by KSeF number
    const upoByKsef = await client.sessionStatus.getInvoiceUpoByKsefNumber(sessionRef, ksefNumber);
    expect(upoByKsef.upo).toBeTruthy();
    expect(upoByKsef.upo.length).toBeGreaterThan(0);

    // Step 8: Get UPO by invoice reference
    const upoByRef = await client.sessionStatus.getInvoiceUpoByReference(sessionRef, invoiceRef);
    expect(upoByRef.upo).toBeTruthy();

    // Step 9: Get session UPO
    const sessionUpo = await client.sessionStatus.getSessionUpo(sessionRef, upoRef);
    expect(sessionUpo.upo).toBeTruthy();

    // Step 10: Get invoice XML by KSeF number
    const invoiceXml = await client.invoices.getInvoice(ksefNumber);
    expect(invoiceXml).toContain(nip);
    expect(invoiceXml).toContain('Faktura');
  });

  it('should report status 445 when sending invoice with wrong NIP', async () => {
    const { client, encryptionData } = await authenticateWithCertAndCrypto();
    const { cipherKey, cipherIv, encryptionInfo } = encryptionData;

    // Open session
    const openResponse = await client.onlineSession.openSession({
      formCode: getFormCode('FA_2'),
      encryption: encryptionInfo,
    });
    const sessionRef = openResponse.referenceNumber;

    // Send invoice with wrong NIP (not matching context)
    const { sendRequest } = prepareAndEncryptInvoice(client, 'FA_2', '0000000000', cipherKey, cipherIv);
    await client.onlineSession.sendInvoice(sessionRef, sendRequest);

    // Poll for failure detection
    await pollUntil(
      () => client.sessionStatus.getSessionStatus(sessionRef),
      (s) => (s.failedInvoiceCount ?? 0) > 0,
      { intervalMs: 3000, maxAttempts: 30, description: 'failed invoice detection' },
    );

    // Close session
    await client.onlineSession.closeSession(sessionRef);

    // Poll for final status
    const finalStatus = await pollUntil(
      () => client.sessionStatus.getSessionStatus(sessionRef),
      (s) => s.status.code !== 100,
      { intervalMs: 3000, maxAttempts: 30, description: 'session close after failure' },
    );
    expect(finalStatus.status.code).toBe(445);
    expect(finalStatus.failedInvoiceCount).toBeGreaterThanOrEqual(1);
  });
});
