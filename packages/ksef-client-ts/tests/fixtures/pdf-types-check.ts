/**
 * Type-only fixture for the `ksef-client-ts/pdf` subpath.
 *
 * Compiled by `tsc --project tsconfig.pdf-check.json --noEmit` with `types`
 * restricted to `node` (NO `@types/pdfmake` in scope). It proves that the
 * public `./pdf` types resolve for a consumer who has NOT installed pdfmake —
 * the optional peer must never leak into the published type surface.
 *
 * This file is NOT executed at runtime.
 */
import {
  renderInvoicePdf,
  renderInvoicePdfFromFile,
  renderInvoicePdfFromTemplate,
  renderUpoPdf,
  detectInvoiceVersion,
  detectUpoVersion,
  type Locale,
  type InvoiceTemplate,
  type RenderOptions,
} from 'ksef-client-ts/pdf';

const xml = '<Faktura/>';
const opts: RenderOptions = { locale: 'pl+en', qr: true, strict: false };

const _a: Promise<Uint8Array> = renderInvoicePdf(xml, 'fa3-default', opts);
const _b: Promise<Uint8Array> = renderInvoicePdfFromFile(xml, './tpl.json', opts);
void _a; void _b;

const template: InvoiceTemplate = {
  schema: 'FA(3)',
  blocks: [{ type: 'text', path: 'Fa.P_2' }],
};
const _c: Promise<Uint8Array> = renderInvoicePdfFromTemplate(new Uint8Array(), template);
const _d: Promise<Uint8Array> = renderUpoPdf(xml);
void _c; void _d;

const _loc: Locale = 'en';
const _iv: 'FA(2)' | 'FA(3)' | null = detectInvoiceVersion(xml);
const _uv: 'UPO(4.2)' | 'UPO(4.3)' | null = detectUpoVersion(xml);
void _loc; void _iv; void _uv;
