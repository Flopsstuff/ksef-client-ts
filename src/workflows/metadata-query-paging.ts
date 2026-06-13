import type { KSeFClient } from '../client.js';
import type { SortOrder } from '../models/common.js';
import type {
  InvoiceMetadata,
  InvoiceQueryDateType,
  InvoiceQueryFilters,
} from '../models/invoices/types.js';
import { KSeFMetadataPaginationError } from '../errors/ksef-metadata-pagination-error.js';

/** Minimal surface of {@link KSeFClient} the paging helper depends on. */
export type MetadataQueryClient = Pick<KSeFClient, 'invoices'>;

export interface QueryAllMetadataOptions {
  /** Sort direction. Defaults to `'Asc'`. Determines which date boundary is re-narrowed on truncation. */
  sortOrder?: SortOrder;
  /** Page size per request. Defaults to 100. */
  pageSize?: number;
  /**
   * Safety cap on the number of `isTruncated` boundaries crossed. Defaults to 1000.
   * Exceeding it throws {@link KSeFMetadataPaginationError}.
   */
  maxBoundaryCrossings?: number;
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_BOUNDARY_CROSSINGS = 1000;

/** Maps the active `dateType` to the matching field on a returned invoice. */
function boundaryFieldFor(dateType: InvoiceQueryDateType): keyof InvoiceMetadata {
  switch (dateType) {
    case 'Issue':
      return 'issueDate';
    case 'Invoicing':
      return 'invoicingDate';
    case 'PermanentStorage':
      return 'permanentStorageDate';
  }
}

/**
 * Async iterator over `POST /invoices/query/metadata` that reads a match of any
 * size, transparently crossing the server's ~10k truncation cap.
 *
 * Two layers of paging are handled:
 *  1. **Normal paging** — advances `pageOffset` while `hasMore` is true.
 *  2. **Truncation boundary** — when `isTruncated` is true the window was capped;
 *     the date range is re-narrowed to the last invoice's boundary (sort `Asc`
 *     pushes `from` forward, `Desc` pulls `to` backward), offset resets to 0,
 *     and paging resumes.
 *
 * Invoices are de-duplicated by KSeF number across boundaries (the boundary
 * invoice appears in both windows). If a re-narrowed window makes no progress
 * (its boundary equals the previous one), {@link KSeFMetadataPaginationError}
 * is thrown rather than looping forever.
 *
 * The caller's `filters` object is not mutated.
 */
export async function* queryAllInvoiceMetadata(
  client: MetadataQueryClient,
  filters: InvoiceQueryFilters,
  options: QueryAllMetadataOptions = {},
): AsyncGenerator<InvoiceMetadata, void, undefined> {
  const sortOrder: SortOrder = options.sortOrder ?? 'Asc';
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxBoundaryCrossings = options.maxBoundaryCrossings ?? DEFAULT_MAX_BOUNDARY_CROSSINGS;
  const boundaryField = boundaryFieldFor(filters.dateRange.dateType);

  // Work on a shallow clone so the caller's filters stay untouched.
  let dateRange = { ...filters.dateRange };
  const seen = new Set<string>();
  let boundaryCrossings = 0;

  for (;;) {
    let offset = 0;
    let lastBoundaryValue: string | undefined;
    let isTruncated = false;

    // --- inner loop: page through the current (capped) window ---
    for (;;) {
      const window: InvoiceQueryFilters = { ...filters, dateRange };
      const response = await client.invoices.queryInvoiceMetadata(
        window,
        offset,
        pageSize,
        sortOrder,
      );
      isTruncated = response.isTruncated;

      for (const invoice of response.invoices) {
        lastBoundaryValue = invoice[boundaryField] as string;
        const key = invoice.ksefNumber.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        yield invoice;
      }

      if (response.hasMore) {
        offset += pageSize;
        continue;
      }
      break;
    }

    // Window fully read. If it wasn't capped, we're done.
    if (!isTruncated || lastBoundaryValue === undefined) return;

    // --- truncation boundary: re-narrow the date range and resume ---
    const previousBoundary = sortOrder === 'Asc' ? dateRange.from : dateRange.to;
    if (previousBoundary === lastBoundaryValue) {
      throw new KSeFMetadataPaginationError(
        `Metadata paging stalled: a truncated window did not advance past ${boundaryField}=${lastBoundaryValue}. ` +
          `The result set likely exceeds the server cap within a single ${boundaryField} value; narrow the query further.`,
        lastBoundaryValue,
      );
    }

    if (++boundaryCrossings > maxBoundaryCrossings) {
      throw new KSeFMetadataPaginationError(
        `Metadata paging exceeded ${maxBoundaryCrossings} truncation boundaries; aborting to avoid an unbounded loop.`,
        lastBoundaryValue,
      );
    }

    dateRange =
      sortOrder === 'Asc'
        ? { ...dateRange, from: lastBoundaryValue }
        : { ...dateRange, to: lastBoundaryValue };
  }
}

/**
 * Convenience wrapper that drains {@link queryAllInvoiceMetadata} into a single
 * de-duplicated array. Use the generator directly for large result sets to keep
 * memory bounded.
 */
export async function collectAllInvoiceMetadata(
  client: MetadataQueryClient,
  filters: InvoiceQueryFilters,
  options: QueryAllMetadataOptions = {},
): Promise<InvoiceMetadata[]> {
  const all: InvoiceMetadata[] = [];
  for await (const invoice of queryAllInvoiceMetadata(client, filters, options)) {
    all.push(invoice);
  }
  return all;
}
