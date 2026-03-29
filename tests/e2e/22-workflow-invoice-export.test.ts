import { describe, it, expect, beforeAll } from 'vitest';
import { InvoiceQueryFilterBuilder } from '../../src/builders/invoice-query-filter.js';
import { openSendAndClose } from '../../src/workflows/online-session-workflow.js';
import { exportInvoices, exportAndDownload } from '../../src/workflows/invoice-export-workflow.js';
import { authenticateWithCertWorkflow } from './helpers/auth.js';
import { prepareInvoiceXml, getFormCode } from './helpers/invoices.js';
import type { KSeFClient } from '../../src/client.js';
import type { InvoiceQueryFilters } from '../../src/models/invoices/types.js';

const EXPORT_POLL = { intervalMs: 2000, maxAttempts: 120 };

describe('22 - Invoice Export Workflow', { timeout: 300_000 }, () => {
  let client: KSeFClient;
  let filters: InvoiceQueryFilters;

  beforeAll(async () => {
    const auth = await authenticateWithCertWorkflow();
    client = auth.client;

    // Send an invoice so there's data to export
    const invoiceXml = prepareInvoiceXml('FA_3', { nip: auth.nip });
    await openSendAndClose(client, [invoiceXml], {
      formCode: getFormCode('FA_3'),
      pollOptions: { intervalMs: 5000, maxAttempts: 30 },
    });

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    filters = new InvoiceQueryFilterBuilder()
      .withSubjectType('Subject1')
      .withDateRange('Invoicing', yesterday)
      .build();

    // Wait until at least one invoice is indexed and queryable
    for (let i = 0; i < 30; i++) {
      const meta = await client.invoices.queryInvoiceMetadata(filters);
      if (meta.invoices.length > 0) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }, 180_000);

  it('should exportInvoices and return ExportResult with parts', async () => {
    const result = await exportInvoices(client, filters, { pollOptions: EXPORT_POLL });

    expect(result.invoiceCount).toBeGreaterThan(0);
    expect(result.parts.length).toBeGreaterThan(0);
    expect(typeof result.isTruncated).toBe('boolean');

    const part = result.parts[0]!;
    expect(part.ordinalNumber).toBeTypeOf('number');
    expect(part.url).toBeTruthy();
    expect(part.method).toBeTruthy();
    expect(part.partSize).toBeGreaterThan(0);
    expect(part.encryptedPartSize).toBeGreaterThan(0);
    expect(part.encryptedPartHash).toBeTruthy();
    expect(part.expirationDate).toBeTruthy();
  });

  it('should exportAndDownload and return decrypted ZIP parts', async () => {
    const result = await exportAndDownload(client, filters, { pollOptions: EXPORT_POLL });

    expect(result.invoiceCount).toBeGreaterThan(0);
    expect(result.parts.length).toBeGreaterThan(0);
    expect(result.decryptedParts.length).toBeGreaterThan(0);
    expect(result.decryptedParts.length).toBe(result.parts.length);

    const firstPart = result.decryptedParts[0]!;
    expect(firstPart.length).toBeGreaterThan(0);
    // Decrypted data should be a ZIP — verify PK magic bytes
    expect(firstPart[0]).toBe(0x50); // 'P'
    expect(firstPart[1]).toBe(0x4b); // 'K'
  });
});
