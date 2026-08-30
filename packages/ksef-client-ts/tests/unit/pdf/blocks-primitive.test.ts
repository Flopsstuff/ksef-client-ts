import { describe, it, expect } from 'vitest';
import { tableRenderer } from '../../../src/pdf/template/blocks/table.js';
import { imageRenderer } from '../../../src/pdf/template/blocks/image.js';
import type { RenderContext } from '../../../src/pdf/template/interpret.js';
import type { ImageBlock, TableBlock } from '../../../src/pdf/template/dsl.js';

/** Build a RenderContext by hand; label is identity so keys pass through. */
function makeCtx(root: unknown, overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    root,
    strict: false,
    label: (k: string) => k,
    bindings: {},
    flags: {},
    ...overrides,
  };
}

/** The interpreter passes `render` to renderers; these primitives ignore it. */
const noRender = () => null;

/** Narrow a returned node to a property bag for structural assertions. */
function asRecord(node: unknown): Record<string, unknown> {
  expect(node).toBeTypeOf('object');
  return node as Record<string, unknown>;
}

const ROOT = {
  Fa: {
    // Multi-line repeater.
    FaWiersz: [
      { P_7: 'Item A', P_11: '100.00' },
      { P_7: 'Item B', P_11: '200.5' },
    ],
    // Single element the parser would collapse into an object (not an array).
    Solo: { P_7: 'Only', P_11: '5' },
    P_15: '1234.5',
  },
};

const COLS = [
  { label: 'name', path: 'P_7' },
  { label: 'amount', path: 'P_11', format: 'money' as const },
];

describe('tableRenderer', () => {
  it('renders a repeater with a 2-element array (header + 2 body rows)', () => {
    const block: TableBlock = { type: 'table', from: 'Fa.FaWiersz', columns: COLS };
    const node = asRecord(tableRenderer(block, makeCtx(ROOT), noRender));
    const table = asRecord(node.table);
    const body = table.body as Record<string, unknown>[][];

    expect(table.headerRows).toBe(1);
    expect(table.widths).toEqual(['*', '*']);
    expect(body).toHaveLength(3); // header + 2 rows
    // Header row uses the (identity) label resolver.
    expect(body[0]).toEqual([
      { text: 'name', bold: true },
      { text: 'amount', bold: true },
    ]);
    // Row-relative bindings + formatter application in a cell.
    expect(body[1][0]).toEqual({ text: 'Item A' });
    expect(body[1][1]).toEqual({ text: '100,00' });
    expect(body[2][1]).toEqual({ text: '200,50' });
    // Light layout, no style when unset.
    expect(node.layout).toBe('lightHorizontalLines');
    expect(node.style).toBeUndefined();
  });

  // pdfmake reads body[0].length while measuring, so an empty body takes the
  // render down instead of drawing nothing. Headers off plus a repeater that
  // matched nothing is the reachable way to get there.
  it('returns null when headers are off and the repeater matched no rows', () => {
    const block: TableBlock = {
      type: 'table',
      from: 'Fa.NieMaTakiej',
      columns: COLS,
      headers: false,
    };
    expect(tableRenderer(block, makeCtx(ROOT), noRender)).toBeNull();
  });

  it('still renders a header-only table when headers are on', () => {
    const block: TableBlock = { type: 'table', from: 'Fa.NieMaTakiej', columns: COLS };
    const node = asRecord(tableRenderer(block, makeCtx(ROOT), noRender));
    const table = asRecord(node.table);
    expect((table.body as unknown[]).length).toBe(1);
  });

  it('renders a repeater whose single element collapsed to an object (header + 1 row)', () => {
    const block: TableBlock = { type: 'table', from: 'Fa.Solo', columns: COLS };
    const node = asRecord(tableRenderer(block, makeCtx(ROOT), noRender));
    const body = asRecord(node.table).body as Record<string, unknown>[][];

    expect(body).toHaveLength(2); // header + single collapsed row
    expect(body[1][0]).toEqual({ text: 'Only' });
    expect(body[1][1]).toEqual({ text: '5,00' });
  });

  it('renders a single root-relative row when `from` is absent', () => {
    const block: TableBlock = {
      type: 'table',
      columns: [{ label: 'total', path: 'Fa.P_15', format: 'money' }],
    };
    const node = asRecord(tableRenderer(block, makeCtx(ROOT), noRender));
    const body = asRecord(node.table).body as Record<string, unknown>[][];

    expect(body).toHaveLength(2); // header + single root row
    // Thousands are grouped with a non-breaking space (formatMoney).
    expect(body[1][0]).toEqual({ text: '1\u00A0234,50' });
  });

  it('resolves a non-XML binding for a root-relative cell', () => {
    const block: TableBlock = { type: 'table', columns: [{ label: 'k', path: 'opts.ksefNumber' }] };
    const ctx = makeCtx(ROOT, { bindings: { 'opts.ksefNumber': 'KSEF-1' } });
    const node = asRecord(tableRenderer(block, ctx, noRender));
    const body = asRecord(node.table).body as Record<string, unknown>[][];
    expect(body[1][0]).toEqual({ text: 'KSEF-1' });
  });

  it('omits the header row when `headers` is false', () => {
    const block: TableBlock = { type: 'table', from: 'Fa.FaWiersz', columns: COLS, headers: false };
    const node = asRecord(tableRenderer(block, makeCtx(ROOT), noRender));
    const table = asRecord(node.table);
    const body = table.body as Record<string, unknown>[][];

    expect(table.headerRows).toBe(0);
    expect(body).toHaveLength(2); // no header, 2 rows only
    expect(body[0][0]).toEqual({ text: 'Item A' });
  });

  it('attaches a style when set', () => {
    const block: TableBlock = { type: 'table', from: 'Fa.FaWiersz', columns: COLS, style: 'lines' };
    const node = asRecord(tableRenderer(block, makeCtx(ROOT), noRender));
    expect(node.style).toBe('lines');
  });
});

describe('imageRenderer', () => {
  it('uses a literal `src` data URI with the default width', () => {
    const block: ImageBlock = { type: 'image', src: 'data:image/png;base64,AAAA' };
    const node = asRecord(imageRenderer(block, makeCtx(ROOT), noRender));
    expect(node).toEqual({ image: 'data:image/png;base64,AAAA', width: 120 });
  });

  it('resolves a `path` binding when `src` is absent', () => {
    const block: ImageBlock = { type: 'image', path: 'opts.logo', width: 80 };
    const ctx = makeCtx(ROOT, { bindings: { 'opts.logo': 'data:image/png;base64,BBBB' } });
    const node = asRecord(imageRenderer(block, ctx, noRender));
    expect(node).toEqual({ image: 'data:image/png;base64,BBBB', width: 80 });
  });

  it('honours a custom `width`', () => {
    const block: ImageBlock = { type: 'image', src: 'data:image/png;base64,CCCC', width: 42 };
    const node = asRecord(imageRenderer(block, makeCtx(ROOT), noRender));
    expect(node.width).toBe(42);
  });

  it('returns an empty text node when the `path` binding resolves empty', () => {
    const block: ImageBlock = { type: 'image', path: 'opts.logo' };
    const node = asRecord(imageRenderer(block, makeCtx(ROOT), noRender));
    expect(node).toEqual({ text: '' });
  });

  it('returns an empty text node when neither `src` nor `path` is set', () => {
    const block: ImageBlock = { type: 'image' };
    const node = asRecord(imageRenderer(block, makeCtx(ROOT), noRender));
    expect(node).toEqual({ text: '' });
  });
});
