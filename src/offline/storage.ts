import type { OfflineInvoiceMetadata, OfflineInvoiceStatus, OfflineMode } from './types.js';

export interface OfflineInvoiceFilter {
  status?: OfflineInvoiceStatus | OfflineInvoiceStatus[];
  mode?: OfflineMode;
  expiringBefore?: Date | string;
  sellerNip?: string;
}

export type OfflineInvoiceUpdates = Omit<Partial<OfflineInvoiceMetadata>, 'id'>;

export interface OfflineInvoiceStorage {
  save(invoice: OfflineInvoiceMetadata): Promise<void>;
  get(id: string): Promise<OfflineInvoiceMetadata | null>;
  list(filter?: OfflineInvoiceFilter): Promise<OfflineInvoiceMetadata[]>;
  update(id: string, updates: OfflineInvoiceUpdates): Promise<void>;
  delete(id: string): Promise<void>;
}

export function matchesFilter(invoice: OfflineInvoiceMetadata, filter: OfflineInvoiceFilter): boolean {
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

export class InMemoryOfflineInvoiceStorage implements OfflineInvoiceStorage {
  private readonly store = new Map<string, OfflineInvoiceMetadata>();

  async save(invoice: OfflineInvoiceMetadata): Promise<void> {
    this.store.set(invoice.id, { ...invoice });
  }

  async get(id: string): Promise<OfflineInvoiceMetadata | null> {
    const entry = this.store.get(id);
    return entry ? { ...entry } : null;
  }

  async list(filter?: OfflineInvoiceFilter): Promise<OfflineInvoiceMetadata[]> {
    const all = [...this.store.values()];
    if (!filter) return all.map(i => ({ ...i }));
    return all.filter(i => matchesFilter(i, filter)).map(i => ({ ...i }));
  }

  async update(id: string, updates: OfflineInvoiceUpdates): Promise<void> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`Offline invoice not found: ${id}`);
    this.store.set(id, { ...existing, ...updates });
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
