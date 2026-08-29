import { list } from '../../accessor.js';
import type { PartiesBlock, PartyColumn, PartyField, PartyGroup } from '../dsl.js';
import { resolveBinding, type BlockRenderer, type PdfNode, type RenderContext } from '../interpret.js';

/** Heading style shared by the panel label and its sub-group labels. */
const HEADING_STYLE = 'h2';

function isGroup(field: PartyField): field is PartyGroup {
  return typeof field !== 'string' && 'fields' in field;
}

/**
 * Seller/buyer parties: a two-column layout. Each side is a stack led by a bold
 * label line (`ctx.label(side.label)`, styled `h2`) followed by one text line
 * per entry in `side.fields`. Left = {@link PartiesBlock.left}, right =
 * {@link PartiesBlock.right}.
 *
 * A line whose value resolves empty is skipped, so an optional field a
 * counterparty does not carry leaves no gap in the panel. Strict mode still
 * surfaces dot-path typos: a missing binding throws before it can be skipped.
 *
 * An entry may instead list alternatives (`firstOf`) and print the first that
 * resolves — which is how the counterparty identifier is bound, since KSeF
 * supplies exactly one of NIP / NrVatUE / NrID. Those are read leniently: the
 * alternatives that do not apply are absent by design.
 *
 * An entry may also be a labelled group — the address, the contact details —
 * rendered as a sub-heading over its own lines, and repeated per entry when it
 * carries `from`. An entirely unresolved group is dropped with its heading, so
 * no counterparty gets a label with nothing under it.
 */
export const partiesRenderer: BlockRenderer<PartiesBlock> = (block, ctx) => {
  const at = (root: unknown, strict = ctx.strict): RenderContext => ({ ...ctx, root, strict });

  const resolveValue = (
    field: string | { path: string; optional?: boolean } | { firstOf: string[] },
    root: unknown,
    strict: boolean,
  ): string => {
    if (typeof field === 'string') return resolveBinding(field, at(root, strict));
    if ('path' in field) return resolveBinding(field.path, at(root, field.optional ? false : strict));
    for (const path of field.firstOf) {
      const value = resolveBinding(path, at(root, false));
      if (value) return value;
    }
    return '';
  };

  const renderFields = (fields: PartyField[], root: unknown, strict: boolean): PdfNode[] => {
    const out: PdfNode[] = [];
    for (const field of fields) {
      if (isGroup(field)) {
        // A repeater's entries carry optional fields, so they are read leniently.
        const inner = field.from
          ? list(root, field.from).flatMap((item) => renderFields(field.fields, item, false))
          : renderFields(field.fields, root, strict);
        if (inner.length === 0) continue; // no heading without content
        out.push({ text: ctx.label(field.label), style: HEADING_STYLE });
        out.push(...inner.map((n) => (field.style ? { ...(n as object), style: field.style } : n)));
        continue;
      }
      const value = resolveValue(field, root, strict);
      if (value === '') continue;
      out.push({ text: value });
    }
    return out;
  };

  const side = (col: PartyColumn): PdfNode => ({
    width: '*',
    stack: [
      { text: ctx.label(col.label), style: HEADING_STYLE },
      ...renderFields(col.fields, ctx.root, ctx.strict),
    ],
  });

  return {
    columns: [side(block.left), side(block.right)],
    margin: [0, 0, 0, 12],
    ...(block.style ? { style: block.style } : {}),
  };
};
