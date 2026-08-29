import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `theme.accent` has to reach the document as a *style*: bindings resolve to
 * text, and pdfmake reads a colour from nowhere else. Asserting on rendered
 * bytes cannot show that — pdfmake compresses its content streams and stamps a
 * fresh creation date and file id into every render, so two runs of the same
 * document never match anyway. So capture the document definition on its way
 * into pdfmake and read the styles off it.
 */
const captured: Array<Record<string, unknown>> = [];

vi.mock('pdfmake/build/pdfmake.js', () => ({
  default: {
    createPdf(docDefinition: Record<string, unknown>) {
      captured.push(docDefinition);
      return {
        getStream() {
          const handlers: Record<string, (arg?: never) => void> = {};
          return {
            on(event: string, cb: (arg?: never) => void) {
              handlers[event] = cb;
            },
            end() {
              (handlers.data as unknown as (c: Uint8Array) => void)?.(Uint8Array.from([37, 80]));
              handlers.end?.();
            },
          };
        },
      };
    },
  },
}));

vi.mock('pdfmake/build/vfs_fonts.js', () => ({ default: { 'Roboto-Regular.ttf': '' } }));

const { renderInvoicePdf } = await import('../../../src/pdf/index.js');

const fa3 = readFileSync(new URL('../../fixtures/pdf/fa3.xml', import.meta.url), 'utf8');

/** The styles of the last document handed to pdfmake. */
function lastStyles(): Record<string, { color?: string }> {
  return captured[captured.length - 1]?.styles as Record<string, { color?: string }>;
}

describe('theme.accent', () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it('repaints the title and both heading levels', async () => {
    await renderInvoicePdf(fa3, 'fa3-default', { theme: { accent: '#B00043' } });
    const styles = lastStyles();
    expect(styles.title?.color).toBe('#B00043');
    expect(styles.h1?.color).toBe('#B00043');
    expect(styles.h2?.color).toBe('#B00043');
  });

  it('keeps every other property of the styles it repaints', async () => {
    await renderInvoicePdf(fa3, 'fa3-default');
    const before = lastStyles();
    await renderInvoicePdf(fa3, 'fa3-default', { theme: { accent: '#B00043' } });
    const after = lastStyles();
    expect(after.h1).toEqual({ ...before.h1, color: '#B00043' });
  });

  it('leaves styles it does not own alone', async () => {
    await renderInvoicePdf(fa3, 'fa3-default');
    const before = lastStyles();
    await renderInvoicePdf(fa3, 'fa3-default', { theme: { accent: '#B00043' } });
    expect(lastStyles().muted).toEqual(before.muted);
  });

  it('renders identically to an unthemed document when no accent is given', async () => {
    await renderInvoicePdf(fa3, 'fa3-default');
    const plain = lastStyles();
    await renderInvoicePdf(fa3, 'fa3-default', { theme: {} });
    expect(lastStyles()).toEqual(plain);
    await renderInvoicePdf(fa3, 'fa3-default', { theme: { accent: '   ' } });
    expect(lastStyles()).toEqual(plain);
  });

  it('reaches a template that names no styles of its own', async () => {
    const template = {
      schema: 'FA(3)' as const,
      blocks: [{ type: 'header' as const, title: { label: 'invoice' }, number: 'Fa.P_2' }],
    };
    const { renderInvoicePdfFromTemplate } = await import('../../../src/pdf/index.js');
    await renderInvoicePdfFromTemplate(fa3, template, { theme: { accent: '#123456' } });
    expect(lastStyles().title?.color).toBe('#123456');
  });
});
