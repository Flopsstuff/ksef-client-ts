import { describe, it, expect, vi } from 'vitest';
import { assertPdfmakeVersion, loadPdfMake } from '../../../src/pdf/fonts.js';
import { KSeFPdfError } from '../../../src/pdf/errors.js';

// Simulate "pdfmake not installed": the dynamic import inside loadPdfMake fails.
// The version reader (createRequire on the real package.json) is unaffected, so
// this exercises the import-catch → friendly-error branch specifically.
vi.mock('pdfmake/build/pdfmake.js', () => {
  throw new Error('mock: module not found');
});

describe('assertPdfmakeVersion', () => {
  it('throws a friendly install error when pdfmake is absent (null version)', () => {
    expect(() => assertPdfmakeVersion(null)).toThrow(KSeFPdfError);
    expect(() => assertPdfmakeVersion(null)).toThrow(/npm i "pdfmake\^?0?\.?2?\.?20?"|pdfmake@\^0\.2\.20/);
  });

  it('rejects an incompatible 0.3.x version with a clear message', () => {
    expect(() => assertPdfmakeVersion('0.3.11')).toThrow(/0\.3\.x is not supported|found 0\.3\.11/);
  });

  it('rejects a too-old 0.2.x version', () => {
    expect(() => assertPdfmakeVersion('0.2.19')).toThrow(KSeFPdfError);
  });

  it('accepts a supported version', () => {
    expect(() => assertPdfmakeVersion('0.2.20')).not.toThrow();
    expect(() => assertPdfmakeVersion('0.2.99')).not.toThrow();
  });
});

describe('loadPdfMake — friendly error when pdfmake import fails', () => {
  it('throws KSeFPdfError with an install hint instead of a raw resolver crash', async () => {
    await expect(loadPdfMake()).rejects.toBeInstanceOf(KSeFPdfError);
    await expect(loadPdfMake()).rejects.toThrow(/pdfmake/);
  });

  /**
   * The import is poisoned for this whole module, so a resolved call is proof
   * the loader never reached for it: an injected instance short-circuits the
   * import and the version probe alike.
   */
  it('returns an injected instance without importing or probing pdfmake', async () => {
    const injected = { createPdf: () => ({ getStream: () => ({ on: () => {}, end: () => {} }) }) };
    await expect(loadPdfMake(injected as never)).resolves.toBe(injected);
  });

  /**
   * Off Node there is nothing to read a version with. That used to be fatal —
   * `null` was read as "pdfmake is not installed" and the render refused to
   * start with pdfmake sitting in the bundle. Now the import decides, so the
   * failure a browser sees is the same honest install error.
   */
  it('skips the version probe off Node, letting the import decide', async () => {
    vi.stubGlobal('process', undefined);
    try {
      await expect(loadPdfMake()).rejects.toThrow(/pdfmake/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
