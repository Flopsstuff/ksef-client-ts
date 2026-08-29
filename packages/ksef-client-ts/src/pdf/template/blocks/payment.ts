import { get, list } from '../../accessor.js';
import { applyFormat } from '../../format.js';
import type { PaymentBlock } from '../dsl.js';
import { resolveBinding, type BlockRenderer, type PdfNode } from '../interpret.js';

/**
 * Payment details: a `payment` heading, one `label: value` line per
 * {@link PaymentBlock.rows} entry, then an optional repeating bank-account
 * section ({@link PaymentBlock.accounts}) — one `label: value` line per field,
 * for each account in the collection.
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
  const stack: PdfNode[] = [{ text: ctx.label('payment'), style: 'h2' }];

  for (const row of block.rows) {
    const value = applyFormat(resolveBinding(row.path, row.optional ? lenientCtx : ctx), row.format);
    if (value === '') continue;
    stack.push({ text: `${ctx.label(row.label)}: ${value}` });
  }

  if (block.accounts) {
    const lines: PdfNode[] = [];
    for (const account of list(ctx.root, block.accounts.from)) {
      for (const field of block.accounts.fields) {
        const value = applyFormat(get(account, field.path, field.optional ? false : ctx.strict), field.format);
        if (value === '') continue;
        lines.push({ text: `${ctx.label(field.label)}: ${value}` });
      }
    }
    if (lines.length > 0) {
      if (block.accounts.heading) stack.push({ text: ctx.label(block.accounts.heading), style: 'h2' });
      stack.push(...lines);
    }
  }

  return {
    stack,
    margin: [0, 8, 0, 8],
    ...(block.style ? { style: block.style } : {}),
  };
};
