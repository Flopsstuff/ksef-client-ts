import { applyFormat } from '../../format.js';
import type { TotalsBlock } from '../dsl.js';
import { resolveBinding, type BlockRenderer, type PdfNode } from '../interpret.js';

/**
 * Totals summary: a compact, right-aligned label/value table. Each row of
 * {@link TotalsBlock.rows} contributes a bold label (`ctx.label(row.label)`)
 * and its formatted scalar binding. The borderless table is pushed to the right
 * edge by an elastic spacer column.
 */
export const totalsRenderer: BlockRenderer<TotalsBlock> = (block, ctx) => {
  const body: PdfNode[][] = block.rows.map((row) => [
    { text: ctx.label(row.label), bold: true },
    { text: applyFormat(resolveBinding(row.path, ctx), row.format), alignment: 'right' },
  ]);

  return {
    columns: [
      { width: '*', text: '' },
      {
        width: 'auto',
        table: { widths: ['auto', 'auto'], body },
        layout: 'noBorders',
      },
    ],
    margin: [0, 4, 0, 8],
    ...(block.style ? { style: block.style } : {}),
  };
};
