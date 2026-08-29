import { get, list } from '../../accessor.js';
import { applyFormat } from '../../format.js';
import type { TableBlock } from '../dsl.js';
import { resolveBinding, type BlockRenderer, type PdfNode } from '../interpret.js';

/**
 * Generic pdfmake `table`. Two modes:
 *
 * - **Repeater** (`from` set): body rows come from `list(root, from)` — always an
 *   array, so a single collapsed row iterates like many — and each cell reads a
 *   row-relative binding via `get(row, col.path)`.
 * - **Single row** (`from` absent): one body row read against the document root
 *   via `resolveBinding(col.path)`.
 *
 * A header row of localized `col.label`s is prepended unless `headers` is
 * explicitly `false`. Each column takes its own `width` (default `'*'`, an even
 * share) under a light horizontal-line layout.
 */
export const tableRenderer: BlockRenderer<TableBlock> = (block, ctx) => {
  const { columns } = block;
  const showHeaders = block.headers !== false;
  const body: PdfNode[][] = [];

  if (showHeaders) {
    body.push(columns.map((col) => ({ text: ctx.label(col.label), bold: true })));
  }

  if (block.from !== undefined) {
    for (const row of list(ctx.root, block.from)) {
      body.push(columns.map((col) => ({ text: applyFormat(get(row, col.path, ctx.strict), col.format) })));
    }
  } else {
    body.push(columns.map((col) => ({ text: applyFormat(resolveBinding(col.path, ctx), col.format) })));
  }

  const node: Record<string, unknown> = {
    table: {
      headerRows: showHeaders ? 1 : 0,
      widths: columns.map((col) => col.width ?? '*'),
      body,
    },
    layout: 'lightHorizontalLines',
  };
  return block.style ? { ...node, style: block.style } : node;
};
