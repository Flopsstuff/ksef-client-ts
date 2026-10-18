import { describe, it, expect } from 'vitest';
import { gunzipSync, gzipSync } from 'node:zlib';
import { pack } from 'tar-stream';
import { createTarGz, extractTarGz } from '../../../src/utils/targz.js';

/** Build a raw tar.gz with arbitrary entry headers (e.g. directories). */
async function packTarGz(
  entries: Array<{ header: { name: string; type?: string; size?: number }; content?: Buffer }>,
): Promise<Buffer> {
  const packer = pack();
  for (const { header, content } of entries) {
    packer.entry(header as never, content ?? Buffer.alloc(0));
  }
  packer.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of packer) chunks.push(chunk as Buffer);
  return gzipSync(Buffer.concat(chunks));
}

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

  it('counts duplicate filenames toward the max-files limit', async () => {
    // Same name three times: the extracted Map collapses to one key, so the
    // guard must track entry count independently or it would never trip.
    const entries = Array.from({ length: 3 }, () => ({
      fileName: 'dup.xml',
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

  it('skips non-file entries (e.g. directories) and extracts only files', async () => {
    const archive = await packTarGz([
      { header: { name: 'dir/', type: 'directory' } },
      { header: { name: 'dir/a.xml', size: 4 }, content: Buffer.from('<a/>') },
    ]);
    const files = await extractTarGz(archive);
    expect(files.has('dir/')).toBe(false);
    expect(files.get('dir/a.xml')?.toString()).toBe('<a/>');
  });

  describe('default max-files limit fits a full KSeF export package', () => {
    // KSeF caps a package at 10 000 invoices and adds _metadata.json beside them.
    // Packing ~10k entries takes seconds on a loaded machine, hence the timeout.
    const timeout = 30_000;
    function packageEntries(invoiceCount: number) {
      return [
        ...Array.from({ length: invoiceCount }, (_, i) => ({ fileName: `${i}.xml`, content: Buffer.from('x') })),
        { fileName: '_metadata.json', content: Buffer.from('{}') },
      ];
    }

    it('accepts 10 000 invoices plus _metadata.json', async () => {
      const files = await extractTarGz(await createTarGz(packageEntries(10_000)));
      expect(files.size).toBe(10_001);
    }, timeout);

    it('rejects one entry more', async () => {
      await expect(extractTarGz(await createTarGz(packageEntries(10_001)))).rejects.toThrow('too many files');
    }, timeout);
  });

  describe('filter', () => {
    const isMetadata = (name: string) => name === '_metadata.json';

    it('extracts only the entries the filter accepts', async () => {
      const archive = await createTarGz([
        { fileName: 'K-1.xml', content: Buffer.from('<Faktura/>') },
        { fileName: '_metadata.json', content: Buffer.from('{"invoices":[]}') },
        { fileName: 'K-2.xml', content: Buffer.from('<Faktura/>') },
      ]);
      const files = await extractTarGz(archive, { filter: isMetadata });
      expect([...files.keys()]).toEqual(['_metadata.json']);
      expect(files.get('_metadata.json')?.toString()).toBe('{"invoices":[]}');
    });

    it('still counts skipped entries toward the max-files limit', async () => {
      const archive = await createTarGz([
        { fileName: '1.xml', content: Buffer.from('a') },
        { fileName: '2.xml', content: Buffer.from('b') },
        { fileName: '_metadata.json', content: Buffer.from('{}') },
      ]);
      await expect(extractTarGz(archive, { maxFiles: 2, filter: isMetadata })).rejects.toThrow('too many files');
    });

    it('still enforces size and ratio limits on skipped entries', async () => {
      const archive = await createTarGz([
        { fileName: 'big.xml', content: Buffer.alloc(5000, 'b') },
        { fileName: '_metadata.json', content: Buffer.from('{}') },
      ]);
      await expect(extractTarGz(archive, { maxFileUncompressedSize: 100, filter: isMetadata }))
        .rejects.toThrow('tar.gz entry exceeds max_file_uncompressed_size');
      await expect(extractTarGz(archive, { maxTotalUncompressedSize: 1000, filter: isMetadata }))
        .rejects.toThrow('tar.gz exceeds max_total_uncompressed_size');
      await expect(extractTarGz(archive, { maxCompressionRatio: 2, filter: isMetadata }))
        .rejects.toThrow('tar.gz exceeds max_compression_ratio');
    });

    it('rejects when the filter throws', async () => {
      const archive = await createTarGz([{ fileName: 'a.xml', content: Buffer.from('a') }]);
      await expect(extractTarGz(archive, { filter: () => { throw new Error('boom'); } })).rejects.toThrow('boom');
    });
  });

  it('extracts an archive passed as consecutive chunks', async () => {
    const archive = await createTarGz([
      { fileName: 'a.xml', content: Buffer.from('<a/>') },
      { fileName: 'b.xml', content: Buffer.alloc(2000, 'b') },
    ]);
    const cut = Math.floor(archive.length / 2);
    const chunks = [new Uint8Array(archive.subarray(0, cut)), new Uint8Array(archive.subarray(cut))];
    const files = await extractTarGz(chunks);
    expect(files.get('a.xml')?.toString()).toBe('<a/>');
    expect(files.get('b.xml')?.length).toBe(2000);
    // The ratio ceiling is measured against all chunks together.
    await expect(extractTarGz(chunks, { maxCompressionRatio: 2 })).rejects.toThrow('max_compression_ratio');
  });

  it('rejects when an entry cannot be packed', async () => {
    // Buffer.from(undefined) throws synchronously inside the pack loop, so the
    // promise must reject rather than hang.
    await expect(
      createTarGz([{ fileName: 'x', content: undefined as never }]),
    ).rejects.toThrow();
  });
});
