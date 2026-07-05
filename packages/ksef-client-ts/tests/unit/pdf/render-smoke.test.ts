import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  renderInvoicePdf,
  renderInvoicePdfFromTemplate,
  detectInvoiceVersion,
} from '../../../src/pdf/index.js';
import { KSeFPdfError } from '../../../src/pdf/errors.js';
import type { InvoiceTemplate } from '../../../src/pdf/template/dsl.js';

const fa3 = readFileSync(new URL('../../fixtures/pdf/fa3.xml', import.meta.url), 'utf8');
const fa2 = readFileSync(new URL('../../fixtures/pdf/fa2.xml', import.meta.url), 'utf8');

function pdfEnvelope(bytes: Uint8Array): { head: string; tail: string } {
  const head = Buffer.from(bytes.subarray(0, 5)).toString('latin1');
  const tail = Buffer.from(bytes.subarray(-6)).toString('latin1').trim();
  return { head, tail };
}

describe('renderInvoicePdf — end-to-end', () => {
  it('renders an FA(3) invoice to a valid PDF envelope', async () => {
    const bytes = await renderInvoicePdf(fa3, 'fa3-default');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);
    const { head, tail } = pdfEnvelope(bytes);
    expect(head).toBe('%PDF-');
    expect(tail.endsWith('%%EOF')).toBe(true);
  });

  it('accepts a Uint8Array input', async () => {
    const bytes = await renderInvoicePdf(new TextEncoder().encode(fa3), 'fa3-default');
    expect(pdfEnvelope(bytes).head).toBe('%PDF-');
  });

  it('renders the built-in fa3-default in strict mode without a missing binding', async () => {
    // valid-fa3.xml populates every path the built-in references.
    const bytes = await renderInvoicePdf(fa3, 'fa3-default', { strict: true });
    expect(pdfEnvelope(bytes).head).toBe('%PDF-');
  });

  it('throws a friendly error for an unknown built-in template', async () => {
    await expect(renderInvoicePdf(fa3, 'does-not-exist')).rejects.toBeInstanceOf(KSeFPdfError);
  });

  it('rejects a template whose schema does not match the document version', async () => {
    // fa3-default targets FA(3); feeding FA(2) must be rejected.
    expect(detectInvoiceVersion(fa2)).toBe('FA(2)');
    await expect(renderInvoicePdf(fa2, 'fa3-default')).rejects.toThrow(/FA\(3\).*FA\(2\)|FA\(2\).*FA\(3\)/);
  });
});

describe('renderInvoicePdfFromTemplate — custom object', () => {
  it('renders a minimal custom template', async () => {
    const template: InvoiceTemplate = {
      schema: 'FA(3)',
      blocks: [
        { type: 'header', title: { label: 'invoice' }, number: 'Fa.P_2', date: 'Fa.P_1' },
        { type: 'text', path: 'Fa.P_15', format: 'money' },
      ],
    };
    const bytes = await renderInvoicePdfFromTemplate(fa3, template);
    expect(pdfEnvelope(bytes).head).toBe('%PDF-');
  });

  it('rejects a structurally invalid template', async () => {
    const bad = { schema: 'FA(3)', blocks: [{ type: 'nope' }] } as unknown as InvoiceTemplate;
    await expect(renderInvoicePdfFromTemplate(fa3, bad)).rejects.toThrow();
  });
});
