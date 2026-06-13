import { describe, it, expect, vi } from 'vitest';
import {
  queryAllInvoiceMetadata,
  collectAllInvoiceMetadata,
} from '../../../src/workflows/metadata-query-paging.js';
import { KSeFMetadataPaginationError } from '../../../src/errors/ksef-metadata-pagination-error.js';
import type { InvoiceQueryFilters } from '../../../src/models/invoices/types.js';

// --- helpers -------------------------------------------------------------

/** Minimal invoice metadata record — helper only reads ksefNumber + a date field. */
function inv(ksefNumber: string, issueDate: string) {
  return { ksefNumber, issueDate } as any;
}

function resp(
  invoices: ReturnType<typeof inv>[],
  flags: { hasMore?: boolean; isTruncated?: boolean } = {},
) {
  return {
    invoices,
    hasMore: flags.hasMore ?? false,
    isTruncated: flags.isTruncated ?? false,
  };
}

/** Mock client whose queryInvoiceMetadata returns a scripted sequence of responses. */
function mockClient(sequence: ReturnType<typeof resp>[]) {
  let i = 0;
  const queryInvoiceMetadata = vi.fn(async () => {
    const r = sequence[i] ?? resp([]);
    i += 1;
    return r;
  });
  return { invoices: { queryInvoiceMetadata } } as any;
}

function filters(overrides: Partial<InvoiceQueryFilters['dateRange']> = {}): InvoiceQueryFilters {
  return {
    subjectType: 'Subject1',
    dateRange: { dateType: 'Issue', from: '2026-01-01', ...overrides },
  } as InvoiceQueryFilters;
}

// --- tests ---------------------------------------------------------------

describe('queryAllInvoiceMetadata', () => {
  it('yields a single page when there is no more and no truncation', async () => {
    const client = mockClient([resp([inv('A', '2026-01-02'), inv('B', '2026-01-03')])]);

    const out = await collectAllInvoiceMetadata(client, filters());

    expect(out.map((i) => i.ksefNumber)).toEqual(['A', 'B']);
    expect(client.invoices.queryInvoiceMetadata).toHaveBeenCalledTimes(1);
  });

  it('advances pageOffset while hasMore is true', async () => {
    const client = mockClient([
      resp([inv('A', '2026-01-02'), inv('B', '2026-01-03')], { hasMore: true }),
      resp([inv('C', '2026-01-04')]),
    ]);

    const out = await collectAllInvoiceMetadata(client, filters(), { pageSize: 2 });

    expect(out.map((i) => i.ksefNumber)).toEqual(['A', 'B', 'C']);
    const calls = client.invoices.queryInvoiceMetadata.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toBe(0); // first offset
    expect(calls[1][1]).toBe(2); // advanced by pageSize
  });

  it('crosses one truncation boundary by pushing `from` forward (Asc) and dedupes the boundary invoice', async () => {
    const client = mockClient([
      // capped window — last invoice at 2026-01-10
      resp([inv('A', '2026-01-05'), inv('B', '2026-01-10')], { isTruncated: true }),
      // re-narrowed window from 2026-01-10 — boundary invoice B reappears, then new ones
      resp([inv('B', '2026-01-10'), inv('C', '2026-01-12')]),
    ]);

    const out = await collectAllInvoiceMetadata(client, filters());

    expect(out.map((i) => i.ksefNumber)).toEqual(['A', 'B', 'C']); // B not duplicated
    const calls = client.invoices.queryInvoiceMetadata.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].dateRange.from).toBe('2026-01-01');
    expect(calls[1][0].dateRange.from).toBe('2026-01-10'); // re-narrowed boundary
  });

  it('crosses multiple truncation boundaries until a window is not truncated', async () => {
    const client = mockClient([
      resp([inv('A', '2026-01-05'), inv('B', '2026-01-10')], { isTruncated: true }),
      resp([inv('B', '2026-01-10'), inv('C', '2026-01-20')], { isTruncated: true }),
      resp([inv('C', '2026-01-20'), inv('D', '2026-01-25')]),
    ]);

    const out = await collectAllInvoiceMetadata(client, filters());

    expect(out.map((i) => i.ksefNumber)).toEqual(['A', 'B', 'C', 'D']);
    const calls = client.invoices.queryInvoiceMetadata.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[1][0].dateRange.from).toBe('2026-01-10');
    expect(calls[2][0].dateRange.from).toBe('2026-01-20');
  });

  it('pulls `to` backward when sorting Desc', async () => {
    const client = mockClient([
      resp([inv('Z', '2026-06-20'), inv('Y', '2026-06-10')], { isTruncated: true }),
      resp([inv('Y', '2026-06-10'), inv('X', '2026-06-05')]),
    ]);

    const out = await collectAllInvoiceMetadata(client, filters({ to: '2026-12-31' }), {
      sortOrder: 'Desc',
    });

    expect(out.map((i) => i.ksefNumber)).toEqual(['Z', 'Y', 'X']);
    const calls = client.invoices.queryInvoiceMetadata.mock.calls;
    expect(calls[0][0].dateRange.to).toBe('2026-12-31');
    expect(calls[1][0].dateRange.to).toBe('2026-06-10'); // pulled backward
    expect(calls[0][3]).toBe('Desc'); // sortOrder forwarded
  });

  it('throws KSeFMetadataPaginationError when a truncated window makes no progress', async () => {
    // First window already starts at the boundary date and stays truncated there.
    const client = mockClient([
      resp([inv('A', '2026-01-05'), inv('B', '2026-01-05')], { isTruncated: true }),
    ]);

    await expect(
      collectAllInvoiceMetadata(client, filters({ from: '2026-01-05' })),
    ).rejects.toBeInstanceOf(KSeFMetadataPaginationError);
  });

  it('does not mutate the caller-supplied filters', async () => {
    const client = mockClient([
      resp([inv('A', '2026-01-05')], { isTruncated: true }),
      resp([inv('A', '2026-01-05'), inv('B', '2026-01-08')]),
    ]);
    const f = filters();
    const fromBefore = f.dateRange.from;

    await collectAllInvoiceMetadata(client, f);

    expect(f.dateRange.from).toBe(fromBefore);
  });

  it('exposes the stalled boundary value on the thrown error', async () => {
    const client = mockClient([
      resp([inv('A', '2026-02-01')], { isTruncated: true }),
    ]);

    await expect(
      collectAllInvoiceMetadata(client, filters({ from: '2026-02-01' })),
    ).rejects.toMatchObject({ boundaryValue: '2026-02-01' });
  });
});
