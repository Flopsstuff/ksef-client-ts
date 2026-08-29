import { applyFormat } from '../../format.js';
import type { AnnotationsBlock } from '../dsl.js';
import { resolveBinding, type BlockRenderer, type PdfNode } from '../interpret.js';

/**
 * Legal annotations: an `annotations` heading followed by one `label: value`
 * line per {@link AnnotationsBlock.fields} entry (localized label + formatted
 * scalar binding).
 */
export const annotationsRenderer: BlockRenderer<AnnotationsBlock> = (block, ctx) => {
  const stack: PdfNode[] = [{ text: ctx.label('annotations'), style: block.headingStyle ?? 'h2' }];
  for (const field of block.fields) {
    stack.push({
      text: `${ctx.label(field.label)}: ${applyFormat(resolveBinding(field.path, ctx), field.format)}`,
    });
  }

  return {
    stack,
    margin: [0, 8, 0, 8],
    ...(block.style ? { style: block.style } : {}),
  };
};
