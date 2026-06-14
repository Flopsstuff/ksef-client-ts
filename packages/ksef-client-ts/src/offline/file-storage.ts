import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { OfflineInvoiceMetadata } from './types.js';
import { matchesFilter } from './storage.js';
import type { OfflineInvoiceFilter, OfflineInvoiceStorage, OfflineInvoiceUpdates } from './storage.js';

function resolveDir(dir: string): string {
  if (dir === '~' || dir.startsWith('~/')) {
    return path.join(os.homedir(), dir.slice(1));
  }
  return dir;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateId(id: string): void {
  if (!UUID_RE.test(id)) {
    throw new Error(`Invalid invoice ID: ${id}`);
  }
}

export class FileOfflineInvoiceStorage implements OfflineInvoiceStorage {
  private readonly dir: string;

  constructor(directory?: string) {
    this.dir = resolveDir(directory ?? '~/.ksef/offline');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  private filePath(id: string): string {
    validateId(id);
    return path.join(this.dir, `${id}.json`);
  }

  async save(invoice: OfflineInvoiceMetadata): Promise<void> {
    await this.ensureDir();
    const file = this.filePath(invoice.id);
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(invoice, null, 2));
    await fs.rename(tmp, file);
  }

  async get(id: string): Promise<OfflineInvoiceMetadata | null> {
    const file = this.filePath(id);
    try {
      return JSON.parse(await fs.readFile(file, 'utf-8'));
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      console.warn(`Warning: Failed to read offline invoice ${id}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async list(filter?: OfflineInvoiceFilter): Promise<OfflineInvoiceMetadata[]> {
    let files: string[];
    try {
      files = (await fs.readdir(this.dir)).filter(f => f.endsWith('.json'));
    } catch {
      return [];
    }
    const results: OfflineInvoiceMetadata[] = [];
    for (const file of files) {
      try {
        const data: OfflineInvoiceMetadata = JSON.parse(
          await fs.readFile(path.join(this.dir, file), 'utf-8'),
        );
        if (!filter || matchesFilter(data, filter)) {
          results.push(data);
        }
      } catch (err: unknown) {
        console.warn(`Warning: Skipping corrupt offline invoice file ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return results;
  }

  /**
   * Update invoice metadata (read-modify-write).
   *
   * Note: No file locking — concurrent updates to the same ID may cause
   * lost writes. Acceptable for CLI (single process). Library consumers
   * running parallel operations should use external locking.
   */
  async update(id: string, updates: OfflineInvoiceUpdates): Promise<void> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Offline invoice not found: ${id}`);
    await this.save({ ...existing, ...updates });
  }

  async delete(id: string): Promise<void> {
    const file = this.filePath(id);
    try {
      await fs.unlink(file);
    } catch (e: unknown) {
      if (e instanceof Error && 'code' in e && e.code !== 'ENOENT') throw e;
    }
  }
}
