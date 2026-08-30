import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { renderInvoicePdf, normalizeVfs, type PdfMakeLike } from '../../../src/pdf/index.js';

const fa3 = readFileSync(new URL('../../fixtures/pdf/fa3.xml', import.meta.url), 'utf8');

/**
 * The seam an application uses in a browser: it loads pdfmake itself, assigns
 * the VFS it wants, and hands the instance over. The renderer must then take it
 * as given — no import of its own, no version probe — which is the whole point,
 * since neither is possible off Node.
 *
 * A stand-in instance stands in for pdfmake here, exactly as in `fonts.test.ts`:
 * a handler dictionary for a stream, no `node:stream` in sight.
 */
function recordingPdfMake(): { pdfMake: PdfMakeLike; docs: Record<string, unknown>[] } {
  const docs: Record<string, unknown>[] = [];
  const pdfMake: PdfMakeLike = {
    createPdf(docDefinition: unknown) {
      docs.push(docDefinition as Record<string, unknown>);
      const handlers: Record<string, (arg?: never) => void> = {};
      return {
        getStream: () => ({
          on(event: string, cb: (arg?: never) => void) {
            handlers[event] = cb;
          },
          end() {
            (handlers.data as unknown as (c: Uint8Array) => void)?.(
              new TextEncoder().encode('%PDF-injected'),
            );
            handlers.end?.();
          },
        }),
      };
    },
  };
  return { pdfMake, docs };
}

describe('RenderOptions.pdfMake — caller-supplied engine', () => {
  it('renders through the supplied instance', async () => {
    const { pdfMake, docs } = recordingPdfMake();

    const bytes = await renderInvoicePdf(fa3, 'fa3-default', { pdfMake });

    expect(new TextDecoder().decode(bytes)).toBe('%PDF-injected');
    expect(docs).toHaveLength(1);
    expect(docs[0]).toHaveProperty('content');
  });

  it('still derives the Code I QR, so an injected engine loses no features', async () => {
    const { pdfMake, docs } = recordingPdfMake();

    // `qrLinks` prints the derived URL as text under the code, which is the one
    // place the document definition carries it in readable form.
    await renderInvoicePdf(fa3, 'fa3-default', { pdfMake, qr: true, qrLinks: true, env: 'test' });

    expect(JSON.stringify(docs[0])).toContain('/invoice/1111111111/15-01-2025/');
  });

  it('assigns whatever VFS the caller normalized, untouched by the renderer', async () => {
    const fonts = { 'Roboto-Regular.ttf': 'AAA' };
    const { pdfMake } = recordingPdfMake();
    pdfMake.vfs = normalizeVfs({ default: { vfs: fonts } });

    await renderInvoicePdf(fa3, 'fa3-default', { pdfMake });

    expect(pdfMake.vfs).toBe(fonts);
  });
});
