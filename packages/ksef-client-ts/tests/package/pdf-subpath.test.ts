/**
 * /pdf subpath resolution and error identity.
 *
 * Verifies that:
 *  1. The public render surface exports from `ksef-client-ts/pdf` (ESM + CJS).
 *  2. The pdfmake injection seam ships alongside it — an application cannot
 *     supply its own engine without `normalizeVfs`.
 *  3. Nothing that reads the filesystem is exported: the subpath is isomorphic,
 *     so loading a template off disk belongs to the caller, not to the renderer.
 *  4. An error a render throws is still caught by one `instanceof KSeFError`
 *     written against the package root. Each entry point is bundled on its own
 *     and so carries its own copy of the error classes; without a brand that
 *     survives the split, the contract `docs/error-handling.md` states — "a
 *     single `instanceof KSeFError` catch covers every library error" — would
 *     be false for every consumer of this module.
 *
 * These run against the built package, both conditions of the exports map, so
 * they fail if a bundling change reintroduces either split.
 */
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

// ESM import of the /pdf subpath (exercises the "import" condition in exports map)
import * as esmPdf from 'ksef-client-ts/pdf';
import {
  renderInvoicePdfFromTemplate,
  KSeFError as PdfKSeFError,
  KSeFPdfError,
  KSeFValidationError as PdfValidationError,
} from 'ksef-client-ts/pdf';
import { KSeFError, KSeFValidationError } from 'ksef-client-ts';

// CJS require of the /pdf subpath (exercises the "require" condition in exports map)
const nodeRequire = createRequire(import.meta.url);
const cjsPdf = nodeRequire('ksef-client-ts/pdf') as Record<string, unknown> &
  typeof import('ksef-client-ts/pdf');
const cjsRoot = nodeRequire('ksef-client-ts') as typeof import('ksef-client-ts');

const PUBLIC_SYMBOLS = [
  'renderInvoicePdf',
  'renderInvoicePdfFromTemplate',
  'renderUpoPdf',
  'detectInvoiceVersion',
  'detectUpoVersion',
  'builtinTemplateNames',
  'getBuiltinTemplate',
  'normalizeVfs',
] as const;

describe('ksef-client-ts/pdf subpath — ESM resolution', () => {
  for (const symbol of PUBLIC_SYMBOLS) {
    it(`exports ${symbol}`, () => {
      expect((esmPdf as Record<string, unknown>)[symbol]).toBeDefined();
    });
  }
});

describe('ksef-client-ts/pdf subpath — CJS resolution', () => {
  for (const symbol of PUBLIC_SYMBOLS) {
    it(`exports ${symbol}`, () => {
      expect(cjsPdf[symbol]).toBeDefined();
    });
  }
});

describe('ksef-client-ts/pdf subpath — nothing filesystem-backed', () => {
  it('does not export a template-from-disk renderer in either format', () => {
    expect((esmPdf as Record<string, unknown>).renderInvoicePdfFromFile).toBeUndefined();
    expect(cjsPdf.renderInvoicePdfFromFile).toBeUndefined();
  });

  it('imports without touching pdfmake, so the subpath stays cold', () => {
    expect(nodeRequire.cache[nodeRequire.resolve('pdfmake/build/pdfmake.js')]).toBeUndefined();
  });
});

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
