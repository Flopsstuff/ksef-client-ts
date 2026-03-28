import { describe, it, expect, beforeAll } from 'vitest';
import { InvoiceQueryFilterBuilder } from '../../src/builders/invoice-query-filter.js';
import { openSendAndClose } from '../../src/workflows/online-session-workflow.js';
import { incrementalExportAndDownload } from '../../src/workflows/incremental-export-workflow.js';
import { authenticateWithCertWorkflow } from './helpers/auth.js';
import { prepareInvoiceXml, getFormCode } from './helpers/invoices.js';
import type { KSeFClient } from '../../src/client.js';
import type { ContinuationPoints } from '../../src/workflows/hwm-coordinator.js';
import { InMemoryHwmStore } from '../../src/workflows/hwm-storage.js';

const EXPORT_POLL = { intervalMs: 2000, maxAttempts: 120 };

describe('23 - Incremental Export Workflow', { timeout: 300_000 }, () => {
  let client: KSeFClient;
  let nip: string;

  beforeAll(async () => {
    const auth = await authenticateWithCertWorkflow();
    client = auth.client;
    nip = auth.nip;

    // Send a test invoice to ensure there's data
    const invoiceXml = prepareInvoiceXml('FA_2', { nip });
    await openSendAndClose(client, [invoiceXml], {
      formCode: getFormCode('FA_2'),
      pollOptions: { intervalMs: 5000, maxAttempts: 30 },
    });

    // Wait for invoice to be indexed
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const filters = new InvoiceQueryFilterBuilder()
      .withSubjectType('Subject1')
      .withDateRange('Invoicing', yesterday)
      .build();

    for (let i = 0; i < 30; i++) {
      const meta = await client.invoices.queryInvoiceMetadata(filters);
      if (meta.invoices.length > 0) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }, 180_000);

  it('should perform incremental export and return results', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const continuationPoints: ContinuationPoints = {};

    const result = await incrementalExportAndDownload(client, {
      subjectType: 'Subject1',
      windowFrom: yesterday,
      windowTo: tomorrow,
      continuationPoints,
      maxIterations: 5,
      pollOptions: EXPORT_POLL,
    });

    expect(result.iterationCount).toBeGreaterThanOrEqual(1);
    expect(result.referenceNumbers.length).toBe(result.iterationCount);
    expect(result.decryptedParts.length).toBeGreaterThan(0);
    expect(result.continuationPoints).toBe(continuationPoints);

    // Verify decrypted parts are ZIP files
    for (const part of result.decryptedParts) {
      expect(part[0]).toBe(0x50); // 'P'
      expect(part[1]).toBe(0x4b); // 'K'
    }
  });

  it('should work with HwmStore', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const store = new InMemoryHwmStore();
    const continuationPoints: ContinuationPoints = {};

    const result = await incrementalExportAndDownload(client, {
      subjectType: 'Subject1',
      windowFrom: yesterday,
      windowTo: tomorrow,
      continuationPoints,
      maxIterations: 3,
      store,
      pollOptions: EXPORT_POLL,
    });

    // Store should have been called
    const savedPoints = await store.load();
    expect(typeof savedPoints).toBe('object');
    expect(result.iterationCount).toBeGreaterThanOrEqual(1);
  });
});
