import { applyFormat } from '../../format.js';
import type { PaymentBlock } from '../dsl.js';
import { resolveBinding, type BlockRenderer, type PdfNode } from '../interpret.js';

/**
 * Payment details: a `payment` heading followed by one `label: value` line per
 * {@link PaymentBlock.rows} entry (localized label + formatted scalar binding).
 * Visibility (`when`) is resolved centrally by the interpreter, so this renderer
 * always emits its content.
 */
export const paymentRenderer: BlockRenderer<PaymentBlock> = (block, ctx) => {
  const stack: PdfNode[] = [{ text: ctx.label('payment'), style: 'h2' }];
  for (const row of block.rows) {
    stack.push({
      text: `${ctx.label(row.label)}: ${applyFormat(resolveBinding(row.path, ctx), row.format)}`,
    });
  }

  return {
    stack,
    margin: [0, 8, 0, 8],
    ...(block.style ? { style: block.style } : {}),
  };
};
