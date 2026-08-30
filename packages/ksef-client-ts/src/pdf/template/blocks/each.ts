import { list } from '../../accessor.js';
import type { Block, EachBlock } from '../dsl.js';
import { type BlockRenderer, type PdfNode } from '../interpret.js';

const DIVIDER: Block = { type: 'divider' };

/**
 * Repeat a group of blocks once per entry of a collection, each entry rendered
 * with itself as the binding root, so children read item-relative paths.
 *
 * This exists because a table cannot lay out every record. pdfmake sizes all
 * `'*'` columns identically and never below their widest minimum content width,
 * so a record holding long unbreakable tokens — a UPO document pairs a
 * 35-character KSeF number with a 44-character hash — forces a table wider than
 * the page and the trailing columns fall off it. Stacking each record instead
 * keeps every field on the page whatever its length.
 *
 * The collection is read with {@link list}, so one collapsed entry repeats like
 * many, and an absent collection renders nothing rather than an empty frame.
 */
export const eachRenderer: BlockRenderer<EachBlock> = (block, ctx, render) => {
  const items = list(ctx.root, block.from);
  if (items.length === 0) return null;

  const stack: PdfNode[] = [];
  items.forEach((item, index) => {
    if (block.separator && index > 0) {
      const divider = render(DIVIDER, ctx);
      if (divider !== null) stack.push(...(Array.isArray(divider) ? divider : [divider]));
    }
    for (const child of block.blocks) {
      const node = render(child, { ...ctx, root: item });
      if (node === null) continue;
      stack.push(...(Array.isArray(node) ? node : [node]));
    }
  });

  return { stack, ...(block.style ? { style: block.style } : {}) };
};
