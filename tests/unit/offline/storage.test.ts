import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryOfflineInvoiceStorage } from '../../../src/offline/storage.js';
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

describe('InMemoryOfflineInvoiceStorage', () => {
  let storage: InMemoryOfflineInvoiceStorage;

  beforeEach(() => {
    storage = new InMemoryOfflineInvoiceStorage();
  });

  it('save and get round-trip', async () => {
    const inv = makeInvoice();
    await storage.save(inv);
    const result = await storage.get('inv-1');
    expect(result).toEqual(inv);
  });

  it('get returns null for missing', async () => {
    expect(await storage.get('missing')).toBeNull();
  });

  it('returns copies (no mutation)', async () => {
    const inv = makeInvoice();
    await storage.save(inv);
    const a = await storage.get('inv-1');
    const b = await storage.get('inv-1');
    expect(a).not.toBe(b);
  });

  it('update partial fields', async () => {
    await storage.save(makeInvoice());
    await storage.update('inv-1', { status: 'QUEUED' });
    const result = await storage.get('inv-1');
    expect(result!.status).toBe('QUEUED');
    expect(result!.invoiceNumber).toBe('FV/2026/001');
  });

  it('update non-existent throws', async () => {
    await expect(storage.update('missing', { status: 'QUEUED' }))
      .rejects.toThrow('Offline invoice not found: missing');
  });

  it('delete removes invoice', async () => {
    await storage.save(makeInvoice());
    await storage.delete('inv-1');
    expect(await storage.get('inv-1')).toBeNull();
  });

  it('list returns all without filter', async () => {
    await storage.save(makeInvoice({ id: 'a' }));
    await storage.save(makeInvoice({ id: 'b' }));
    const all = await storage.list();
    expect(all).toHaveLength(2);
  });

  it('filter by single status', async () => {
    await storage.save(makeInvoice({ id: 'a', status: 'GENERATED' }));
    await storage.save(makeInvoice({ id: 'b', status: 'QUEUED' }));
    await storage.save(makeInvoice({ id: 'c', status: 'GENERATED' }));
    const result = await storage.list({ status: 'GENERATED' });
    expect(result).toHaveLength(2);
  });

  it('filter by status array', async () => {
    await storage.save(makeInvoice({ id: 'a', status: 'GENERATED' }));
    await storage.save(makeInvoice({ id: 'b', status: 'QUEUED' }));
    await storage.save(makeInvoice({ id: 'c', status: 'ACCEPTED' }));
    const result = await storage.list({ status: ['GENERATED', 'QUEUED'] });
    expect(result).toHaveLength(2);
  });

  it('filter by mode', async () => {
    await storage.save(makeInvoice({ id: 'a', mode: 'offline24' }));
    await storage.save(makeInvoice({ id: 'b', mode: 'awaryjny' }));
    const result = await storage.list({ mode: 'offline24' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('filter by sellerNip', async () => {
    await storage.save(makeInvoice({ id: 'a', sellerNip: '111' }));
    await storage.save(makeInvoice({ id: 'b', sellerNip: '222' }));
    const result = await storage.list({ sellerNip: '111' });
    expect(result).toHaveLength(1);
  });

  it('filter by expiringBefore', async () => {
    await storage.save(makeInvoice({ id: 'a', submitBy: '2026-04-09T23:59:59Z' }));
    await storage.save(makeInvoice({ id: 'b', submitBy: '2026-04-15T23:59:59Z' }));
    const result = await storage.list({ expiringBefore: '2026-04-10T00:00:00Z' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('combined filters use AND logic', async () => {
    await storage.save(makeInvoice({ id: 'a', status: 'GENERATED', sellerNip: '111' }));
    await storage.save(makeInvoice({ id: 'b', status: 'GENERATED', sellerNip: '222' }));
    await storage.save(makeInvoice({ id: 'c', status: 'QUEUED', sellerNip: '111' }));
    const result = await storage.list({ status: 'GENERATED', sellerNip: '111' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });
});
