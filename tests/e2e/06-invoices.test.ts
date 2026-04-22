import { describe, it, expect, beforeAll } from 'vitest';
import { InvoiceQueryFilterBuilder } from '../../src/builders/invoice-query-filter.js';
import { authenticateWithCertAndCrypto } from './helpers/auth.js';
import { getFormCode, prepareAndEncryptInvoice } from './helpers/invoices.js';
import { pollUntil } from './helpers/polling.js';
import type { KSeFClient } from '../../src/client.js';

describe('06 - Invoice Query & Export', { timeout: 300_000 }, () => {
  let client: KSeFClient;
  let sentKsefNumber: string;
  let sentNip: string;
  let cipherKey: Uint8Array;
  let cipherIv: Uint8Array;

  beforeAll(async () => {
    // Setup: authenticate + send an invoice so there's data to query
    const setup = await authenticateWithCertAndCrypto();
    client = setup.client;
    sentNip = setup.nip;
    cipherKey = setup.encryptionData.cipherKey;
    cipherIv = setup.encryptionData.cipherIv;
    const nip = setup.nip;

    const openResp = await client.onlineSession.openSession({
      formCode: getFormCode('FA_3'),
      encryption: setup.encryptionData.encryptionInfo,
    });
    const sessionRef = openResp.referenceNumber;

    const { sendRequest } = prepareAndEncryptInvoice(client, 'FA_3', nip, cipherKey, cipherIv);
    await client.onlineSession.sendInvoice(sessionRef, sendRequest);

    await pollUntil(
      () => client.sessionStatus.getSessionStatus(sessionRef),
      (s) => (s.successfulInvoiceCount ?? 0) > 0,
      { intervalMs: 5000, maxAttempts: 30, description: 'invoice processing (query test setup)' },
    );
    await client.onlineSession.closeSession(sessionRef);
    await pollUntil(
      () => client.sessionStatus.getSessionStatus(sessionRef),
      (s) => s.status.code === 200,
      { intervalMs: 5000, maxAttempts: 30, description: 'session close (query test setup)' },
    );

    const invoices = await client.sessionStatus.getSessionInvoices(sessionRef);
    sentKsefNumber = invoices.invoices[0]!.ksefNumber!;
  }, 120_000);

  it('should query invoice metadata', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const filters = new InvoiceQueryFilterBuilder()
      .withSubjectType('Subject1')
      .withDateRange('Invoicing', yesterday)
      .build();
    const result = await client.invoices.queryInvoiceMetadata(filters);
    expect(result.invoices).toBeDefined();
    expect(Array.isArray(result.invoices)).toBe(true);
  });

  it('should get invoice by KSeF number', async () => {
    const { xml } = await client.invoices.getInvoice(sentKsefNumber);
    expect(xml).toContain('Faktura');
    expect(xml).toContain(sentNip);
  });

  it('should complete async export flow', async () => {
    const encData = await client.crypto.getEncryptionData();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    // Start export
    const filters = new InvoiceQueryFilterBuilder()
      .withSubjectType('Subject1')
      .withDateRange('Invoicing', yesterday)
      .build();
    const exportResp = await client.invoices.exportInvoices({
      filters,
      encryption: encData.encryptionInfo,
    });
    expect(exportResp.referenceNumber).toBeTruthy();

    // Poll for completion
    const exportStatus = await pollUntil(
      () => client.invoices.getInvoiceExportStatus(exportResp.referenceNumber),
      (s) => s.status.code === 200,
      { intervalMs: 2000, maxAttempts: 120, description: 'export completion' },
    );
    expect(exportStatus.package).toBeDefined();
    expect(exportStatus.package!.invoiceCount).toBeGreaterThan(0);
    expect(exportStatus.package!.parts.length).toBeGreaterThan(0);

    // Download and decrypt first part
    const part = exportStatus.package!.parts[0]!;
    const partResp = await fetch(part.url);
    expect(partResp.ok).toBe(true);
    const encryptedData = new Uint8Array(await partResp.arrayBuffer());
    const decrypted = client.crypto.decryptAES256(encryptedData, encData.cipherKey, encData.cipherIv);
    expect(decrypted.length).toBeGreaterThan(0);
    // Decrypted data is a ZIP — verify PK magic bytes
    expect(decrypted[0]).toBe(0x50); // 'P'
    expect(decrypted[1]).toBe(0x4b); // 'K'
  });
});
