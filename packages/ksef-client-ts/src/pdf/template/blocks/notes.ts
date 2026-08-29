import type { NotesBlock } from '../dsl.js';
import type { BlockRenderer, PdfNode } from '../interpret.js';

/**
 * Caller-supplied sections, printed in order where the template puts this
 * block: each note's `head` as a heading over its `body`. The content is not in
 * the document — it comes from the render options — so this block is the seam
 * between what KSeF holds and what the sender wants to add beside it: terms of
 * delivery, a thank-you, a legal footnote.
 *
 * Both halves are plain text. A note carries no bindings and no markup, so it
 * can neither reach into the invoice nor disturb the layout around it; a `\n`
 * in the body is a line break and that is the whole of it.
 *
 * An entry with nothing in it is skipped, and a block with no notes at all
 * renders nothing rather than an empty gap — so a template can carry the block
 * unconditionally and a render that supplies no notes looks as if it were never
 * there.
 */
export const notesRenderer: BlockRenderer<NotesBlock> = (block, ctx) => {
  const stack: PdfNode[] = [];

  for (const note of ctx.notes ?? []) {
    const head = (note.head ?? '').trim();
    const body = (note.body ?? '').trim();
    if (head === '' && body === '') continue;
    if (head !== '') stack.push({ text: head, style: block.headingStyle ?? 'h2' });
    if (body !== '') stack.push({ text: body });
  }

  if (stack.length === 0) return null;
  return {
    stack,
    margin: [0, 4, 0, 8],
    ...(block.style ? { style: block.style } : {}),
  };
};
