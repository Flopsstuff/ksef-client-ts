/**
 * `ksef-client-ts/pdf` — node-only subpath that renders KSeF invoice/UPO XML to
 * PDF via a template-driven block DSL. `pdfmake` is an optional peer loaded
 * lazily; importing this module without it must not throw — only a `render*`
 * call surfaces a friendly install error.
 *
 * This is the public surface: its types operate on our own DSL types and
 * `Uint8Array`, never on `@types/pdfmake`, so consumers without pdfmake still
 * type-check `./pdf`.
 */
import { readFile } from 'node:fs/promises';
import {
  detectInvoiceVersion,
  detectUpoVersion,
  parseXmlForPdf,
  type InvoiceVersion,
  type UpoVersion,
} from './parse.js';
import { KSeFPdfError } from './errors.js';
import { makeLabelResolver } from './i18n/index.js';
import type { Locale } from './i18n/types.js';
import { validateTemplate, type InvoiceTemplate, type TemplateSchemaId } from './template/dsl.js';
import { interpretTemplate, type RenderContext, type RenderNote } from './template/interpret.js';
import { blockRegistry } from './template/blocks/index.js';
import { getBuiltinTemplate as loadBuiltinTemplate, builtinTemplateNames } from './template/builtin/index.js';
import { loadPdfMake, createPdfBuffer } from './fonts.js';
import { deriveInvoiceQrUrl } from './qr.js';
import { documentFlags } from './document-flags.js';

export type { Locale } from './i18n/types.js';
export type { InvoiceTemplate } from './template/dsl.js';
export type { RenderNote } from './template/interpret.js';
export { detectInvoiceVersion, detectUpoVersion } from './parse.js';
export { builtinTemplateNames } from './template/builtin/index.js';

/**
 * A built-in template as a plain object, for callers who want to start from one
 * and adapt it rather than write a layout from nothing — a different palette,
 * a company's own wording — then render it with
 * {@link renderInvoicePdfFromTemplate}.
 *
 * The result is a **copy**. The built-ins are validated once at import and held
 * for the life of the process, so handing out the stored object would let one
 * caller's edit silently repaint every later render by that name. Editing what
 * comes back here affects nothing else.
 *
 * `undefined` for a name that is not built in; {@link builtinTemplateNames}
 * lists the ones that are.
 */
export function getBuiltinTemplate(name: string): InvoiceTemplate | undefined {
  const template = loadBuiltinTemplate(name);
  return template && structuredClone(template);
}

/**
 * Which parts of the totals block a reader gets. `Do zapłaty` is always shown —
 * it is `P_15`, a real field. What varies is the tax breakdown above it:
 *
 * - `'none'` — nothing but the amount due.
 * - `'buckets'` — one row per rate bucket the invoice actually carries, each a
 *   direct reading of a `P_13_*`/`P_14_*` field. Nothing is computed.
 * - `'summary'` — net and VAT totals, added up from every bucket. Convenient,
 *   but these two figures exist nowhere in the document: the renderer computes
 *   them.
 * - `'both'` — the breakdown followed by the computed totals.
 */
export type TotalsMode = 'none' | 'buckets' | 'summary' | 'both';

export interface RenderOptions {
  /** Label language. Default `'pl'`. */
  locale?: Locale;
  /** Which totals to print above the amount due. Default `'buckets'`. */
  totals?: TotalsMode;
  /** KSeF number printed on the visualization; absent → marked OFFLINE. */
  ksefNumber?: string;
  /** Embed the KSeF Code I QR derived from the invoice XML. */
  qr?: boolean;
  /**
   * Code I URL, used verbatim instead of being derived from the document.
   * Supplying it is intent enough — `qr` need not also be set.
   */
  qrUrl?: string;
  /**
   * Code II URL — the issuer's offline-certificate verification link, which
   * only an invoice issued offline carries. It cannot be derived here: the link
   * is signed with the private key of a KSeF offline certificate, and a PDF
   * renderer has no business holding one. Build it with
   * `VerificationLinkService.buildCertificateVerificationUrl` (or `ksef qr
   * certificate`) and pass the result.
   */
  certificateQrUrl?: string;
  /**
   * Print the URL under each QR as a clickable link, for readers who have the
   * PDF on screen rather than on paper.
   */
  qrLinks?: boolean;
  /** Environment used to derive the QR base URL. Default `'prod'`. */
  env?: 'prod' | 'test' | 'demo';
  /** Override the QR base URL (offline / non-standard). */
  baseQrUrl?: string;
  /** Logo as a `data:` URI. PNG or JPEG — pdfmake draws no other format. */
  logo?: string;
  /**
   * Theming (accent colour only; the font is the bundled Roboto). The accent
   * repaints the document title and both heading levels; anything finer is a
   * custom template's `styles`.
   */
  theme?: { accent?: string };
  /** Separator for the bilingual locales (`pl+en`, `pl+uk`, …). Default `' / '`. */
  bilingualSeparator?: string;
  /** Throw on a missing binding instead of rendering an empty string. */
  strict?: boolean;
  /** Precomputed canonical invoice hash (base64) — used verbatim for the QR. */
  invoiceHash?: string;
  /**
   * Extra sections to print where the template puts its `notes` block — in the
   * built-in templates, between the payment details and the verification codes.
   * Each is a heading over a body, both plain text, and they appear in the order
   * given. Nothing here comes from the invoice: this is what the sender wants to
   * say alongside it.
   */
  notes?: RenderNote[];
}

type RawXml = string | Uint8Array;

function toXmlString(input: RawXml): string {
  return typeof input === 'string' ? input : new TextDecoder('utf-8').decode(input);
}

/**
 * Bindings are written relative to the document body (`Fa.P_2`, `Podmiot1.…`,
 * or UPO `Dokument.…`), so the context root is the body element, not the parsed
 * document wrapper.
 */
function extractBody(parsed: Record<string, unknown>, schema: TemplateSchemaId): unknown {
  const key = schema.startsWith('UPO') ? 'Potwierdzenie' : 'Faktura';
  const body = parsed[key];
  return body && typeof body === 'object' ? body : parsed;
}

function buildContext(
  root: unknown,
  template: InvoiceTemplate,
  opts: RenderOptions,
  qrUrls: { invoice: string; certificate: string },
): RenderContext {
  const label = makeLabelResolver(opts.locale ?? 'pl', {
    bilingualSeparator: opts.bilingualSeparator,
    overrides: template.labels,
  });

  const bindings: Record<string, string> = {
    'opts.logo': opts.logo ?? '',
    'opts.ksefNumber': opts.ksefNumber ?? '',
    'opts.accent': opts.theme?.accent ?? '',
    qrUrl: qrUrls.invoice,
    certificateQrUrl: qrUrls.certificate,
  };

  const notes = (opts.notes ?? []).filter((n) => (n?.head ?? '').trim() !== '' || (n?.body ?? '').trim() !== '');

  const totals = opts.totals ?? 'buckets';
  const flags: Record<string, boolean> = {
    ...documentFlags(root),
    hasKsefNumber: Boolean(opts.ksefNumber),
    offline: !opts.ksefNumber,
    // Either code is enough to keep the QR area on the page: an offline invoice
    // may be waiting for its number and still carry Code II.
    qr: qrUrls.invoice !== '' || qrUrls.certificate !== '',
    qrLinks: Boolean(opts.qrLinks),
    totalsBuckets: totals === 'buckets' || totals === 'both',
    totalsSummary: totals === 'summary' || totals === 'both',
    // So a template can gate other things on notes being present — a divider
    // around them, say — without the block itself needing a condition.
    notes: notes.length > 0,
  };

  return { root, strict: opts.strict ?? false, label, bindings, flags, notes };
}

/**
 * A template renders one document kind, so the input must be recognized *as*
 * that kind. `null` is a rejection, not a pass: the detectors read the root
 * element plus a version marker that KSeF's schemas make mandatory, so a `null`
 * means the input is not the FA/UPO version this template targets — a UPO fed
 * to an invoice template, an FA(1), or arbitrary XML. Letting it through would
 * bind every path against the wrong root and yield a plausible but blank PDF.
 */
function assertVersionMatch(xml: string, schema: TemplateSchemaId): void {
  const detected: InvoiceVersion | UpoVersion | null = schema.startsWith('UPO')
    ? detectUpoVersion(xml)
    : detectInvoiceVersion(xml);
  if (detected === schema) return;
  if (detected === null) {
    throw new KSeFPdfError(
      `Template targets ${schema}, but the document was not recognized as a ${schema} document. ` +
        `Check that the input is the right kind of XML and carries its version marker.`,
    );
  }
  throw new KSeFPdfError(
    `Template targets ${schema}, but the document was detected as ${detected}. ` +
      `Use a ${detected} template (or the matching built-in).`,
  );
}

/**
 * The style names an accent colour repaints: the document title and both
 * heading levels. Blocks fall back to exactly these names when a template names
 * no style of its own, so an accent reaches a template that defines none.
 */
const ACCENTED_STYLES = ['title', 'h1', 'h2'] as const;

/**
 * Repaint the template's title and headings in the caller's accent colour.
 *
 * The colour has to reach the document as a *style*, not as a binding: bindings
 * resolve to text, and a style is the only thing pdfmake reads a colour from.
 * Returns the template untouched when no accent is set, so a render without one
 * is byte-for-byte what it was.
 */
function applyAccent(template: InvoiceTemplate, accent: string | undefined): InvoiceTemplate {
  if (accent === undefined || accent.trim() === '') return template;
  const styles = { ...(template.styles ?? {}) };
  for (const name of ACCENTED_STYLES) {
    styles[name] = { ...(styles[name] ?? {}), color: accent };
  }
  return { ...template, styles };
}

async function renderWithTemplate(
  rawInput: RawXml,
  template: InvoiceTemplate,
  opts: RenderOptions,
): Promise<Uint8Array> {
  const xml = toXmlString(rawInput);
  assertVersionMatch(xml, template.schema);
  const parsed = parseXmlForPdf(xml);
  const body = extractBody(parsed, template.schema);

  // QR (Code I) is derived only for invoices, and only when the caller did not
  // hand us the URL — the hash is computed over the ORIGINAL input bytes
  // (bypassing the parser) so it matches the KSeF registry. Code II is never
  // derived: it carries a signature made with the issuer's private key.
  let qrUrl = opts.qrUrl ?? '';
  if (!qrUrl && opts.qr && !template.schema.startsWith('UPO')) {
    qrUrl = deriveInvoiceQrUrl({
      rawInput,
      body,
      env: opts.env,
      baseQrUrl: opts.baseQrUrl,
      invoiceHash: opts.invoiceHash,
      strict: opts.strict,
    });
  }

  const ctx = buildContext(body, template, opts, {
    invoice: qrUrl,
    certificate: opts.certificateQrUrl ?? '',
  });
  const doc = interpretTemplate(applyAccent(template, opts.theme?.accent), ctx, blockRegistry);
  const pdfMake = await loadPdfMake();
  return createPdfBuffer(pdfMake, doc);
}

/** Render an invoice using a built-in template selected by name. */
export async function renderInvoicePdf(
  xml: RawXml,
  name: string,
  opts: RenderOptions = {},
): Promise<Uint8Array> {
  const template = loadBuiltinTemplate(name);
  if (!template) {
    throw new KSeFPdfError(
      `Unknown built-in template "${name}". Available: ${builtinTemplateNames().join(', ')}`,
    );
  }
  return renderWithTemplate(xml, template, opts);
}

/** Render an invoice using a custom template loaded from a JSON file. */
export async function renderInvoicePdfFromFile(
  xml: RawXml,
  path: string,
  opts: RenderOptions = {},
): Promise<Uint8Array> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf-8'));
  } catch (err) {
    throw new KSeFPdfError(`Failed to read template file "${path}": ${(err as Error).message}`);
  }
  const template = validateTemplate(parsed);
  return renderWithTemplate(xml, template, opts);
}

/** Render an invoice using a custom template object. */
export async function renderInvoicePdfFromTemplate(
  xml: RawXml,
  template: InvoiceTemplate,
  opts: RenderOptions = {},
): Promise<Uint8Array> {
  const validated = validateTemplate(template);
  return renderWithTemplate(xml, validated, opts);
}

const UPO_TEMPLATE_BY_VERSION: Record<UpoVersion, string> = {
  'UPO(4.2)': 'upo-4_2',
  'UPO(4.3)': 'upo-4_3',
};

/** Render a UPO receipt using the matching built-in UPO template. */
export async function renderUpoPdf(xml: RawXml, opts: RenderOptions = {}): Promise<Uint8Array> {
  const version = detectUpoVersion(toXmlString(xml));
  if (!version) {
    throw new KSeFPdfError('Input is not a recognized UPO(4.2)/UPO(4.3) document.');
  }
  return renderInvoicePdf(xml, UPO_TEMPLATE_BY_VERSION[version], opts);
}
