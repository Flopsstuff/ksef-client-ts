import type { QrBlock } from '../dsl.js';
import type { BlockRenderer } from '../interpret.js';

/**
 * Renders the invoice verification QR ("Code I"). The URL is derived by the
 * orchestrator and injected as the `qrUrl` binding — an empty binding (no
 * derivable hash/NIP/date) collapses to an empty text node rather than emitting
 * a broken code. `when` is handled centrally by the interpreter.
 */
export const qrRenderer: BlockRenderer<QrBlock> = (block, ctx) => {
  const url = ctx.bindings['qrUrl'] ?? '';
  if (!url) return { text: '' };
  return { qr: url, fit: block.fit ?? 100 };
};
