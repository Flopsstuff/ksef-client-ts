import { createGzip, createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { extract, pack } from 'tar-stream';
import type { ZipEntryInput, UnzipOptions } from './zip.js';

const DEFAULT_LIMITS: Required<Pick<UnzipOptions, 'maxFiles' | 'maxTotalUncompressedSize' | 'maxFileUncompressedSize'>> = {
  maxFiles: 10_000,
  maxTotalUncompressedSize: 2_000_000_000,
  maxFileUncompressedSize: 500_000_000,
};

/**
 * Build a gzip-compressed tar archive from in-memory entries (KSeF API v2.6.0 `TarGz`).
 * Mirrors {@link createZip} so callers can swap compression by type.
 */
export async function createTarGz(entries: ZipEntryInput[]): Promise<Buffer> {
  const packer = pack();
  const gzip = packer.pipe(createGzip());
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    // Wire up 'error' handlers on both streams BEFORE finalizing/writing so that
    // a synchronous (or early) failure from either stream always rejects the
    // promise instead of leaving it pending.
    let settled = false;
    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    packer.on('error', fail);
    gzip.on('error', fail);
    gzip.on('data', (chunk: Buffer) => chunks.push(chunk));
    gzip.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });

    try {
      for (const entry of entries) {
        const content = Buffer.from(entry.content);
        packer.entry({ name: entry.fileName, size: content.length }, content);
      }
      packer.finalize();
    } catch (err) {
      fail(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Extract a gzip-compressed tar archive into a map of file name → contents.
 *
 * The gzip layer is decompressed in a STREAMING fashion: the source buffer is
 * piped through `createGunzip()` into a tar extractor, and the running count of
 * decompressed bytes is checked incrementally. The pipeline is destroyed and the
 * promise rejected as soon as a limit is exceeded — well before a malicious
 * archive (e.g. a gzip bomb) can fully inflate into memory. The
 * `maxTotalUncompressedSize` limit is enforced both at the raw gunzip-chunk
 * level (so an archive that inflates massively before the tar layer even sees a
 * full entry is stopped) and per-entry; `maxFileUncompressedSize` is enforced
 * incrementally while an individual entry streams in; `maxFiles` caps the entry
 * count.
 */
export async function extractTarGz(
  buffer: Buffer,
  options: Pick<UnzipOptions, 'maxFiles' | 'maxTotalUncompressedSize' | 'maxFileUncompressedSize'> = {},
): Promise<Map<string, Buffer>> {
  const limits = { ...DEFAULT_LIMITS, ...options };

  return new Promise((resolve, reject) => {
    const source = Readable.from(buffer);
    const gunzip = createGunzip();
    const extractor = extract();
    const files = new Map<string, Buffer>();
    let totalUncompressed = 0;
    let settled = false;

    const cleanup = (): void => {
      source.destroy();
      gunzip.destroy();
      extractor.destroy();
    };

    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const succeed = (): void => {
      if (settled) return;
      settled = true;
      resolve(files);
    };

    // Track total decompressed volume at the raw gunzip-chunk level so a gzip
    // bomb is aborted before the tar layer can buffer a full entry.
    gunzip.on('data', (chunk: Buffer) => {
      totalUncompressed += chunk.length;
      if (limits.maxTotalUncompressedSize > 0 && totalUncompressed > limits.maxTotalUncompressedSize) {
        fail(new Error('tar.gz exceeds max_total_uncompressed_size'));
      }
    });

    extractor.on('entry', (header, stream, next) => {
      if (settled) {
        stream.resume();
        return;
      }
      if (header.type !== 'file') {
        stream.resume();
        stream.on('end', next);
        return;
      }
      if (limits.maxFiles > 0 && files.size >= limits.maxFiles) {
        fail(new Error('tar.gz contains too many files'));
        return;
      }

      const chunks: Buffer[] = [];
      let entrySize = 0;
      stream.on('data', (chunk: Buffer) => {
        if (settled) return;
        entrySize += chunk.length;
        if (limits.maxFileUncompressedSize > 0 && entrySize > limits.maxFileUncompressedSize) {
          fail(new Error('tar.gz entry exceeds max_file_uncompressed_size'));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', fail);
      stream.on('end', () => {
        if (settled) return;
        files.set(header.name, Buffer.concat(chunks));
        next();
      });
    });

    extractor.on('finish', succeed);
    extractor.on('error', fail);
    gunzip.on('error', fail);
    source.on('error', fail);

    source.pipe(gunzip).pipe(extractor);
  });
}
