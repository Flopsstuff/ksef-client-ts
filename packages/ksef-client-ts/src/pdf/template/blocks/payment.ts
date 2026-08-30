import { get, list } from '../../accessor.js';
import type { PaymentBlock } from '../dsl.js';
import { readField } from './field.js';
import { evalWhen, resolveBinding, type BlockRenderer, type PdfNode } from '../interpret.js';

/**
 * Payment details: a `payment` heading, one `label: value` line per
 * {@link PaymentBlock.rows} entry, then the repeating sections of
 * {@link PaymentBlock.groups} — a sub-heading over one `label: value` line per
 * field, for each entry in the collection. `Platnosc` has two such sections:
 * the bank accounts, and the partial payments an invoice settled in instalments
 * records with an amount, a date and a form each.
 *
 * A row may carry `when` and is dropped when it does not apply, so a template
 * can list every reading of a figure and print the one this document supports.
 * A row may also carry `from` and then prints once per entry of that
 * collection, with the entry as its binding root — which is how an invoice paid
 * in instalments shows every payment term instead of only the first.
 *
 * A row/field whose value resolves empty is skipped, so absent optional fields
 * (KSeF invoices carry many) don't print a dangling "Label:" with no value.
 * Strict mode still surfaces dot-path typos: a *missing* binding throws before
 * it can be skipped, so a self-consistency fixture that populates every path
 * catches template mistakes. Visibility (`when`) is resolved centrally by the
 * interpreter, so this renderer always emits its content.
 */
export const paymentRenderer: BlockRenderer<PaymentBlock> = (block, ctx) => {
  // Bindings the schema declares optional are read leniently even under strict.
  const lenientCtx = { ...ctx, strict: false };
  // The block's own heading follows `headingStyle`; `Rachunek bankowy` is a
  // level below it and stays put, as sub-headings do everywhere.
  const heading = block.headingStyle ?? 'h2';
  const subheading = 'h2';
  const stack: PdfNode[] = [{ text: ctx.label('payment'), style: heading }];

  /**
   * Read a binding against one entry of a repeater, or against the document
   * root when there is no entry. A path written with a leading `/` always
   * resolves from the document root: an amount inside a repeater still needs
   * the currency the document states once at the top, and `300,00` on its own
   * is exactly the ambiguity a currency suffix exists to remove.
   */
  const readAt =
    (entry: unknown) =>
    (path: string, optional: boolean): string => {
      if (path.startsWith('/')) return resolveBinding(path.slice(1), optional ? lenientCtx : ctx);
      if (entry === undefined) return resolveBinding(path, optional ? lenientCtx : ctx);
      return get(entry, path, optional ? false : ctx.strict);
    };

  for (const row of block.rows) {
    // A row may be one of several readings of the same figure, only one of
    // which applies to this document.
    if (!evalWhen(row.when, ctx)) continue;
    // A row with `from` prints one line per entry of a collection: an invoice
    // paid in instalments states a payment term per instalment, and printing
    // only the first hides the rest of the schedule.
    const style = row.style ? { style: row.style } : {};
    // A row with no binding is the label itself — `Zapłacono` states the fact,
    // and the schema's `1` after it would state nothing.
    if (row.path === undefined) {
      stack.push({ text: ctx.label(row.label), ...style });
      continue;
    }
    const field = { ...row, path: row.path };
    const entries = row.from ? list(ctx.root, row.from) : [undefined];
    for (const entry of entries) {
      const value = readField(field, readAt(entry));
      if (value === '') continue;
      stack.push({ text: `${ctx.label(row.label)}: ${value}`, ...style });
    }
  }

  for (const group of block.groups ?? []) {
    const lines: PdfNode[] = [];
    for (const entry of list(ctx.root, group.from)) {
      for (const field of group.fields) {
        const value = readField(field, readAt(entry));
        if (value === '') continue;
        lines.push({ text: `${ctx.label(field.label)}: ${value}`, ...(field.style ? { style: field.style } : {}) });
      }
    }
    if (lines.length === 0) continue; // no sub-heading over nothing
    if (group.heading) stack.push({ text: ctx.label(group.heading), style: subheading });
    stack.push(...lines);
  }

  return {
    stack,
    margin: [0, 8, 0, 8],
    ...(block.style ? { style: block.style } : {}),
  };
};
