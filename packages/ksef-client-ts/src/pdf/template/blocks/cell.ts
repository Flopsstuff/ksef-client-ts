import { applyFormat } from '../../format.js';
import type { ColumnDef } from '../dsl.js';
import type { PdfNode, RenderContext } from '../interpret.js';

/** Separator between `sub` entries when the column names none. */
const DEFAULT_SUB_SEPARATOR = ' · ';

/**
 * One table cell: the column's own value, and — when the column declares `sub`
 * — a second line carrying the classifiers that row happens to have.
 *
 * The second line is built by joining `label value` pairs and dropping every
 * entry that resolves empty, which is the whole point of putting them here
 * rather than in columns of their own: `Indeks`, `GTIN`, `PKWiU`, `CN` and
 * `PKOB` are all optional and a real invoice carries one or two, but a column's
 * width is fixed for the whole table and cannot shrink away per row.
 *
 * Reading is left to the caller because the same column definition is resolved
 * row-relative in a repeater and against the document root in a single-row
 * table.
 */
export function buildCell(
  column: ColumnDef,
  read: (path: string, optional: boolean) => string,
  ctx: RenderContext,
): PdfNode {
  const value = applyFormat(read(column.path, column.optional === true), column.format);

  const parts: string[] = [];
  for (const sub of column.sub ?? []) {
    const text = applyFormat(read(sub.path, sub.optional === true), sub.format);
    if (text !== '') parts.push(`${ctx.label(sub.label)} ${text}`);
  }

  if (parts.length === 0) {
    return column.style ? { text: value, style: column.style } : { text: value };
  }
  return {
    stack: [
      { text: value },
      {
        text: parts.join(column.subSeparator ?? DEFAULT_SUB_SEPARATOR),
        ...(column.subStyle ? { style: column.subStyle } : {}),
      },
    ],
    ...(column.style ? { style: column.style } : {}),
  };
}

/** The header cell for a column: its localized label, in the column's style. */
export function buildHeaderCell(column: ColumnDef, ctx: RenderContext): PdfNode {
  return { text: ctx.label(column.label), bold: true, ...(column.style ? { style: column.style } : {}) };
}
