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
  renderInvoicePdfFromTemplate,
  renderUpoPdf,
  detectInvoiceVersion,
  detectUpoVersion,
  normalizeVfs,
  type Locale,
  type InvoiceTemplate,
  type RenderOptions,
  type PdfMakeLike,
} from 'ksef-client-ts/pdf';

const xml = '<Faktura/>';
const opts: RenderOptions = { locale: 'pl+en', qr: true, strict: false };

const _a: Promise<Uint8Array> = renderInvoicePdf(xml, 'fa3-default', opts);
void _a;

const template: InvoiceTemplate = {
  schema: 'FA(3)',
  blocks: [{ type: 'text', path: 'Fa.P_2' }],
};
const _c: Promise<Uint8Array> = renderInvoicePdfFromTemplate(new Uint8Array(), template);
const _d: Promise<Uint8Array> = renderUpoPdf(xml);
void _c; void _d;

// The injection seam: a caller-built pdfmake instance is describable without
// `@types/pdfmake`, and `normalizeVfs` shapes the font module for it.
declare const someVfsModule: unknown;
const injected: PdfMakeLike = {
  createPdf: () => ({ getStream: () => ({ on: () => {}, end: () => {} }) }),
  vfs: normalizeVfs(someVfsModule),
};
const _e: Promise<Uint8Array> = renderInvoicePdf(xml, 'fa3-default', { pdfMake: injected });
void _e;

const _loc: Locale = 'en';
const _iv: 'FA(2)' | 'FA(3)' | null = detectInvoiceVersion(xml);
const _uv: 'UPO(4.2)' | 'UPO(4.3)' | null = detectUpoVersion(xml);
void _loc; void _iv; void _uv;

/**
 * A payment row is either read from the document or computed from it, never
 * both — the renderer settles a computed figure first, so a row carrying both
 * would print the computed number under a label written for the reading. The
 * validator refuses that in a parsed template; these assertions pin that a
 * hand-built one is refused at compile time, through the published types.
 *
 * Each bad row is written on one line so `@ts-expect-error` covers wherever the
 * compiler anchors the error inside it.
 */
type PaymentRows = Extract<InvoiceTemplate['blocks'][number], { type: 'payment' }>['rows'];

const paid = { from: 'Fa.Platnosc.ZaplataCzesciowa', path: 'KwotaZaplatyCzesciowej' };

const _validRows: PaymentRows = [
  { label: 'paid' },
  { label: 'dueDate', path: 'Fa.Platnosc.TerminPlatnosci.Termin', from: 'Fa.Platnosc.TerminPlatnosci' },
  { label: 'toPay', path: 'Fa.P_15', less: paid },
  { label: 'paidTotal', sumFrom: paid },
];
// @ts-expect-error — a computed row states its own figure, so it takes no `path`
const _sumFromWithPath: PaymentRows = [{ label: 'paidTotal', sumFrom: paid, path: 'Fa.P_15' }];
// @ts-expect-error — ...nor a `from` to repeat itself over
const _sumFromWithFrom: PaymentRows = [{ label: 'paidTotal', sumFrom: paid, from: 'Fa.Platnosc.ZaplataCzesciowa' }];
// @ts-expect-error — ...nor a `less` to subtract from a value it never read
const _sumFromWithLess: PaymentRows = [{ label: 'paidTotal', sumFrom: paid, less: paid }];
void _validRows; void _sumFromWithPath; void _sumFromWithFrom; void _sumFromWithLess;
