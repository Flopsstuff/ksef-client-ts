import { get, list } from '../../accessor.js';
import type { LinesBlock } from '../dsl.js';
import { type BlockRenderer, type PdfNode } from '../interpret.js';
import { buildCell, buildHeaderCell } from './cell.js';

/**
 * Invoice line items as a pdfmake `table`. The header row echoes each column's
 * localized label (bold); the body has one row per repeater entry read from
 * {@link LinesBlock.from} via {@link list} (a single collapsed line is
 * normalized to a one-element array, so one line renders like many). Each cell
 * reads its column path row-relative with {@link get} and applies the column's
 * formatter. With no entries only the header row is emitted. A column may also
 * carry `sub` fields, printed as one smaller line under the cell's value — see
 * {@link buildCell}.
 *
 * Column widths come from the template (`'*'` when unset). Leaving them all
 * `'*'` is rarely right: pdfmake sizes star columns identically and never below
 * the widest minimum content width among them, so one long unbreakable token
 * silently widens the whole table past the page edge.
 */
export const linesRenderer: BlockRenderer<LinesBlock> = (block, ctx) => {
  const headerRow: PdfNode[] = block.columns.map((c) => buildHeaderCell(c, ctx));
  const bodyRows: PdfNode[][] = list(ctx.root, block.from).map((row) =>
    block.columns.map((c) =>
      buildCell(c, (path, optional) => get(row, path, optional ? false : ctx.strict), ctx),
    ),
  );

  return {
    table: {
      headerRows: 1,
      widths: block.columns.map((c) => c.width ?? '*'),
      body: [headerRow, ...bodyRows],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 12],
    ...(block.style ? { style: block.style } : {}),
  };
};
