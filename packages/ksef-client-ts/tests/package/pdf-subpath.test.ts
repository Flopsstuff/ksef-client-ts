/**
 * `/pdf` subpath error identity.
 *
 * The package ships one bundle per entry point, so `./pdf` carries its own copy
 * of the error classes: an error raised by a render is not the root entry's
 * `KSeFValidationError`, and before the brand it was not the root's `KSeFError`
 * either. That silently broke the contract `docs/error-handling.md` states —
 * "a single `instanceof KSeFError` catch covers every library error" — for
 * every consumer of the PDF module.
 *
 * These run against the built package (both conditions of the exports map), so
 * they fail if a bundling change reintroduces the split.
 */
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

import { KSeFError, KSeFValidationError } from 'ksef-client-ts';
import {
  renderInvoicePdfFromTemplate,
  KSeFError as PdfKSeFError,
  KSeFPdfError,
  KSeFValidationError as PdfValidationError,
} from 'ksef-client-ts/pdf';

const require_ = createRequire(import.meta.url);
const cjsRoot = require_('ksef-client-ts') as typeof import('ksef-client-ts');
const cjsPdf = require_('ksef-client-ts/pdf') as typeof import('ksef-client-ts/pdf');

/** Structurally invalid: a `lines` block with no `from`. */
const badTemplate = { schema: 'FA(3)', blocks: [{ type: 'lines', columns: [] }] };
const xml = new TextEncoder().encode('<Faktura/>');

async function renderError(render: typeof renderInvoicePdfFromTemplate): Promise<unknown> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await render(xml, badTemplate as any);
  } catch (e) {
    return e;
  }
  throw new Error('expected the render to reject an invalid template');
}

describe('ksef-client-ts/pdf — error identity across entry points', () => {
  it('throws a render error the root catch-all recognises (ESM)', async () => {
    const error = await renderError(renderInvoicePdfFromTemplate);
    expect(error).toBeInstanceOf(KSeFError);
  });

  it('throws a render error the root catch-all recognises (CJS)', async () => {
    const error = await renderError(cjsPdf.renderInvoicePdfFromTemplate);
    expect(error).toBeInstanceOf(cjsRoot.KSeFError);
  });

  it('exports the exact classes it throws, so the kind can be told apart', async () => {
    const error = await renderError(renderInvoicePdfFromTemplate);
    expect(error).toBeInstanceOf(PdfValidationError);
    expect(error).not.toBeInstanceOf(KSeFPdfError);
    // Separate bundles really are separate classes — the brand is what bridges
    // them, not a shared module instance.
    expect(PdfKSeFError).not.toBe(KSeFError);
  });

  it('keeps subclasses distinct — the base matches across copies, a subclass does not', () => {
    const pdfError = new KSeFPdfError('pdfmake is missing');
    expect(pdfError).toBeInstanceOf(KSeFError);
    expect(pdfError).toBeInstanceOf(PdfKSeFError);
    expect(pdfError).not.toBeInstanceOf(PdfValidationError);
    // The root's own subclass still answers only for its own copy, which is why
    // `/pdf` exports the classes it throws.
    expect(new KSeFValidationError('bad')).toBeInstanceOf(KSeFError);
    expect(pdfError).not.toBeInstanceOf(KSeFValidationError);
  });
});
