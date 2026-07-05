import type { PartiesBlock, PartyColumn } from '../dsl.js';
import { resolveBinding, type BlockRenderer, type PdfNode } from '../interpret.js';

/**
 * Seller/buyer parties: a two-column layout. Each side is a stack led by a bold
 * label line (`ctx.label(side.label)`, styled `h2`) followed by one text line
 * per binding path in `side.fields`. Left = {@link PartiesBlock.left}, right =
 * {@link PartiesBlock.right}.
 */
export const partiesRenderer: BlockRenderer<PartiesBlock> = (block, ctx) => {
  const side = (col: PartyColumn): PdfNode => {
    const stack: PdfNode[] = [{ text: ctx.label(col.label), style: 'h2' }];
    for (const path of col.fields) stack.push({ text: resolveBinding(path, ctx) });
    return { width: '*', stack };
  };

  return {
    columns: [side(block.left), side(block.right)],
    margin: [0, 0, 0, 12],
    ...(block.style ? { style: block.style } : {}),
  };
};
