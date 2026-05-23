import { describe, it, expect } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { createTarGz, extractTarGz } from '../../../src/utils/targz.js';

describe('targz', () => {
  it('produces a valid gzip stream', async () => {
    const archive = await createTarGz([{ fileName: 'a.xml', content: Buffer.from('<a/>') }]);
    // gzip magic bytes
    expect(archive[0]).toBe(0x1f);
    expect(archive[1]).toBe(0x8b);
    // decompresses without throwing
    expect(() => gunzipSync(archive)).not.toThrow();
  });

  it('round-trips entries through create + extract', async () => {
    const entries = [
      { fileName: 'invoice-1.xml', content: Buffer.from('<Faktura>1</Faktura>') },
      { fileName: 'invoice-2.xml', content: Buffer.from('<Faktura>2</Faktura>') },
    ];
    const archive = await createTarGz(entries);
    const files = await extractTarGz(archive);

    expect(files.size).toBe(2);
    expect(files.get('invoice-1.xml')?.toString()).toBe('<Faktura>1</Faktura>');
    expect(files.get('invoice-2.xml')?.toString()).toBe('<Faktura>2</Faktura>');
  });

  it('preserves binary content exactly', async () => {
    const bytes = Buffer.from([0, 1, 2, 255, 254, 0, 128]);
    const archive = await createTarGz([{ fileName: 'bin', content: bytes }]);
    const files = await extractTarGz(archive);
    expect(Buffer.compare(files.get('bin')!, bytes)).toBe(0);
  });

  it('enforces the max-files limit', async () => {
    const entries = Array.from({ length: 3 }, (_, i) => ({
      fileName: `f${i}`,
      content: Buffer.from('x'),
    }));
    const archive = await createTarGz(entries);
    await expect(extractTarGz(archive, { maxFiles: 2 })).rejects.toThrow('too many files');
  });
});
