import { get, list } from '../../accessor.js';
import type { PaymentBlock } from '../dsl.js';
import { readField } from './field.js';
import { evalWhen, resolveBinding, type BlockRenderer, type PdfNode } from '../interpret.js';

/**
 * Payment details: a `payment` heading, one `label: value` line per
 * {@link PaymentBlock.rows} entry, then an optional repeating bank-account
 * section ({@link PaymentBlock.accounts}) — one `label: value` line per field,
 * for each account in the collection.
 *
 * A row may carry `when` and is dropped when it does not apply, so a template
 * can list every reading of a figure and print the one this document supports.
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

  for (const row of block.rows) {
    // A row may be one of several readings of the same figure, only one of
    // which applies to this document.
    if (!evalWhen(row.when, ctx)) continue;
    const value = readField(row, (path, optional) => resolveBinding(path, optional ? lenientCtx : ctx));
    if (value === '') continue;
    stack.push({ text: `${ctx.label(row.label)}: ${value}`, ...(row.style ? { style: row.style } : {}) });
  }

  if (block.accounts) {
    const lines: PdfNode[] = [];
    for (const account of list(ctx.root, block.accounts.from)) {
      for (const field of block.accounts.fields) {
        const value = readField(field, (path, optional) => get(account, path, optional ? false : ctx.strict));
        if (value === '') continue;
        lines.push({ text: `${ctx.label(field.label)}: ${value}`, ...(field.style ? { style: field.style } : {}) });
      }
    }
    if (lines.length > 0) {
      if (block.accounts.heading) stack.push({ text: ctx.label(block.accounts.heading), style: subheading });
      stack.push(...lines);
    }
  }

  return {
    stack,
    margin: [0, 8, 0, 8],
    ...(block.style ? { style: block.style } : {}),
  };
};
