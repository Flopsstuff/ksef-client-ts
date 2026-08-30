/**
 * QR ("Code I") derivation for the PDF module.
 *
 * The whole point of this module is a byte-exact invoice hash: KSeF registers an
 * invoice under the SHA-256 of the *exact bytes* it received. If we hashed a
 * re-serialized DOM, a stray BOM, a CRLF↔LF swap, a re-encode, or a pretty-print
 * would flip the digest and the QR would point at a hash absent from the
 * registry. So the hash here is always taken over the ORIGINAL INPUT BYTES,
 * never over parsed/reserialized XML.
 */
import { buildInvoiceVerificationUrl } from '../qr/invoice-link.js';
import { bytesToBase64 } from '../utils/base64.js';
import { Environment } from '../config/environments.js';
import { get } from './accessor.js';
import { KSeFPdfError } from './errors.js';

/**
 * SHA-256 over the raw invoice bytes, returned as standard base64.
 *
 * A `Uint8Array` is hashed directly. A `string` is encoded as UTF-8 AS-IS — no
 * BOM strip, no re-encode, no newline normalization. The caller is responsible
 * for handing us the same bytes KSeF received.
 *
 * WebCrypto rather than `node:crypto`, which is what lets this module render in
 * a browser. The digest is asynchronous there, so this is too.
 */
export async function computeInvoiceHashBase64(rawInput: string | Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new KSeFPdfError(
      'Cannot derive the KSeF verification code: WebCrypto (crypto.subtle) is unavailable. ' +
        'A browser exposes it only in a secure context (HTTPS, or localhost). Pass a ' +
        'precomputed `invoiceHash`, or the finished `qrUrl`, to render without deriving it here.',
    );
  }
  // `digest` takes any `Uint8Array`; the cast only sidesteps TypeScript's newer
  // generic view type, which excludes a SharedArrayBuffer-backed one from
  // `BufferSource` even though WebCrypto accepts it.
  const bytes = (
    typeof rawInput === 'string' ? new TextEncoder().encode(rawInput) : rawInput
  ) as BufferSource;
  return bytesToBase64(new Uint8Array(await subtle.digest('SHA-256', bytes)));
}

/**
 * Resolve the base QR URL. An explicit `override` always wins; otherwise the
 * `env` selects the matching KSeF QR host, defaulting to production.
 */
export function resolveBaseQrUrl(
  env: 'prod' | 'test' | 'demo' | undefined,
  override?: string,
): string {
  if (override !== undefined && override !== '') return override;
  switch (env) {
    case 'test':
      return Environment.TEST.qrUrl;
    case 'demo':
      return Environment.DEMO.qrUrl;
    case 'prod':
    default:
      return Environment.PROD.qrUrl;
  }
}

export interface DeriveInvoiceQrUrlParams {
  /** Original invoice bytes (or the exact UTF-8 string) — hashed AS-IS. */
  rawInput: string | Uint8Array;
  /** Parsed document body node (`Faktura`), same shape as `RenderContext.root`. */
  body: unknown;
  env?: 'prod' | 'test' | 'demo';
  baseQrUrl?: string;
  /** Pre-computed hash; when set it is used VERBATIM (no recompute). */
  invoiceHash?: string;
  strict?: boolean;
}

/**
 * Derive the invoice verification URL (Code I) from the raw bytes + parsed body.
 * An `invoiceHash` override is used verbatim; otherwise the hash is computed over
 * the raw input bytes.
 */
export async function deriveInvoiceQrUrl(params: DeriveInvoiceQrUrlParams): Promise<string> {
  const nip = get(params.body, 'Podmiot1.DaneIdentyfikacyjne.NIP', params.strict);
  // Issue date lives at Faktura/Fa/P_1 — the invoice-line group `Fa`, not the
  // document root (where Podmiot1 sits). Reading it at the root yields '' and a
  // NaN-NaN-NaN date segment in the URL.
  // Both segments are policed here rather than left to `strict`: a default
  // render reads them leniently, and an empty one does not fail — it produces a
  // URL with a hole in it (`…/invoice//15-01-2026/…`) that only reveals itself
  // when someone scans the printed code.
  if (nip === '') {
    throw new KSeFPdfError(
      'Cannot build the QR verification URL: seller NIP (Podmiot1/DaneIdentyfikacyjne/NIP) ' +
        'is missing from the invoice.',
    );
  }
  const issueDate = get(params.body, 'Fa.P_1', params.strict);
  if (issueDate === '') {
    throw new KSeFPdfError(
      'Cannot build the QR verification URL: issue date (Fa/P_1) is missing from the invoice.',
    );
  }
  const hash = params.invoiceHash ?? (await computeInvoiceHashBase64(params.rawInput));
  const base = resolveBaseQrUrl(params.env, params.baseQrUrl);
  return buildInvoiceVerificationUrl(base, nip, issueDate, hash);
}
