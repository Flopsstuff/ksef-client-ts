import { createZip, unzip } from '../../../src/utils/zip.js';

describe('createZip', () => {
  it('creates a ZIP with a single entry', async () => {
    const buf = await createZip([{ fileName: 'a.txt', content: Buffer.from('hello') }]);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('creates a ZIP with multiple entries', async () => {
    const buf = await createZip([
      { fileName: 'a.txt', content: Buffer.from('aaa') },
      { fileName: 'b.txt', content: Buffer.from('bbb') },
      { fileName: 'c.txt', content: Buffer.from('ccc') },
    ]);
    expect(buf).toBeInstanceOf(Buffer);
  });

  it('roundtrips with unzip', async () => {
    const entries = [
      { fileName: 'invoice-1.xml', content: Buffer.from('<invoice>1</invoice>') },
      { fileName: 'invoice-2.xml', content: Buffer.from('<invoice>2</invoice>') },
    ];
    const zipBuf = await createZip(entries);
    const files = await unzip(zipBuf);

    expect(files.size).toBe(2);
    expect(files.get('invoice-1.xml')!.toString()).toBe('<invoice>1</invoice>');
    expect(files.get('invoice-2.xml')!.toString()).toBe('<invoice>2</invoice>');
  });
});

describe('unzip', () => {
  async function makeZip(fileEntries: Array<{ name: string; content: string }>): Promise<Buffer> {
    return createZip(fileEntries.map((e) => ({ fileName: e.name, content: Buffer.from(e.content) })));
  }

  describe('happy path', () => {
    it('extracts a valid archive', async () => {
      const zip = await makeZip([
        { name: 'a.txt', content: 'aaa' },
        { name: 'b.txt', content: 'bbb' },
        { name: 'c.txt', content: 'ccc' },
      ]);
      const files = await unzip(zip);
      expect(files.size).toBe(3);
      expect(files.get('a.txt')!.toString()).toBe('aaa');
      expect(files.get('b.txt')!.toString()).toBe('bbb');
      expect(files.get('c.txt')!.toString()).toBe('ccc');
    });

    it('returns empty Map for empty archive', async () => {
      const zip = await createZip([]);
      const files = await unzip(zip);
      expect(files.size).toBe(0);
    });

    it('skips directory entries', async () => {
      // yazl doesn't create directory entries by default, so we use a path with /
      // The files should still be extracted with their full paths
      const zip = await createZip([
        { fileName: 'dir/a.txt', content: Buffer.from('aaa') },
      ]);
      const files = await unzip(zip);
      expect(files.size).toBe(1);
      expect(files.has('dir/a.txt')).toBe(true);
    });
  });

  describe('maxFiles', () => {
    it('rejects archive exceeding custom limit', async () => {
      const zip = await makeZip([
        { name: '1.txt', content: 'a' },
        { name: '2.txt', content: 'b' },
        { name: '3.txt', content: 'c' },
        { name: '4.txt', content: 'd' },
        { name: '5.txt', content: 'e' },
        { name: '6.txt', content: 'f' },
      ]);
      await expect(unzip(zip, { maxFiles: 5 })).rejects.toThrow('too many files');
    });

    it('allows archive within limit', async () => {
      const zip = await makeZip([
        { name: '1.txt', content: 'a' },
        { name: '2.txt', content: 'b' },
      ]);
      const files = await unzip(zip, { maxFiles: 5 });
      expect(files.size).toBe(2);
    });

    it('disables check when set to 0', async () => {
      const zip = await makeZip([
        { name: '1.txt', content: 'a' },
        { name: '2.txt', content: 'b' },
        { name: '3.txt', content: 'c' },
      ]);
      const files = await unzip(zip, { maxFiles: 0 });
      expect(files.size).toBe(3);
    });
  });

  describe('maxTotalUncompressedSize', () => {
    it('rejects archive exceeding total size limit', async () => {
      const zip = await makeZip([
        { name: 'a.txt', content: 'x'.repeat(100) },
        { name: 'b.txt', content: 'y'.repeat(100) },
      ]);
      await expect(unzip(zip, { maxTotalUncompressedSize: 150 })).rejects.toThrow(
        'max_total_uncompressed_size',
      );
    });

    it('disables check when set to 0', async () => {
      const zip = await makeZip([
        { name: 'a.txt', content: 'x'.repeat(100) },
        { name: 'b.txt', content: 'y'.repeat(100) },
      ]);
      const files = await unzip(zip, { maxTotalUncompressedSize: 0 });
      expect(files.size).toBe(2);
    });
  });

  describe('maxFileUncompressedSize', () => {
    it('rejects entry exceeding per-file limit', async () => {
      const zip = await makeZip([{ name: 'big.txt', content: 'x'.repeat(200) }]);
      await expect(unzip(zip, { maxFileUncompressedSize: 100 })).rejects.toThrow(
        'max_file_uncompressed_size',
      );
    });

    it('disables check when set to 0', async () => {
      const zip = await makeZip([{ name: 'big.txt', content: 'x'.repeat(200) }]);
      const files = await unzip(zip, { maxFileUncompressedSize: 0 });
      expect(files.size).toBe(1);
    });
  });

  describe('maxCompressionRatio', () => {
    // Patches compressedSize and uncompressedSize in both the central directory
    // and local file header of a ZIP buffer, allowing us to simulate bomb-like metadata.
    function patchZipEntrySizes(zipBuf: Buffer, compressedSize: number, uncompressedSize: number): Buffer {
      const patched = Buffer.from(zipBuf);

      // Central directory header: PK\x01\x02 — sizes at offsets +20 and +24
      const cdSig = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
      const cdIdx = patched.indexOf(cdSig);
      if (cdIdx !== -1) {
        patched.writeUInt32LE(compressedSize, cdIdx + 20);
        patched.writeUInt32LE(uncompressedSize, cdIdx + 24);
      }

      // Local file header: PK\x03\x04 — sizes at offsets +18 and +22
      const lfSig = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      const lfIdx = patched.indexOf(lfSig);
      if (lfIdx !== -1) {
        patched.writeUInt32LE(compressedSize, lfIdx + 18);
        patched.writeUInt32LE(uncompressedSize, lfIdx + 22);
      }

      return patched;
    }

    it('rejects entry exceeding compression ratio', async () => {
      const zip = await makeZip([{ name: 'a.txt', content: 'hello' }]);
      // Patch: compressedSize=1, uncompressedSize=300 → ratio 300 > default 200
      const patched = patchZipEntrySizes(zip, 1, 300);
      await expect(unzip(patched)).rejects.toThrow('max_compression_ratio');
    });

    it('rejects entry with suspicious zero-compressed metadata', async () => {
      const zip = await makeZip([{ name: 'a.txt', content: 'hello' }]);
      // Patch: compressedSize=0, uncompressedSize=100 → suspicious
      const patched = patchZipEntrySizes(zip, 0, 100);
      await expect(unzip(patched)).rejects.toThrow('suspicious compression metadata');
    });

    it('disables all ratio checks when set to null', async () => {
      const zip = await makeZip([{ name: 'a.txt', content: 'hello' }]);
      const patched = patchZipEntrySizes(zip, 1, 300);
      // With null, the high-ratio entry should pass the ratio check
      // (it may still fail on stream read due to patched metadata, so we
      // verify the ratio check specifically doesn't fire)
      const result = unzip(patched, { maxCompressionRatio: null });
      // Should NOT reject with ratio error — any other error is fine
      await expect(result).rejects.not.toThrow('max_compression_ratio');
    });
  });

  describe('incremental checking', () => {
    it('stops early on maxFiles violation', async () => {
      const entries = Array.from({ length: 10 }, (_, i) => ({
        name: `file-${i}.txt`,
        content: `content-${i}`,
      }));
      const zip = await makeZip(entries);
      await expect(unzip(zip, { maxFiles: 3 })).rejects.toThrow('too many files');
    });
  });

  describe('default options merge', () => {
    it('applies defaults when no options provided', async () => {
      const zip = await makeZip([{ name: 'a.txt', content: 'hello' }]);
      const files = await unzip(zip);
      expect(files.size).toBe(1);
    });

    it('merges partial options with defaults', async () => {
      const zip = await makeZip([{ name: 'a.txt', content: 'hello' }]);
      // Only override maxFiles, others should use defaults
      const files = await unzip(zip, { maxFiles: 50 });
      expect(files.size).toBe(1);
    });
  });

  describe('invalid input', () => {
    it('rejects invalid buffer', async () => {
      await expect(unzip(Buffer.from('not a zip'))).rejects.toThrow();
    });
  });
});
