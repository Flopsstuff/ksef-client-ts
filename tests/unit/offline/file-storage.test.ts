import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { FileOfflineInvoiceStorage } from '../../../src/offline/file-storage.js';
import type { OfflineInvoiceMetadata } from '../../../src/offline/types.js';

function makeInvoice(overrides: Partial<OfflineInvoiceMetadata> = {}): OfflineInvoiceMetadata {
  return {
    id: 'inv-1',
    mode: 'offline24',
    reason: 'PLANNED',
    status: 'GENERATED',
    invoiceNumber: 'FV/2026/001',
    invoiceDate: '2026-04-08',
    invoiceXml: '<FA/>',
    sellerNip: '1234567890',
    sellerIdentifier: { type: 'Nip', value: '1234567890' },
    kod1Url: 'https://qr-test.ksef.mf.gov.pl/invoice/...',
    generatedAt: '2026-04-08T10:00:00Z',
    submitBy: '2026-04-09T23:59:59Z',
    ...overrides,
  };
}

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ksef-offline-test-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('FileOfflineInvoiceStorage', () => {
  it('save and get round-trip', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    const inv = makeInvoice();
    await storage.save(inv);
    const result = await storage.get('inv-1');
    expect(result).toEqual(inv);
  });

  it('get returns null for missing', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    expect(await storage.get('missing')).toBeNull();
  });

  it('creates directory if not exists', async () => {
    const nested = path.join(testDir, 'sub', 'dir');
    const storage = new FileOfflineInvoiceStorage(nested);
    await storage.save(makeInvoice());
    expect(fs.existsSync(nested)).toBe(true);
  });

  it('list with filters', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await storage.save(makeInvoice({ id: 'a', status: 'GENERATED' }));
    await storage.save(makeInvoice({ id: 'b', status: 'QUEUED' }));
    await storage.save(makeInvoice({ id: 'c', status: 'GENERATED' }));
    const result = await storage.list({ status: 'GENERATED' });
    expect(result).toHaveLength(2);
  });

  it('list returns empty for non-existent directory', async () => {
    const storage = new FileOfflineInvoiceStorage(path.join(testDir, 'nope'));
    const result = await storage.list();
    expect(result).toEqual([]);
  });

  it('update partial fields', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await storage.save(makeInvoice());
    await storage.update('inv-1', { status: 'QUEUED' });
    const result = await storage.get('inv-1');
    expect(result!.status).toBe('QUEUED');
    expect(result!.invoiceNumber).toBe('FV/2026/001');
  });

  it('update non-existent throws', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await expect(storage.update('missing', { status: 'QUEUED' }))
      .rejects.toThrow('Offline invoice not found: missing');
  });

  it('delete removes file', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await storage.save(makeInvoice());
    await storage.delete('inv-1');
    expect(await storage.get('inv-1')).toBeNull();
    expect(fs.existsSync(path.join(testDir, 'inv-1.json'))).toBe(false);
  });

  it('skips corrupt JSON on list', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await storage.save(makeInvoice({ id: 'good' }));
    fs.writeFileSync(path.join(testDir, 'bad.json'), 'not-json{{{');
    const result = await storage.list();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('good');
  });

  it('get returns null for corrupt file', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'bad.json'), '{broken');
    expect(await storage.get('bad')).toBeNull();
  });

  it('atomic write creates temp file then renames', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await storage.save(makeInvoice());
    // After save, there should be no .tmp file
    const files = fs.readdirSync(testDir);
    expect(files.every(f => !f.endsWith('.tmp'))).toBe(true);
    expect(files).toContain('inv-1.json');
  });
});
