import { applyFormat } from '../../format.js';
import type { HeaderBlock } from '../dsl.js';
import { resolveBinding, resolveText, type BlockRenderer, type PdfNode } from '../interpret.js';

/**
 * Invoice header: a title (defaults to the localized "Invoice" label) with the
 * optional logo beneath it, and the invoice number, issue date and KSeF number stacked on the
 * right — one `label: value` line each, in the body font. The KSeF number is
 * dropped when it resolves empty, so an offline visualization shows no dangling
 * label (the separate OFFLINE marker covers that case).
 */
export const headerRenderer: BlockRenderer<HeaderBlock> = (block, ctx) => {
  const title = resolveText(block.title, ctx) || ctx.label('invoice');
  const left: PdfNode[] = [{ text: title, style: block.style ?? 'title' }];
  if (block.logo) {
    const logo = resolveBinding(block.logo, ctx);
    if (logo) left.push({ image: logo, width: block.logoWidth ?? 120, margin: [0, 6, 0, 0] });
  }

  const right: PdfNode[] = [];
  if (block.number) {
    right.push({ text: `${ctx.label('invoiceNumber')}: ${resolveBinding(block.number, ctx)}` });
  }
  if (block.date) {
    right.push({ text: `${ctx.label('issueDate')}: ${applyFormat(resolveBinding(block.date, ctx), 'date')}` });
  }
  if (block.ksefNumber) {
    const value = resolveBinding(block.ksefNumber, ctx);
    if (value) right.push({ text: `${ctx.label('ksefNumber')}: ${value}` });
  }

  return {
    columns: [
      { width: '*', stack: left },
      { width: 'auto', stack: right, alignment: 'right' },
    ],
    margin: [0, 0, 0, 12],
  };
};
