import { applyFormat, sumDecimal } from '../../format.js';
import type { TotalsBlock } from '../dsl.js';
import { resolveBinding, type BlockRenderer, type PdfNode } from '../interpret.js';

/**
 * Totals summary: a compact, right-aligned label/value table. Each row of
 * {@link TotalsBlock.rows} contributes a bold label (`ctx.label(row.label)`)
 * and its formatted value — either one scalar binding (`path`) or the decimal
 * sum of several (`sum`), because net sales and tax are split across the
 * `P_13_*`/`P_14_*` rate buckets and no single total field exists. The
 * borderless table is pushed to the right edge by an elastic spacer column.
 */
export const totalsRenderer: BlockRenderer<TotalsBlock> = (block, ctx) => {
  // A `sum` lists every bucket the schema allows and a real invoice fills only
  // the one or two that apply, so its paths are read non-strictly: an absent
  // bucket is the normal case here, not the dot-path typo `strict` hunts for.
  const lenient = { ...ctx, strict: false };

  const body: PdfNode[][] = block.rows.map((row) => {
    const raw = row.sum
      ? sumDecimal(row.sum.map((p) => resolveBinding(p, lenient)))
      : resolveBinding(row.path ?? '', ctx);
    return [
      { text: ctx.label(row.label), bold: true },
      { text: applyFormat(raw, row.format), alignment: 'right' },
    ];
  });

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
