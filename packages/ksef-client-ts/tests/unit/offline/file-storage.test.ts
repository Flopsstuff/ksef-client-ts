import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { FileOfflineInvoiceStorage } from '../../../src/offline/file-storage.js';
import type { OfflineInvoiceMetadata } from '../../../src/offline/types.js';

const ID1 = '00000000-0000-4000-8000-000000000001';
const ID2 = '00000000-0000-4000-8000-000000000002';
const ID3 = '00000000-0000-4000-8000-000000000003';
const ID_GOOD = '00000000-0000-4000-8000-00000000000a';
const ID_BAD = '00000000-0000-4000-8000-00000000000b';
const ID_MISSING = '00000000-0000-4000-8000-ffffffffffff';

function makeInvoice(overrides: Partial<OfflineInvoiceMetadata> = {}): OfflineInvoiceMetadata {
  return {
    id: ID1,
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
    const result = await storage.get(ID1);
    expect(result).toEqual(inv);
  });

  it('get returns null for missing', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    expect(await storage.get(ID_MISSING)).toBeNull();
  });

  it('creates directory if not exists', async () => {
    const nested = path.join(testDir, 'sub', 'dir');
    const storage = new FileOfflineInvoiceStorage(nested);
    await storage.save(makeInvoice());
    expect(fs.existsSync(nested)).toBe(true);
  });

  it('list with filters', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await storage.save(makeInvoice({ id: ID1, status: 'GENERATED' }));
    await storage.save(makeInvoice({ id: ID2, status: 'QUEUED' }));
    await storage.save(makeInvoice({ id: ID3, status: 'GENERATED' }));
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
    await storage.update(ID1, { status: 'QUEUED' });
    const result = await storage.get(ID1);
    expect(result!.status).toBe('QUEUED');
    expect(result!.invoiceNumber).toBe('FV/2026/001');
  });

  it('update non-existent throws', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await expect(storage.update(ID_MISSING, { status: 'QUEUED' }))
      .rejects.toThrow(`Offline invoice not found: ${ID_MISSING}`);
  });

  it('delete removes file', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await storage.save(makeInvoice());
    await storage.delete(ID1);
    expect(await storage.get(ID1)).toBeNull();
    expect(fs.existsSync(path.join(testDir, `${ID1}.json`))).toBe(false);
  });

  it('skips corrupt JSON on list', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await storage.save(makeInvoice({ id: ID_GOOD }));
    fs.writeFileSync(path.join(testDir, `${ID_BAD}.json`), 'not-json{{{');
    const result = await storage.list();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(ID_GOOD);
  });

  it('get returns null for corrupt file', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, `${ID_BAD}.json`), '{broken');
    expect(await storage.get(ID_BAD)).toBeNull();
  });

  it('get warns on corrupt JSON', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, `${ID_BAD}.json`), '{broken');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await storage.get(ID_BAD);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0]).toContain(ID_BAD);
    warnSpy.mockRestore();
  });

  it('get does not warn for missing file', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await storage.get(ID_MISSING);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('list warns about corrupt files', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await storage.save(makeInvoice({ id: ID_GOOD }));
    fs.writeFileSync(path.join(testDir, `${ID_BAD}.json`), 'not-json');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await storage.list();
    expect(result).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0]).toContain(ID_BAD);
    warnSpy.mockRestore();
  });

  it('does not expand ~username style paths', async () => {
    const storage = new FileOfflineInvoiceStorage('~nonexistent-user-test/invoices');
    const result = await storage.list();
    expect(result).toEqual([]);
  });

  it('atomic write creates temp file then renames', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await storage.save(makeInvoice());
    const files = fs.readdirSync(testDir);
    expect(files.every(f => !f.endsWith('.tmp'))).toBe(true);
    expect(files).toContain(`${ID1}.json`);
  });
});

describe('path traversal protection', () => {
  it('rejects path traversal in get', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await expect(storage.get('../../../etc/passwd')).rejects.toThrow('Invalid invoice ID');
  });

  it('rejects path separator in get', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await expect(storage.get('subdir/file')).rejects.toThrow('Invalid invoice ID');
  });

  it('rejects path traversal in delete', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await expect(storage.delete('../../../etc/passwd')).rejects.toThrow('Invalid invoice ID');
  });

  it('rejects path traversal in update', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await expect(storage.update('../secret', { status: 'QUEUED' })).rejects.toThrow('Invalid invoice ID');
  });

  it('rejects path traversal in save', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    const inv = makeInvoice({ id: '../../../etc/evil' });
    await expect(storage.save(inv)).rejects.toThrow('Invalid invoice ID');
  });

  it('rejects empty string', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    await expect(storage.get('')).rejects.toThrow('Invalid invoice ID');
  });

  it('accepts valid UUID', async () => {
    const storage = new FileOfflineInvoiceStorage(testDir);
    const result = await storage.get('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
    expect(result).toBeNull();
  });
});
