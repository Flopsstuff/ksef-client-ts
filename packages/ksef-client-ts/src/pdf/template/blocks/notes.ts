import type { NotesBlock } from '../dsl.js';
import type { BlockRenderer, PdfNode } from '../interpret.js';

/** Sub-headings within a block. Fixed, and the same across every block. */
const SUBHEADING_STYLE = 'h2';

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
 * The section carries its own heading, so the notes read as part of the
 * document rather than as text that fell off the end of it. Each note's title
 * sits a level below that, as sub-headings do in every other block.
 *
 * An entry with nothing in it is skipped, and a block with no notes at all
 * renders nothing rather than an empty gap — heading included — so a template
 * can carry the block unconditionally and a render that supplies no notes looks
 * as if it were never there.
 */
export const notesRenderer: BlockRenderer<NotesBlock> = (block, ctx) => {
  const notes: PdfNode[] = [];

  for (const note of ctx.notes ?? []) {
    const head = (note.head ?? '').trim();
    const body = (note.body ?? '').trim();
    if (head === '' && body === '') continue;
    // A note's own title is a heading inside the section, one level below the
    // section's — the same relation `Adres` has to `Sprzedawca`.
    if (head !== '') notes.push({ text: head, style: SUBHEADING_STYLE });
    if (body !== '') notes.push({ text: body });
  }

  if (notes.length === 0) return null;
  const stack: PdfNode[] = [
    { text: ctx.label('notes'), style: block.headingStyle ?? SUBHEADING_STYLE },
    ...notes,
  ];
  return {
    stack,
    margin: [0, 4, 0, 8],
    ...(block.style ? { style: block.style } : {}),
  };
};
