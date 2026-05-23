import { createGzip, gunzipSync } from 'node:zlib';
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
  for (const entry of entries) {
    const content = Buffer.from(entry.content);
    packer.entry({ name: entry.fileName, size: content.length }, content);
  }
  packer.finalize();

  const chunks: Buffer[] = [];
  const gzip = packer.pipe(createGzip());
  return new Promise((resolve, reject) => {
    gzip.on('data', (chunk: Buffer) => chunks.push(chunk));
    gzip.on('error', reject);
    packer.on('error', reject);
    gzip.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/** Extract a gzip-compressed tar archive into a map of file name → contents. */
export async function extractTarGz(
  buffer: Buffer,
  options: Pick<UnzipOptions, 'maxFiles' | 'maxTotalUncompressedSize' | 'maxFileUncompressedSize'> = {},
): Promise<Map<string, Buffer>> {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const tar = gunzipSync(buffer);

  return new Promise((resolve, reject) => {
    const extractor = extract();
    const files = new Map<string, Buffer>();
    let totalUncompressed = 0;

    extractor.on('entry', (header, stream, next) => {
      if (header.type !== 'file') {
        stream.resume();
        stream.on('end', next);
        return;
      }
      if (limits.maxFiles > 0 && files.size >= limits.maxFiles) {
        reject(new Error('tar.gz contains too many files'));
        return;
      }

      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => {
        const content = Buffer.concat(chunks);
        if (limits.maxFileUncompressedSize > 0 && content.length > limits.maxFileUncompressedSize) {
          reject(new Error('tar.gz entry exceeds max_file_uncompressed_size'));
          return;
        }
        totalUncompressed += content.length;
        if (limits.maxTotalUncompressedSize > 0 && totalUncompressed > limits.maxTotalUncompressedSize) {
          reject(new Error('tar.gz exceeds max_total_uncompressed_size'));
          return;
        }
        files.set(header.name, content);
        next();
      });
    });

    extractor.on('finish', () => resolve(files));
    extractor.on('error', reject);

    Readable.from(tar).pipe(extractor);
  });
}
