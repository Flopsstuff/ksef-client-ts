import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { OfflineInvoiceMetadata } from './types.js';
import type { OfflineInvoiceFilter, OfflineInvoiceStorage } from './storage.js';

function resolveDir(dir: string): string {
  if (dir.startsWith('~')) {
    return path.join(os.homedir(), dir.slice(1));
  }
  return dir;
}

function matchesFilter(invoice: OfflineInvoiceMetadata, filter: OfflineInvoiceFilter): boolean {
  if (filter.status !== undefined) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    if (!statuses.includes(invoice.status)) return false;
  }
  if (filter.mode !== undefined && invoice.mode !== filter.mode) return false;
  if (filter.sellerNip !== undefined && invoice.sellerNip !== filter.sellerNip) return false;
  if (filter.expiringBefore !== undefined) {
    const cutoff = typeof filter.expiringBefore === 'string'
      ? new Date(filter.expiringBefore).getTime()
      : filter.expiringBefore.getTime();
    if (new Date(invoice.submitBy).getTime() >= cutoff) return false;
  }
  return true;
}

export class FileOfflineInvoiceStorage implements OfflineInvoiceStorage {
  private readonly dir: string;

  constructor(directory?: string) {
    this.dir = resolveDir(directory ?? '~/.ksef/offline');
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  private filePath(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  async save(invoice: OfflineInvoiceMetadata): Promise<void> {
    this.ensureDir();
    const file = this.filePath(invoice.id);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(invoice, null, 2));
    fs.renameSync(tmp, file);
  }

  async get(id: string): Promise<OfflineInvoiceMetadata | null> {
    const file = this.filePath(id);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      return null;
    }
  }

  async list(filter?: OfflineInvoiceFilter): Promise<OfflineInvoiceMetadata[]> {
    if (!fs.existsSync(this.dir)) return [];
    const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.json'));
    const results: OfflineInvoiceMetadata[] = [];
    for (const file of files) {
      try {
        const data: OfflineInvoiceMetadata = JSON.parse(
          fs.readFileSync(path.join(this.dir, file), 'utf-8'),
        );
        if (!filter || matchesFilter(data, filter)) {
          results.push(data);
        }
      } catch {
        // Skip corrupt JSON files
      }
    }
    return results;
  }

  async update(id: string, updates: Partial<OfflineInvoiceMetadata>): Promise<void> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Offline invoice not found: ${id}`);
    await this.save({ ...existing, ...updates });
  }

  async delete(id: string): Promise<void> {
    const file = this.filePath(id);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
}
