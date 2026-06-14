import { describe, it, expect, beforeAll } from 'vitest';
import { InvoiceQueryFilterBuilder } from '../../src/builders/invoice-query-filter.js';
import { openSendAndClose } from '../../src/workflows/online-session-workflow.js';
import { incrementalExportAndDownload } from '../../src/workflows/incremental-export-workflow.js';
import { authenticateWithCertWorkflow } from './helpers/auth.js';
import { prepareInvoiceXml, getFormCode } from './helpers/invoices.js';
import { unzip } from '../../src/utils/zip.js';
import type { KSeFClient } from '../../src/client.js';
import { deduplicateByKsefNumber, type ContinuationPoints } from '../../src/workflows/hwm-coordinator.js';
import type { ExportResult } from '../../src/workflows/types.js';
import { InMemoryHwmStore } from '../../src/workflows/hwm-storage.js';

const EXPORT_POLL = { intervalMs: 2000, maxAttempts: 120 };

/**
 * KSeF assigns PermanentStorage dates in CET/CEST (Europe/Warsaw).
 * Compute date strings in Polish timezone so export filters align with
 * KSeF regardless of where the test runner is located (CI uses UTC).
 */
function dateInCET(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
}

describe('23 - Incremental Export Workflow', { timeout: 300_000 }, () => {
  let client: KSeFClient;
  let nip: string;

  beforeAll(async () => {
    const auth = await authenticateWithCertWorkflow();
    client = auth.client;
    nip = auth.nip;

    // Send test invoices to ensure there's data
    const invoices = Array.from({ length: 3 }, () => prepareInvoiceXml('FA_3', { nip }));
    await openSendAndClose(client, invoices, {
      formCode: getFormCode('FA_3'),
      pollOptions: { intervalMs: 5000, maxAttempts: 30 },
    });

    // Wait for invoices to reach PermanentStorage index (used by incremental export)
    const yesterday = dateInCET(-1);
    const permStorageFilters = new InvoiceQueryFilterBuilder()
      .withSubjectType('Subject1')
      .withDateRange('PermanentStorage', yesterday)
      .build();

    for (let i = 0; i < 60; i++) {
      const meta = await client.invoices.queryInvoiceMetadata(permStorageFilters);
      if (meta.invoices.length > 0) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }, 180_000);

  it('should perform incremental export and return results', async () => {
    const yesterday = dateInCET(-1);
    const tomorrow = dateInCET(+1);
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
    const yesterday = dateInCET(-1);
    const tomorrow = dateInCET(+1);
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

  it('should advance continuation points after export', async () => {
    const yesterday = dateInCET(-1);
    const tomorrow = dateInCET(+1);
    const continuationPoints: ContinuationPoints = {};

    const result = await incrementalExportAndDownload(client, {
      subjectType: 'Subject1',
      windowFrom: yesterday,
      windowTo: tomorrow,
      continuationPoints,
      maxIterations: 5,
      pollOptions: EXPORT_POLL,
    });

    // continuationPoints is mutated in-place
    expect(result.continuationPoints).toBe(continuationPoints);

    // If multiple iterations occurred, the continuation point must have advanced
    if (result.iterationCount > 1) {
      expect(continuationPoints['Subject1']).toBeTruthy();
    }
  });

  it('should extract invoice XML from decrypted ZIP parts', async () => {
    const yesterday = dateInCET(-1);
    const tomorrow = dateInCET(+1);

    const result = await incrementalExportAndDownload(client, {
      subjectType: 'Subject1',
      windowFrom: yesterday,
      windowTo: tomorrow,
      continuationPoints: {},
      maxIterations: 3,
      pollOptions: EXPORT_POLL,
    });

    expect(result.decryptedParts.length).toBeGreaterThan(0);

    let foundXml = false;
    for (const part of result.decryptedParts) {
      const files = await unzip(Buffer.from(part));
      expect(files.size).toBeGreaterThan(0);

      for (const [name, content] of files) {
        if (name.endsWith('.xml')) {
          foundXml = true;
          const xml = content.toString('utf-8');
          expect(xml).toContain('<Faktura');
        }
      }
    }
    expect(foundXml).toBe(true);
  });

  it('should deduplicate invoices from overlapping exports', async () => {
    const yesterday = dateInCET(-1);
    const tomorrow = dateInCET(+1);

    // Run two exports with the same date window — both will return the same invoices
    const [resultA, resultB] = await Promise.all([
      incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: yesterday,
        windowTo: tomorrow,
        continuationPoints: {},
        maxIterations: 3,
        pollOptions: EXPORT_POLL,
      }),
      incrementalExportAndDownload(client, {
        subjectType: 'Subject1',
        windowFrom: yesterday,
        windowTo: tomorrow,
        continuationPoints: {},
        maxIterations: 3,
        pollOptions: EXPORT_POLL,
      }),
    ]);

    // Extract ksefNumbers from ZIP file names (KSeF packages as {ksefNumber}.xml)
    const allEntries: Array<{ ksefNumber: string; source: string }> = [];

    for (const [label, result] of [['A', resultA], ['B', resultB]] as const) {
      for (const part of result.decryptedParts) {
        const files = await unzip(Buffer.from(part));
        for (const [name] of files) {
          if (name.endsWith('.xml')) {
            const ksefNumber = name.replace(/\.xml$/, '');
            allEntries.push({ ksefNumber, source: label });
          }
        }
      }
    }

    // Both exports should have returned invoices
    const entriesFromA = allEntries.filter((e) => e.source === 'A');
    const entriesFromB = allEntries.filter((e) => e.source === 'B');
    expect(entriesFromA.length).toBeGreaterThan(0);
    expect(entriesFromB.length).toBeGreaterThan(0);

    // Combined has duplicates, dedup removes them
    const combined = allEntries.map((e) => ({ ksefNumber: e.ksefNumber }));
    const deduplicated = deduplicateByKsefNumber(combined);

    expect(combined.length).toBeGreaterThan(deduplicated.length);

    // All unique ksefNumbers are preserved
    const uniqueNumbers = new Set(combined.map((e) => e.ksefNumber.toLowerCase()));
    expect(deduplicated.length).toBe(uniqueNumbers.size);
  });

  it('should invoke onIterationComplete callback', async () => {
    const yesterday = dateInCET(-1);
    const tomorrow = dateInCET(+1);
    const iterations: Array<{ i: number; r: ExportResult }> = [];

    const result = await incrementalExportAndDownload(client, {
      subjectType: 'Subject1',
      windowFrom: yesterday,
      windowTo: tomorrow,
      continuationPoints: {},
      maxIterations: 5,
      pollOptions: EXPORT_POLL,
      onIterationComplete: (i, r) => iterations.push({ i, r }),
    });

    expect(iterations.length).toBe(result.iterationCount);
    expect(iterations[0]!.i).toBe(0);
    expect(iterations[0]!.r.invoiceCount).toBeGreaterThanOrEqual(0);
    expect(iterations[0]!.r.parts.length).toBeGreaterThan(0);
  });
});
