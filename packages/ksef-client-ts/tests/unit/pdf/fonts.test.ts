import { describe, it, expect } from 'vitest';
import { satisfiesRequiredRange, normalizeVfs, createPdfBuffer } from '../../../src/pdf/fonts.js';
import type { PdfMakeLike, PdfDocStream } from '../../../src/pdf/fonts.js';
import { KSeFPdfError } from '../../../src/pdf/errors.js';

describe('satisfiesRequiredRange', () => {
  it('accepts the exact lower bound 0.2.20', () => {
    expect(satisfiesRequiredRange('0.2.20')).toBe(true);
  });

  it('accepts a higher patch within 0.2.x', () => {
    expect(satisfiesRequiredRange('0.2.99')).toBe(true);
  });

  it('rejects a patch below 20', () => {
    expect(satisfiesRequiredRange('0.2.19')).toBe(false);
  });

  it('rejects the 0.3.0 minor bump', () => {
    expect(satisfiesRequiredRange('0.3.0')).toBe(false);
  });

  it('rejects any 0.3.x', () => {
    expect(satisfiesRequiredRange('0.3.11')).toBe(false);
  });

  it('rejects an older minor', () => {
    expect(satisfiesRequiredRange('0.1.5')).toBe(false);
  });

  it('rejects a major bump', () => {
    expect(satisfiesRequiredRange('1.0.0')).toBe(false);
  });

  it('rejects a non-semver string', () => {
    expect(satisfiesRequiredRange('abc')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(satisfiesRequiredRange('')).toBe(false);
  });

  // `^0.2.20` excludes prereleases: a SemVer range only admits them when the
  // comparator carries a prerelease of its own. A build that calls itself
  // 0.2.20-beta.1 is not a version this renderer has been tried against.
  it('rejects a prerelease of an otherwise supported version', () => {
    expect(satisfiesRequiredRange('0.2.20-beta.1')).toBe(false);
    expect(satisfiesRequiredRange('0.2.21-rc.0')).toBe(false);
    expect(satisfiesRequiredRange('0.3.0-alpha')).toBe(false);
  });

  it('accepts build metadata, which the range does admit', () => {
    expect(satisfiesRequiredRange('0.2.20+build.5')).toBe(true);
    expect(satisfiesRequiredRange('0.2.99+20260830')).toBe(true);
  });

  it('rejects a version with trailing junk', () => {
    expect(satisfiesRequiredRange('0.2.20foo')).toBe(false);
    expect(satisfiesRequiredRange('0.2.20.1')).toBe(false);
    expect(satisfiesRequiredRange('v0.2.20')).toBe(false);
  });
});

describe('normalizeVfs', () => {
  // A font map never carries `vfs`/`default`/`pdfMake` keys of its own.
  const fontMap = { 'Roboto-Regular.ttf': 'AAAA', 'Roboto-Bold.ttf': 'BBBB' };

  it('unwraps { default: <map> } (ESM default export that is the map itself)', () => {
    expect(normalizeVfs({ default: fontMap })).toBe(fontMap);
  });

  it('unwraps { default: { vfs: <map> } }', () => {
    expect(normalizeVfs({ default: { vfs: fontMap } })).toBe(fontMap);
  });

  it('unwraps { vfs: <map> }', () => {
    expect(normalizeVfs({ vfs: fontMap })).toBe(fontMap);
  });

  it('unwraps { pdfMake: { vfs: <map> } }', () => {
    expect(normalizeVfs({ pdfMake: { vfs: fontMap } })).toBe(fontMap);
  });

  it('returns a bare map unchanged', () => {
    expect(normalizeVfs(fontMap)).toBe(fontMap);
  });
});

describe('createPdfBuffer', () => {
  /**
   * A stand-in for pdfmake's document stream. `emit` decides what the stream
   * does once `end()` is called, which is where pdfmake reports a failure
   * raised during asynchronous document assembly.
   */
  function fakePdfMake(emit: (h: Record<string, (arg?: never) => void>) => void): PdfMakeLike {
    return {
      createPdf(): { getStream(): PdfDocStream } {
        const handlers: Record<string, (arg?: never) => void> = {};
        const stream = {
          on(event: string, cb: (arg?: never) => void) {
            handlers[event] = cb;
          },
          end() {
            emit(handlers);
          },
        };
        return { getStream: () => stream as unknown as PdfDocStream };
      },
    };
  }

  it('concatenates the streamed chunks in order', async () => {
    const pdfMake = fakePdfMake((h) => {
      (h.data as unknown as (c: Uint8Array) => void)(Uint8Array.from([1, 2]));
      (h.data as unknown as (c: Uint8Array) => void)(Uint8Array.from([3]));
      h.end?.();
    });
    await expect(createPdfBuffer(pdfMake, {})).resolves.toEqual(Uint8Array.from([1, 2, 3]));
  });

  // pdfmake raises image and font failures long after createPdf() returned, so
  // a `try` around the call cannot see them. Left unhandled they take the
  // process down instead of rejecting the caller's promise.
  it('rejects when the stream reports an asynchronous failure', async () => {
    const pdfMake = fakePdfMake((h) => {
      (h.error as unknown as (e: unknown) => void)('Invalid image: Unknown image format.');
    });
    await expect(createPdfBuffer(pdfMake, {})).rejects.toBeInstanceOf(KSeFPdfError);
    await expect(createPdfBuffer(pdfMake, {})).rejects.toThrow(/Unknown image format/);
  });

  it('preserves an Error the stream reports as-is', async () => {
    const boom = new TypeError('bad font');
    const pdfMake = fakePdfMake((h) => {
      (h.error as unknown as (e: unknown) => void)(boom);
    });
    await expect(createPdfBuffer(pdfMake, {})).rejects.toBe(boom);
  });

  it('rejects when getStream itself throws', async () => {
    const pdfMake = {
      createPdf(): { getStream(): PdfDocStream } {
        throw new Error('no document');
      },
    };
    await expect(createPdfBuffer(pdfMake, {})).rejects.toThrow('no document');
  });
});
