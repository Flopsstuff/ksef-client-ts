import type { AnnotationsBlock } from '../dsl.js';
import { resolveBinding, type BlockRenderer, type PdfNode } from '../interpret.js';
import { readField } from './field.js';

/**
 * Labelled lines under a heading: one `label: value` line per
 * {@link AnnotationsBlock.fields} entry (localized label + formatted scalar
 * binding). The heading is the `annotations` label unless the block names
 * another — the same block prints the legal annotations and the reason and
 * effect of a correction.
 *
 * A line whose value resolves empty is skipped, as in `payment` and `totals`,
 * so a template may list every field a section can carry without printing a
 * dangling label for each one the document omits; and when nothing resolves
 * the block renders nothing at all, heading included.
 */
export const annotationsRenderer: BlockRenderer<AnnotationsBlock> = (block, ctx) => {
  // Bindings the schema declares optional are read leniently even under strict,
  // as the lines, payment, table and totals renderers do. Without this a field
  // the template marked optional still throws when the document omits it, which
  // is the one thing the marker exists to prevent.
  const lenientCtx = { ...ctx, strict: false };

  const lines: PdfNode[] = [];
  for (const field of block.fields) {
    const value = readField(field, (path, optional) => resolveBinding(path, optional ? lenientCtx : ctx), ctx.label);
    if (value === '') continue;
    lines.push({ text: `${ctx.label(field.label)}: ${value}`, ...(field.style ? { style: field.style } : {}) });
  }
  if (lines.length === 0) return null;

  return {
    stack: [{ text: ctx.label(block.heading ?? 'annotations'), style: block.headingStyle ?? 'h2' }, ...lines],
    margin: [0, 8, 0, 8],
    ...(block.style ? { style: block.style } : {}),
  };
};
