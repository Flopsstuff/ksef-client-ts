import { list } from '../../accessor.js';
import type { PartiesBlock, PartyAlternative, PartyColumn, PartyField, PartyGroup } from '../dsl.js';
import { resolveBinding, type BlockRenderer, type PdfNode, type RenderContext } from '../interpret.js';

/**
 * The panel's own heading — `Sprzedawca` / `Nabywca` — takes the block's
 * `headingStyle`, defaulting to this. The labels *inside* a panel (`Adres`,
 * `Dane kontaktowe`) are a level below and always take {@link SUBHEADING_STYLE}:
 * a template redirecting its section headings is not asking for every label in
 * the document to move with them.
 */
const DEFAULT_HEADING_STYLE = 'h2';

/** Sub-headings within a block. Fixed, and the same across every block. */
const SUBHEADING_STYLE = 'h2';

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
 * alternatives that do not apply are absent by design. An alternative may name
 * a `prefixPath` for the qualifier the schema pairs it with — `KodUE` before
 * `NrVatUE`, `KodKraju` before `NrID` — so the identifier prints whole.
 *
 * An entry may also be a labelled group — the address, the contact details —
 * rendered as a sub-heading over its own lines, and repeated per entry when it
 * carries `from`. An entirely unresolved group is dropped with its heading, so
 * no counterparty gets a label with nothing under it.
 *
 * Value lines take {@link PartyColumn.style}; a group may override it for its
 * own lines with {@link PartyGroup.style}. The panel heading takes the block's
 * `headingStyle`; a group's own label stays at {@link SUBHEADING_STYLE}.
 */
export const partiesRenderer: BlockRenderer<PartiesBlock> = (block, ctx) => {
  const heading = block.headingStyle ?? DEFAULT_HEADING_STYLE;
  const at = (root: unknown, strict = ctx.strict): RenderContext => ({ ...ctx, root, strict });

  const resolveValue = (
    field: string | { path: string; optional?: boolean } | { firstOf: PartyAlternative[] },
    root: unknown,
    strict: boolean,
  ): string => {
    if (typeof field === 'string') return resolveBinding(field, at(root, strict));
    if ('path' in field) return resolveBinding(field.path, at(root, field.optional ? false : strict));
    for (const alternative of field.firstOf) {
      const { path, prefixPath } = typeof alternative === 'string' ? { path: alternative, prefixPath: undefined } : alternative;
      const value = resolveBinding(path, at(root, false));
      if (!value) continue;
      // The qualifier is part of the identifier, not a second fact: `DE` and
      // `123456789` are one VAT number and print as one. An absent qualifier
      // leaves the number to stand alone rather than dropping the line.
      const prefix = prefixPath ? resolveBinding(prefixPath, at(root, false)) : '';
      return prefix ? `${prefix} ${value}` : value;
    }
    return '';
  };

  // The style travels down rather than being stamped onto the rendered nodes
  // afterwards: a group's sub-heading must keep the heading style, and only the
  // value lines take the group's own.
  const renderFields = (fields: PartyField[], root: unknown, strict: boolean, style?: string): PdfNode[] => {
    const out: PdfNode[] = [];
    for (const field of fields) {
      if (isGroup(field)) {
        const inherited = field.style ?? style;
        // A repeater's entries carry optional fields, so they are read leniently.
        const inner = field.from
          ? list(root, field.from).flatMap((item) => renderFields(field.fields, item, false, inherited))
          : renderFields(field.fields, root, strict, inherited);
        if (inner.length === 0) continue; // no heading without content
        out.push({ text: ctx.label(field.label), style: SUBHEADING_STYLE });
        out.push(...inner);
        continue;
      }
      const value = resolveValue(field, root, strict);
      if (value === '') continue;
      out.push(style ? { text: value, style } : { text: value });
    }
    return out;
  };

  const side = (col: PartyColumn): PdfNode => ({
    width: '*',
    stack: [
      { text: ctx.label(col.label), style: heading },
      ...renderFields(col.fields, ctx.root, ctx.strict, col.style),
    ],
  });

  return {
    columns: [side(block.left), side(block.right)],
    margin: [0, 0, 0, 12],
    ...(block.style ? { style: block.style } : {}),
  };
};
