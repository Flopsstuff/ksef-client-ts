import { ZipFile } from 'yazl';
import { fromBuffer, type Entry } from 'yauzl';

export interface ZipEntryInput {
  fileName: string;
  content: Buffer | Uint8Array;
}

export interface UnzipOptions {
  maxFiles?: number;
  maxTotalUncompressedSize?: number;
  maxFileUncompressedSize?: number;
  maxCompressionRatio?: number | null;
}

const DEFAULT_UNZIP_OPTIONS: Required<UnzipOptions> = {
  maxFiles: 10_000,
  maxTotalUncompressedSize: 2_000_000_000,
  maxFileUncompressedSize: 500_000_000,
  maxCompressionRatio: 200,
};

export async function createZip(entries: ZipEntryInput[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zipfile = new ZipFile();
    for (const entry of entries) {
      zipfile.addBuffer(Buffer.from(entry.content), entry.fileName);
    }

    const chunks: Buffer[] = [];
    zipfile.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zipfile.outputStream.on('error', (err) => reject(err));
    zipfile.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zipfile.end();
  });
}

export async function unzip(
  buffer: Buffer,
  options: UnzipOptions = {},
): Promise<Map<string, Buffer>> {
  const limits = { ...DEFAULT_UNZIP_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error('Failed to open zip buffer'));
        return;
      }

      const files = new Map<string, Buffer>();
      let totalUncompressed = 0;

      zipfile.readEntry();

      zipfile.on('entry', (entry: Entry) => {
        if (entry.fileName.endsWith('/')) {
          zipfile.readEntry();
          return;
        }

        if (limits.maxFiles > 0 && files.size >= limits.maxFiles) {
          reject(new Error('zip contains too many files'));
          return;
        }

        const uncompressedSize = entry.uncompressedSize ?? 0;
        const compressedSize = entry.compressedSize ?? 0;

        if (limits.maxFileUncompressedSize > 0 && uncompressedSize > limits.maxFileUncompressedSize) {
          reject(new Error('zip entry exceeds max_file_uncompressed_size'));
          return;
        }

        if (limits.maxTotalUncompressedSize > 0) {
          totalUncompressed += uncompressedSize;
          if (totalUncompressed > limits.maxTotalUncompressedSize) {
            reject(new Error('zip exceeds max_total_uncompressed_size'));
            return;
          }
        }

        if (limits.maxCompressionRatio !== null) {
          if (compressedSize === 0 && uncompressedSize > 0) {
            reject(new Error('zip entry has suspicious compression metadata'));
            return;
          }
          if (compressedSize > 0 && uncompressedSize > 0) {
            const ratio = uncompressedSize / compressedSize;
            if (ratio > limits.maxCompressionRatio!) {
              reject(new Error('zip entry exceeds max_compression_ratio'));
              return;
            }
          }
        }

        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            reject(streamErr ?? new Error('Failed to read zip entry'));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('error', (streamError) => reject(streamError));
          stream.on('end', () => {
            files.set(entry.fileName, Buffer.concat(chunks));
            zipfile.readEntry();
          });
        });
      });

      zipfile.on('end', () => resolve(files));
      zipfile.on('error', (zipErr) => reject(zipErr));
    });
  });
}
