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

  it('enforces the max-file-uncompressed-size limit', async () => {
    const archive = await createTarGz([{ fileName: 'big.xml', content: Buffer.from('0123456789') }]);
    await expect(extractTarGz(archive, { maxFileUncompressedSize: 5 })).rejects.toThrow(
      'tar.gz entry exceeds max_file_uncompressed_size',
    );
  });

  it('enforces the max-total-uncompressed-size limit', async () => {
    const entries = [
      { fileName: 'a.xml', content: Buffer.from('aaaa') },
      { fileName: 'b.xml', content: Buffer.from('bbbb') },
    ];
    const archive = await createTarGz(entries);
    await expect(extractTarGz(archive, { maxTotalUncompressedSize: 6 })).rejects.toThrow(
      'tar.gz exceeds max_total_uncompressed_size',
    );
  });

  it('aborts streaming once the total uncompressed size is exceeded (no full inflation)', async () => {
    // Many small, highly-compressible entries: gunzipped output far exceeds the
    // tiny total limit, so the pipeline must abort mid-stream rather than wait
    // for the whole archive to inflate into memory.
    const entries = Array.from({ length: 50 }, (_, i) => ({
      fileName: `f${i}.xml`,
      content: Buffer.alloc(1000, 'a'),
    }));
    const archive = await createTarGz(entries);
    await expect(extractTarGz(archive, { maxTotalUncompressedSize: 100 })).rejects.toThrow(
      'tar.gz exceeds max_total_uncompressed_size',
    );
  });

  it('aborts a single oversized entry incrementally', async () => {
    const entries = [{ fileName: 'big.xml', content: Buffer.alloc(5000, 'b') }];
    const archive = await createTarGz(entries);
    await expect(
      extractTarGz(archive, { maxFileUncompressedSize: 100, maxTotalUncompressedSize: 1_000_000 }),
    ).rejects.toThrow('tar.gz entry exceeds max_file_uncompressed_size');
  });

  it('enforces the max-compression-ratio limit', async () => {
    // Highly compressible payload: the gzipped archive is tiny relative to the
    // decompressed bytes, so a low ratio ceiling must trip before size limits do.
    const archive = await createTarGz([{ fileName: 'bomb.xml', content: Buffer.alloc(100_000, 'a') }]);
    await expect(
      extractTarGz(archive, {
        maxCompressionRatio: 5,
        maxTotalUncompressedSize: 1_000_000_000,
        maxFileUncompressedSize: 1_000_000_000,
      }),
    ).rejects.toThrow('tar.gz exceeds max_compression_ratio');
  });

  it('allows disabling the compression-ratio check with null', async () => {
    const archive = await createTarGz([{ fileName: 'bomb.xml', content: Buffer.alloc(100_000, 'a') }]);
    const files = await extractTarGz(archive, { maxCompressionRatio: null });
    expect(files.get('bomb.xml')?.length).toBe(100_000);
  });
});
