/**
 * Block-renderer registry. Each renderer lives in its own module and is
 * aggregated here; the interpreter merges this over its core primitives
 * (`text`/`stack`/`columns`/`divider`/`spacer`). Renderers are authored against
 * their narrow block type, so the narrowing cast at registration is sound (the
 * interpreter keys them by discriminant).
 */
import type { BlockRegistry, BlockRenderer } from '../interpret.js';
import { headerRenderer } from './header.js';
import { partiesRenderer } from './parties.js';
import { linesRenderer } from './lines.js';
import { totalsRenderer } from './totals.js';
import { paymentRenderer } from './payment.js';
import { annotationsRenderer } from './annotations.js';
import { footerRenderer } from './footer.js';
import { tableRenderer } from './table.js';
import { eachRenderer } from './each.js';
import { imageRenderer } from './image.js';
import { qrRenderer } from './qr.js';

export const blockRegistry: BlockRegistry = {
  header: headerRenderer as BlockRenderer,
  parties: partiesRenderer as BlockRenderer,
  lines: linesRenderer as BlockRenderer,
  totals: totalsRenderer as BlockRenderer,
  payment: paymentRenderer as BlockRenderer,
  annotations: annotationsRenderer as BlockRenderer,
  footer: footerRenderer as BlockRenderer,
  table: tableRenderer as BlockRenderer,
  each: eachRenderer as BlockRenderer,
  image: imageRenderer as BlockRenderer,
  qr: qrRenderer as BlockRenderer,
};
