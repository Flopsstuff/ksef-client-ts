import type { ImageBlock } from '../dsl.js';
import { resolveBinding, type BlockRenderer } from '../interpret.js';

/**
 * Renders an image. The source is either a literal `data:` URI (`src`) or a
 * binding (`path`) resolved against the document root — `src` wins when both are
 * present. An empty/absent source yields an empty text node rather than throwing,
 * so an optional logo simply disappears. Never touches the filesystem.
 */
export const imageRenderer: BlockRenderer<ImageBlock> = (block, ctx) => {
  const src = block.src ?? (block.path !== undefined ? resolveBinding(block.path, ctx) : '');
  if (!src) return { text: '' };
  return { image: src, width: block.width ?? 120 };
};
