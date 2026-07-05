import type { FooterBlock } from '../dsl.js';
import { resolveText, type BlockRenderer } from '../interpret.js';

/**
 * Document footer: a single centered text node resolved from the block's
 * `label` (i18n) or literal `text`. Rendered inline in the content flow (not via
 * pdfmake's `docDefinition.footer` callback); the block's optional style is
 * applied when present.
 */
export const footerRenderer: BlockRenderer<FooterBlock> = (block, ctx) => {
  return {
    text: resolveText({ label: block.label, text: block.text }, ctx),
    alignment: 'center',
    ...(block.style ? { style: block.style } : {}),
  };
};
