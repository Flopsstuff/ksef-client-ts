import * as QRCode from 'qrcode';
import { KSeFPdfError } from '../../errors.js';
import type { QrBlock } from '../dsl.js';
import type { BlockRenderer, PdfNode } from '../interpret.js';

/**
 * Error-correction level for every code we draw. The QR default of `'L'` (7%
 * recovery) is thin for a document that gets printed, folded and scanned off
 * paper by a phone camera, so we take `'M'` (15%) — the level KSeF's own
 * reference clients use. It costs a few modules: Code I grows from 37 to 41.
 */
const ECC_LEVEL = 'M';

/** Blank border the QR spec requires around a code, in modules. */
const QUIET_ZONE = 4;

/**
 * Hard floor for a module's printed size, in points. This is not a quality
 * threshold — 1pt is 0.35 mm, already marginal — it is the line below which the
 * code is decoration rather than data, and a caller who crosses it has almost
 * certainly mis-sized the block rather than chosen this.
 */
const MIN_MODULE_PT = 1;

/** Binding name carrying each code's URL, injected by the orchestrator. */
const URL_BINDING: Record<NonNullable<QrBlock['code']>, string> = {
  invoice: 'qrUrl',
  certificate: 'certificateQrUrl',
};

/**
 * A QR as an SVG path, one unit per module, with the quiet zone folded into the
 * viewBox so the whole thing scales as a unit.
 *
 * We encode the code ourselves rather than handing the URL to pdfmake's `qr`
 * node, because that node sizes a code at `floor(fit / modules)` points per
 * module: module sizes are whole points and nothing else, so a code can only
 * exist at a handful of sizes and `fit` is a ceiling rather than a measurement.
 * Two codes of different data lengths then cannot be made the same size at all.
 * Drawing the modules ourselves makes the size exact and continuous, and gets
 * the quiet zone — which that node omits — for free.
 */
function buildQrSvg(url: string): { svg: string; span: number } {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: ECC_LEVEL });
  const n = modules.size;
  const span = n + QUIET_ZONE * 2;

  let path = '';
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (modules.data[y * n + x]) path += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges">` +
    `<path fill="#ffffff" d="M0 0h${span}v${span}H0z"/>` +
    `<path fill="#000000" d="${path}"/>` +
    `</svg>`;
  return { svg, span };
}

/**
 * Renders one KSeF verification QR — Code I (the invoice) or Code II (the
 * issuer's offline certificate), selected by {@link QrBlock.code}. The URL is
 * built by the orchestrator and injected as a binding; an empty binding renders
 * nothing at all, which is what keeps a template that asks for Code II harmless
 * on an online invoice. Dropping the node rather than emitting an empty one
 * matters inside a `columns` row: an empty text node would claim an elastic
 * column and shove the remaining code away from the margin.
 * `when` is handled centrally by the interpreter.
 *
 * `fit` is the printed side in points, quiet zone included, and it is exact:
 * two blocks given the same `fit` come out the same size however much data each
 * code carries. What varies instead is the module size, which is what a scanner
 * actually cares about — see {@link MIN_MODULE_PT}.
 *
 * With `qrLinks` set, the same URL is repeated under the code as a clickable
 * link, so a reader on screen does not have to photograph their own monitor.
 */
export const qrRenderer: BlockRenderer<QrBlock> = (block, ctx) => {
  const url = ctx.bindings[URL_BINDING[block.code ?? 'invoice']] ?? '';
  if (!url) return null;

  const side = block.fit ?? 100;
  const { svg, span } = buildQrSvg(url);
  if (side / span < MIN_MODULE_PT) {
    throw new KSeFPdfError(
      `QR too small to be readable: fit ${side}pt over ${span} modules leaves ` +
        `${(side / span).toFixed(2)}pt per module. This code needs fit ${Math.ceil(span * MIN_MODULE_PT)} or more.`,
    );
  }

  const code: PdfNode = { svg, width: side, height: side };
  // The code's visible edge is inset by the quiet zone, so a link flush with the
  // box would sit to the left of everything above it. Indent it to line up with
  // the first module — a different amount per code, since a denser code has
  // narrower modules and therefore a narrower quiet zone.
  const inset = (side / span) * QUIET_ZONE;
  const link: PdfNode[] = ctx.flags['qrLinks']
    ? [
        {
          text: ctx.label('openLink'),
          link: url,
          margin: [inset, 0, 0, 0],
          ...(block.linkStyle ? { style: block.linkStyle } : {}),
        },
      ]
    : [];

  // Wrapped rather than returned bare, and always `width: 'auto'`: inside a
  // `columns` row pdfmake would otherwise treat the SVG's own `width` as the
  // column width and stretch the code across its share of the page. Hugging the
  // content is also what lets a row put a heading in an elastic column beside
  // the codes and have them sit against the right margin.
  return { width: 'auto', stack: [code, ...link] };
};
