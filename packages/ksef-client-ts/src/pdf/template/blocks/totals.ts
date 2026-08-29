import { applyFormat, sumDecimal } from '../../format.js';
import type { TotalsBlock } from '../dsl.js';
import { evalWhen, resolveBinding, type BlockRenderer, type PdfNode } from '../interpret.js';

/**
 * Totals summary: a compact, right-aligned label/value table. Each row of
 * {@link TotalsBlock.rows} contributes a bold label (`ctx.label(row.label)`)
 * and its formatted value — either one scalar binding (`path`) or the decimal
 * sum of several (`sum`), because net sales and tax are split across the
 * `P_13_*`/`P_14_*` rate buckets and no single total field exists. The
 * borderless table is pushed to the right edge by an elastic spacer column.
 *
 * A row whose value resolves empty is dropped, so a template may list every
 * rate bucket the schema allows and only the ones this invoice carries appear.
 */
export const totalsRenderer: BlockRenderer<TotalsBlock> = (block, ctx) => {
  // Every read here is non-strict, `sum` and `path` alike. A totals row prints
  // only when its value resolves, so a template lists every bucket the schema
  // allows and a real invoice fills one or two — an absent bucket is the normal
  // case, not the dot-path typo `strict` hunts for. Typos in our own presets are
  // caught instead by the built-in template lint, which requires the amount due
  // and at least one bucket to resolve against the reference fixtures.
  const lenient = { ...ctx, strict: false };

  const body: PdfNode[][] = [];
  for (const row of block.rows) {
    if (!evalWhen(row.when, ctx)) continue;
    const raw = row.sum
      ? sumDecimal(row.sum.map((p) => resolveBinding(p, lenient)))
      : resolveBinding(row.path ?? '', lenient);
    const value = applyFormat(raw, row.format);
    // A row that resolves empty is skipped, as in `payment` and `parties`: a
    // template listing every rate bucket must not print a dangling label for
    // each one an invoice does not use.
    if (value === '') continue;
    body.push([
      { text: ctx.label(row.label), bold: true },
      { text: value, alignment: 'right' },
    ]);
  }

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
