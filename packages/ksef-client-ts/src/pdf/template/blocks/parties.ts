import { list } from '../../accessor.js';
import type { PartiesBlock, PartyAlternative, PartyColumn, PartyField, PartyGroup } from '../dsl.js';
import { evalWhen, resolveBinding, type BlockRenderer, type PdfNode, type RenderContext } from '../interpret.js';

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
 * carries `from`: one heading over all the entries, or with `headingPerEntry`
 * one over each, for a collection of parties rather than of details. An
 * entirely unresolved group is dropped with its heading, so no counterparty
 * gets a label with nothing under it.
 *
 * Value lines take {@link PartyColumn.style}; a group may override it for its
 * own lines with {@link PartyGroup.style}. The panel heading takes the block's
 * `headingStyle`; a group's own label stays at {@link SUBHEADING_STYLE}.
 *
 * A panel may carry `when` and is then left out — its fields never read, so
 * strict mode does not police a party the document does not restate — while
 * its lane stays empty, so the other panel keeps its side of the page. With
 * both panels out the block renders nothing.
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
        // A fresh node per heading: pdfmake writes layout state onto the nodes
        // it lays out, so one object placed twice is drawn once.
        const heading = (): PdfNode => ({ text: ctx.label(field.label), style: SUBHEADING_STYLE });
        if (field.from && field.headingPerEntry) {
          // Each entry is a party of its own and gets the heading; an entry
          // that resolves to nothing gets neither.
          for (const item of list(root, field.from)) {
            const lines = renderFields(field.fields, item, false, inherited);
            if (lines.length > 0) out.push(heading(), ...lines);
          }
          continue;
        }
        // A repeater's entries carry optional fields, so they are read leniently.
        const inner = field.from
          ? list(root, field.from).flatMap((item) => renderFields(field.fields, item, false, inherited))
          : renderFields(field.fields, root, strict, inherited);
        if (inner.length === 0) continue; // no heading without content
        out.push(heading());
        out.push(...inner);
        continue;
      }
      const value = resolveValue(field, root, strict);
      if (value === '') continue;
      out.push(style ? { text: value, style } : { text: value });
    }
    return out;
  };

  const side = (col: PartyColumn): PdfNode | null => {
    if (!evalWhen(col.when, ctx)) return null;
    return {
      width: '*',
      stack: [
        { text: ctx.label(col.label), style: heading },
        ...renderFields(col.fields, ctx.root, ctx.strict, col.style),
      ],
    };
  };

  const left = side(block.left);
  const right = side(block.right);
  if (left === null && right === null) return null;
  const lane: PdfNode = { width: '*', text: '' };

  return {
    columns: [left ?? lane, right ?? lane],
    margin: [0, 0, 0, 12],
    ...(block.style ? { style: block.style } : {}),
  };
};
