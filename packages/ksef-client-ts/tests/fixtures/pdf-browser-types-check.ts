/**
 * Type-only fixture for `ksef-client-ts/pdf` as a BROWSER consumer sees it.
 *
 * Compiled by `tsc --project tsconfig.pdf-browser-check.json --noEmit` with
 * `types: []` — no `@types/node` and no `@types/pdfmake` in scope, `DOM` in
 * `lib` instead. The subpath claims to render anywhere; if its published types
 * needed a Node global, that claim would already be false at compile time.
 *
 * This file is NOT executed at runtime.
 */
import {
  renderInvoicePdf,
  renderInvoicePdfFromTemplate,
  renderUpoPdf,
  detectInvoiceVersion,
  normalizeVfs,
  type InvoiceTemplate,
  type RenderOptions,
  type PdfMakeLike,
} from 'ksef-client-ts/pdf';

declare const xml: Uint8Array;
declare const pdfmakeModule: { default: PdfMakeLike };
declare const vfsModule: unknown;

const pdfMake = pdfmakeModule.default;
pdfMake.vfs = normalizeVfs(vfsModule);

const opts: RenderOptions = { locale: 'pl+en', qr: true, pdfMake };

const _a: Promise<Uint8Array> = renderInvoicePdf(xml, 'fa3-default', opts);
const _b: Promise<Uint8Array> = renderUpoPdf(xml, { pdfMake });
void _a; void _b;

const template: InvoiceTemplate = {
  schema: 'FA(3)',
  blocks: [{ type: 'text', path: 'Fa.P_2' }],
};
const _c: Promise<Uint8Array> = renderInvoicePdfFromTemplate(xml, template, { pdfMake });
const _d: 'FA(2)' | 'FA(3)' | null = detectInvoiceVersion('<Faktura/>');
void _c; void _d;
