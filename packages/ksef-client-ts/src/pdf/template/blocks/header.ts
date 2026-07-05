import { applyFormat } from '../../format.js';
import type { HeaderBlock } from '../dsl.js';
import { resolveBinding, resolveText, type BlockRenderer, type PdfNode } from '../interpret.js';

/**
 * Invoice header: optional logo, a title (defaults to the localized "Invoice"
 * label), and the invoice number/date stacked on the right.
 */
export const headerRenderer: BlockRenderer<HeaderBlock> = (block, ctx) => {
  const left: PdfNode[] = [];
  if (block.logo) {
    const logo = resolveBinding(block.logo, ctx);
    if (logo) left.push({ image: logo, width: 120, margin: [0, 0, 0, 6] });
  }
  const title = resolveText(block.title, ctx) || ctx.label('invoice');
  left.push({ text: title, style: block.style ?? 'title' });

  const right: PdfNode[] = [];
  if (block.number) {
    right.push({ text: `${ctx.label('invoiceNumber')}: ${resolveBinding(block.number, ctx)}` });
  }
  if (block.date) {
    right.push({ text: `${ctx.label('issueDate')}: ${applyFormat(resolveBinding(block.date, ctx), 'date')}` });
  }

  return {
    columns: [
      { width: '*', stack: left },
      { width: 'auto', stack: right, alignment: 'right' },
    ],
    margin: [0, 0, 0, 12],
  };
};
