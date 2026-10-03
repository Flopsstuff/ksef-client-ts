import type { KSeFClient } from '../client.js';
import type {
  CollectiveIdentifierInvoicesQueryRequest,
  CollectiveIdentifierInvoicesQueryResponseItem,
  CollectiveIdentifiersByKsefNumberQueryResponseItem,
  CollectiveIdentifiersQueryRequest,
  CollectiveIdentifiersQueryResponseItem,
} from '../models/collective-identifiers/types.js';
import { KSeFPaginationError } from '../errors/ksef-pagination-error.js';
import { KSeFValidationError } from '../errors/ksef-validation-error.js';

/** Minimal surface of {@link KSeFClient} the paging helpers depend on. */
export type CollectiveIdentifierPagingClient = Pick<KSeFClient, 'collectiveIdentifiers'>;

export interface CollectiveIdentifierPagingOptions {
  /**
   * Page size per request. Defaults to the endpoint's maximum — 200 for
   * identifiers, 500 for invoices — to spend as few requests of the domain's
   * rate limit as possible. Out-of-range values are left for KSeF to reject.
   */
  pageSize?: number;
  /** Token of the page to start from, to resume an earlier walk. Omit to start at the first page. */
  continuationToken?: string;
  /**
   * Safety cap on the number of pages fetched. Defaults to 1000. Needing more
   * throws {@link KSeFPaginationError} carrying the token of the first unread page.
   */
  maxPages?: number;
  /**
   * Stops the walk before the next request once aborted, rejecting with the
   * signal's reason. A request already in flight is not cancelled.
   */
  signal?: AbortSignal;
}

/** One page of a continuation-token walk. */
export interface CollectiveIdentifierPage<T> {
  items: T[];
  /**
   * Token of the next page, or `undefined` on the last one. Pass it as
   * `continuationToken` to resume after this page.
   */
  continuationToken: string | undefined;
}

const DEFAULT_IDENTIFIERS_PAGE_SIZE = 200;
const DEFAULT_INVOICES_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 1000;

/** KSeF marks the last page with a missing, `null` or empty token. */
function tokenOf(value: string | null | undefined): string | undefined {
  return value ? value : undefined;
}

/**
 * Follows the continuation tokens of one endpoint, yielding page by page so a
 * caller can record where it stopped. A token KSeF already handed out means the
 * walk would never end, so it throws instead of following it.
 */
async function* walkPages<T>(
  fetchPage: (pageSize: number, token: string | undefined) => Promise<{ items: T[]; continuationToken?: string | null }>,
  defaultPageSize: number,
  options: CollectiveIdentifierPagingOptions,
): AsyncGenerator<CollectiveIdentifierPage<T>, void, undefined> {
  const pageSize = options.pageSize ?? defaultPageSize;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new KSeFValidationError('`pageSize` must be a positive integer.');
  }
  if (!Number.isInteger(maxPages) || maxPages <= 0) {
    throw new KSeFValidationError('`maxPages` must be a positive integer.');
  }
  const { signal } = options;

  let token = tokenOf(options.continuationToken);
  const seen = new Set<string>();
  if (token !== undefined) seen.add(token);

  for (let pages = 0; ; pages += 1) {
    signal?.throwIfAborted();
    if (pages >= maxPages) {
      throw new KSeFPaginationError(
        `Collective identifier paging exceeded ${maxPages} pages; resume from continuation token "${token!}" or raise maxPages.`,
        token!,
        'max-pages',
      );
    }
    const page = await fetchPage(pageSize, token);
    const next = tokenOf(page.continuationToken);
    yield { items: page.items, continuationToken: next };
    if (next === undefined) return;
    if (seen.has(next)) {
      throw new KSeFPaginationError(
        `Collective identifier paging stalled: KSeF returned continuation token "${next}" a second time.`,
        next,
        'repeated-token',
      );
    }
    seen.add(next);
    token = next;
  }
}

/**
 * Pages through `POST /collective-identifiers/query`, following the
 * continuation token until KSeF reports the last page.
 */
export function queryCollectiveIdentifierPages(
  client: CollectiveIdentifierPagingClient,
  request: CollectiveIdentifiersQueryRequest,
  options: CollectiveIdentifierPagingOptions = {},
): AsyncGenerator<CollectiveIdentifierPage<CollectiveIdentifiersQueryResponseItem>, void, undefined> {
  return walkPages(
    async (pageSize, token) => {
      const r = await client.collectiveIdentifiers.query(request, pageSize, token);
      return { items: r.collectiveIdentifiers, continuationToken: r.continuationToken };
    },
    DEFAULT_IDENTIFIERS_PAGE_SIZE,
    options,
  );
}

/**
 * Pages through `GET /collective-identifiers/ksef/{ksefNumber}` — every
 * collective identifier the invoice belongs to.
 */
export function getCollectiveIdentifierPagesByKsefNumber(
  client: CollectiveIdentifierPagingClient,
  ksefNumber: string,
  options: CollectiveIdentifierPagingOptions = {},
): AsyncGenerator<CollectiveIdentifierPage<CollectiveIdentifiersByKsefNumberQueryResponseItem>, void, undefined> {
  return walkPages(
    async (pageSize, token) => {
      const r = await client.collectiveIdentifiers.getByKsefNumber(ksefNumber, pageSize, token);
      return { items: r.collectiveIdentifiers, continuationToken: r.continuationToken };
    },
    DEFAULT_IDENTIFIERS_PAGE_SIZE,
    options,
  );
}

/**
 * Pages through `POST /collective-identifiers/invoices` — the invoices inside
 * up to 10 collective identifiers.
 */
export function queryCollectiveIdentifierInvoicePages(
  client: CollectiveIdentifierPagingClient,
  request: CollectiveIdentifierInvoicesQueryRequest,
  options: CollectiveIdentifierPagingOptions = {},
): AsyncGenerator<CollectiveIdentifierPage<CollectiveIdentifierInvoicesQueryResponseItem>, void, undefined> {
  return walkPages(
    async (pageSize, token) => {
      const r = await client.collectiveIdentifiers.queryInvoices(request, pageSize, token);
      return { items: r.invoices, continuationToken: r.continuationToken };
    },
    DEFAULT_INVOICES_PAGE_SIZE,
    options,
  );
}

async function collectItems<T>(
  pages: AsyncGenerator<CollectiveIdentifierPage<T>, void, undefined>,
): Promise<T[]> {
  const all: T[] = [];
  for await (const page of pages) all.push(...page.items);
  return all;
}

/** Drains {@link queryCollectiveIdentifierPages} into a single array. */
export function collectAllCollectiveIdentifiers(
  client: CollectiveIdentifierPagingClient,
  request: CollectiveIdentifiersQueryRequest,
  options: CollectiveIdentifierPagingOptions = {},
): Promise<CollectiveIdentifiersQueryResponseItem[]> {
  return collectItems(queryCollectiveIdentifierPages(client, request, options));
}

/** Drains {@link getCollectiveIdentifierPagesByKsefNumber} into a single array. */
export function collectAllCollectiveIdentifiersByKsefNumber(
  client: CollectiveIdentifierPagingClient,
  ksefNumber: string,
  options: CollectiveIdentifierPagingOptions = {},
): Promise<CollectiveIdentifiersByKsefNumberQueryResponseItem[]> {
  return collectItems(getCollectiveIdentifierPagesByKsefNumber(client, ksefNumber, options));
}

/** Drains {@link queryCollectiveIdentifierInvoicePages} into a single array. */
export function collectAllCollectiveIdentifierInvoices(
  client: CollectiveIdentifierPagingClient,
  request: CollectiveIdentifierInvoicesQueryRequest,
  options: CollectiveIdentifierPagingOptions = {},
): Promise<CollectiveIdentifierInvoicesQueryResponseItem[]> {
  return collectItems(queryCollectiveIdentifierInvoicePages(client, request, options));
}
