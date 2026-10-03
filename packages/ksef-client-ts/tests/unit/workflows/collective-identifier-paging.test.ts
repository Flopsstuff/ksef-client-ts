import { describe, it, expect, vi } from 'vitest';
import {
  queryCollectiveIdentifierPages,
  getCollectiveIdentifierPagesByKsefNumber,
  queryCollectiveIdentifierInvoicePages,
  collectAllCollectiveIdentifiers,
  collectAllCollectiveIdentifiersByKsefNumber,
  collectAllCollectiveIdentifierInvoices,
} from '../../../src/workflows/collective-identifier-paging.js';
import { KSeFPaginationError } from '../../../src/errors/ksef-pagination-error.js';
import { KSeFValidationError } from '../../../src/errors/ksef-validation-error.js';
import { KSeFError } from '../../../src/errors/ksef-error.js';
import type { CollectiveIdentifiersQueryRequest } from '../../../src/models/collective-identifiers/types.js';

// --- helpers -------------------------------------------------------------

const REQUEST: CollectiveIdentifiersQueryRequest = {
  dateCreatedFrom: '2026-07-01T00:00:00Z',
  dateCreatedTo: '2026-07-31T23:59:59Z',
};
const KSEF = '1111111111-20260701-0189ABCD1234-EF';

/** Identifier-list response with the given numbers. */
function ids(numbers: string[], continuationToken?: string | null) {
  return {
    collectiveIdentifiers: numbers.map((n) => ({ collectiveIdentifierNumber: n }) as any),
    continuationToken,
  };
}

/** Mock client whose `query` returns a scripted sequence of responses. */
function mockClient(sequence: ReturnType<typeof ids>[]) {
  let i = 0;
  const next = vi.fn(async () => sequence[i++] ?? ids([]));
  return {
    collectiveIdentifiers: { query: next, getByKsefNumber: next, queryInvoices: vi.fn() },
  } as any;
}

async function drain<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of gen) out.push(x);
  return out;
}

// --- tests ---------------------------------------------------------------

describe('queryCollectiveIdentifierPages', () => {
  it('follows the continuation token across pages and stops on the last one', async () => {
    const client = mockClient([ids(['A', 'B'], 't1'), ids(['C'], 't2'), ids(['D'], null)]);

    const pages = await drain(queryCollectiveIdentifierPages(client, REQUEST));

    expect(pages.map((p) => p.items.map((i) => i.collectiveIdentifierNumber)))
      .toEqual([['A', 'B'], ['C'], ['D']]);
    expect(pages.map((p) => p.continuationToken)).toEqual(['t1', 't2', undefined]);
    const { query } = client.collectiveIdentifiers;
    expect(query).toHaveBeenNthCalledWith(1, REQUEST, 200, undefined);
    expect(query).toHaveBeenNthCalledWith(2, REQUEST, 200, 't1');
    expect(query).toHaveBeenNthCalledWith(3, REQUEST, 200, 't2');
  });

  it('treats an empty or missing token as the last page', async () => {
    for (const last of ['', undefined]) {
      const client = mockClient([ids(['A'], last)]);
      const pages = await drain(queryCollectiveIdentifierPages(client, REQUEST));
      expect(pages).toEqual([{ items: [expect.anything()], continuationToken: undefined }]);
      expect(client.collectiveIdentifiers.query).toHaveBeenCalledTimes(1);
    }
  });

  it('yields a single empty page when nothing matches', async () => {
    const client = mockClient([ids([])]);

    const pages = await drain(queryCollectiveIdentifierPages(client, REQUEST));

    expect(pages).toEqual([{ items: [], continuationToken: undefined }]);
  });

  it('resumes from a given continuation token and passes the page size', async () => {
    const client = mockClient([ids(['C'], 't2'), ids(['D'])]);

    const all = await collectAllCollectiveIdentifiers(client, REQUEST, {
      continuationToken: 't1',
      pageSize: 50,
    });

    expect(all.map((i) => i.collectiveIdentifierNumber)).toEqual(['C', 'D']);
    expect(client.collectiveIdentifiers.query).toHaveBeenNthCalledWith(1, REQUEST, 50, 't1');
    expect(client.collectiveIdentifiers.query).toHaveBeenNthCalledWith(2, REQUEST, 50, 't2');
  });

  it('stops before the next request once the signal is aborted', async () => {
    const client = mockClient([ids(['A'], 't1'), ids(['B'], 't2'), ids(['C'])]);
    const controller = new AbortController();
    const seen: string[] = [];

    await expect((async () => {
      for await (const page of queryCollectiveIdentifierPages(client, REQUEST, { signal: controller.signal })) {
        seen.push(...page.items.map((i) => i.collectiveIdentifierNumber));
        controller.abort();
      }
    })()).rejects.toMatchObject({ name: 'AbortError' });

    expect(seen).toEqual(['A']);
    expect(client.collectiveIdentifiers.query).toHaveBeenCalledTimes(1);
  });

  it('does not send a request when the signal is already aborted', async () => {
    const client = mockClient([ids(['A'])]);
    const reason = new Error('cancelled');

    await expect(
      collectAllCollectiveIdentifiers(client, REQUEST, { signal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason);
    expect(client.collectiveIdentifiers.query).not.toHaveBeenCalled();
  });

  it('throws at the page cap with the token of the first unread page', async () => {
    const client = mockClient([ids(['A'], 't1'), ids(['B'], 't2'), ids(['C'])]);
    const seen: string[] = [];

    const err = await (async () => {
      for await (const page of queryCollectiveIdentifierPages(client, REQUEST, { maxPages: 2 })) {
        seen.push(...page.items.map((i) => i.collectiveIdentifierNumber));
      }
    })().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(KSeFPaginationError);
    expect(err).toBeInstanceOf(KSeFError);
    expect((err as KSeFPaginationError).continuationToken).toBe('t2');
    expect((err as Error).message).toMatch(/2 pages/);
    expect(seen).toEqual(['A', 'B']);
    expect(client.collectiveIdentifiers.query).toHaveBeenCalledTimes(2);
  });

  it('does not throw when the last page lands exactly on the cap', async () => {
    const client = mockClient([ids(['A'], 't1'), ids(['B'])]);

    const all = await collectAllCollectiveIdentifiers(client, REQUEST, { maxPages: 2 });

    expect(all).toHaveLength(2);
  });

  it('throws instead of looping when KSeF repeats a continuation token', async () => {
    const client = mockClient([ids(['A'], 't1'), ids(['B'], 't1'), ids(['C'])]);
    const seen: string[] = [];

    const err = await (async () => {
      for await (const page of queryCollectiveIdentifierPages(client, REQUEST)) {
        seen.push(...page.items.map((i) => i.collectiveIdentifierNumber));
      }
    })().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(KSeFPaginationError);
    expect((err as KSeFPaginationError).continuationToken).toBe('t1');
    expect((err as Error).message).toMatch(/stalled/);
    // Every page read is yielded before the walk gives up.
    expect(seen).toEqual(['A', 'B']);
    expect(client.collectiveIdentifiers.query).toHaveBeenCalledTimes(2);
  });

  it('throws when KSeF hands back the token the walk resumed from', async () => {
    const client = mockClient([ids(['A'], 't0')]);

    await expect(
      collectAllCollectiveIdentifiers(client, REQUEST, { continuationToken: 't0' }),
    ).rejects.toBeInstanceOf(KSeFPaginationError);
  });

  it('rejects an invalid pageSize or maxPages before any request', async () => {
    const client = mockClient([ids(['A'])]);

    await expect(collectAllCollectiveIdentifiers(client, REQUEST, { pageSize: 0 }))
      .rejects.toBeInstanceOf(KSeFValidationError);
    await expect(collectAllCollectiveIdentifiers(client, REQUEST, { pageSize: 1.5 }))
      .rejects.toBeInstanceOf(KSeFValidationError);
    await expect(collectAllCollectiveIdentifiers(client, REQUEST, { maxPages: 0 }))
      .rejects.toBeInstanceOf(KSeFValidationError);
    expect(client.collectiveIdentifiers.query).not.toHaveBeenCalled();
  });
});

describe('getCollectiveIdentifierPagesByKsefNumber', () => {
  it('pages through the identifiers of one invoice', async () => {
    const client = mockClient([ids(['A'], 't1'), ids(['B'])]);

    const pages = await drain(getCollectiveIdentifierPagesByKsefNumber(client, KSEF));

    expect(pages).toHaveLength(2);
    expect(client.collectiveIdentifiers.getByKsefNumber).toHaveBeenNthCalledWith(1, KSEF, 200, undefined);
    expect(client.collectiveIdentifiers.getByKsefNumber).toHaveBeenNthCalledWith(2, KSEF, 200, 't1');
  });

  it('collects every identifier into one array', async () => {
    const client = mockClient([ids(['A'], 't1'), ids(['B'])]);

    const all = await collectAllCollectiveIdentifiersByKsefNumber(client, KSEF, { pageSize: 10 });

    expect(all.map((i) => i.collectiveIdentifierNumber)).toEqual(['A', 'B']);
    expect(client.collectiveIdentifiers.getByKsefNumber).toHaveBeenNthCalledWith(1, KSEF, 10, undefined);
  });
});

describe('queryCollectiveIdentifierInvoicePages', () => {
  const request = { collectiveIdentifierNumbers: ['1111111111-IZ202607-65ED02180000-E7'] };
  const invoice = (ksefNumber: string) => ({ ksefNumber, detailsHidden: false }) as any;

  it('pages through the invoices with the larger default page size', async () => {
    const queryInvoices = vi.fn()
      .mockResolvedValueOnce({ invoices: [invoice('X'), invoice('Y')], continuationToken: 'i1' })
      .mockResolvedValueOnce({ invoices: [invoice('Z')], continuationToken: null });
    const client = { collectiveIdentifiers: { queryInvoices } } as any;

    const pages = await drain(queryCollectiveIdentifierInvoicePages(client, request));

    expect(pages.map((p) => p.items.length)).toEqual([2, 1]);
    expect(queryInvoices).toHaveBeenNthCalledWith(1, request, 500, undefined);
    expect(queryInvoices).toHaveBeenNthCalledWith(2, request, 500, 'i1');
  });

  it('collects every invoice into one array', async () => {
    const queryInvoices = vi.fn()
      .mockResolvedValueOnce({ invoices: [invoice('X')], continuationToken: 'i1' })
      .mockResolvedValueOnce({ invoices: [invoice('Y')] });
    const client = { collectiveIdentifiers: { queryInvoices } } as any;

    const all = await collectAllCollectiveIdentifierInvoices(client, request);

    expect(all.map((i) => i.ksefNumber)).toEqual(['X', 'Y']);
  });
});
