import type { AnnotationsBlock } from '../dsl.js';
import { resolveBinding, type BlockRenderer, type PdfNode } from '../interpret.js';
import { readField } from './field.js';

/**
 * Legal annotations: an `annotations` heading followed by one `label: value`
 * line per {@link AnnotationsBlock.fields} entry (localized label + formatted
 * scalar binding).
 */
export const annotationsRenderer: BlockRenderer<AnnotationsBlock> = (block, ctx) => {
  // Bindings the schema declares optional are read leniently even under strict,
  // as the lines, payment, table and totals renderers do. Without this a field
  // the template marked optional still throws when the document omits it, which
  // is the one thing the marker exists to prevent.
  const lenientCtx = { ...ctx, strict: false };

  const stack: PdfNode[] = [{ text: ctx.label('annotations'), style: block.headingStyle ?? 'h2' }];
  for (const field of block.fields) {
    const value = readField(field, (path, optional) => resolveBinding(path, optional ? lenientCtx : ctx));
    stack.push({ text: `${ctx.label(field.label)}: ${value}` });
  }

  return {
    stack,
    margin: [0, 8, 0, 8],
    ...(block.style ? { style: block.style } : {}),
  };
};
