import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { getBuiltinTemplate, renderInvoicePdf } from '../../../src/pdf/index.js';
import { parseXmlForPdf } from '../../../src/pdf/parse.js';
import { blockRegistry } from '../../../src/pdf/template/blocks/index.js';
import { interpretTemplate, type RenderContext } from '../../../src/pdf/template/interpret.js';
import { makeLabelResolver } from '../../../src/pdf/i18n/index.js';

/**
 * An advance invoice (`ZAL`/`KOR_ZAL`) may carry no `Fa.FaWiersz` at all: the
 * goods and services it covers are recorded under `Fa.Zamowienie` instead. A
 * template bound only to `Fa.FaWiersz` therefore printed a header-only line
 * table and dropped the document's actual content.
 */

const fx = (p: string) => readFileSync(new URL(`../../fixtures/${p}`, import.meta.url), 'utf8');

function docFor(templateName: string, xml: string): Record<string, unknown> {
  const template = getBuiltinTemplate(templateName)!;
  const parsed = parseXmlForPdf(xml) as Record<string, unknown>;
  const ctx: RenderContext = {
    root: parsed.Faktura,
    strict: false,
    label: makeLabelResolver('pl', {}),
    bindings: { 'opts.logo': '', 'opts.ksefNumber': '', 'opts.accent': '', qrUrl: '', certificateQrUrl: '' },
    flags: { totalsBuckets: true },
  };
  return interpretTemplate(template, ctx, blockRegistry);
}

/** Every table in the document, as its body rows. */
function tables(doc: Record<string, unknown>): unknown[][][] {
  const found: unknown[][][] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value === null || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    const table = node.table as { body?: unknown[][] } | undefined;
    if (table?.body) found.push(table.body);
    Object.values(node).forEach(walk);
  };
  walk(doc.content);
  return found;
}

const CASES = [
  { template: 'fa2-default', plain: 'pdf/fa2.xml', advance: 'pdf/fa2-zal.xml' },
  { template: 'fa3-default', plain: 'pdf/fa3.xml', advance: 'pdf/fa3-zal.xml' },
] as const;

describe.each(CASES)('$template on an advance invoice', ({ template, plain, advance }) => {
  it('prints the order rows the document actually carries', () => {
    const tree = JSON.stringify(docFor(template, fx(advance)));
    expect(tree).toContain('Usługa przykładowa — zaliczka');
    // The sub-line metadata rides along with the row, as it does for `FaWiersz`.
    expect(tree).toContain('IDX-0001');
    // …under its own heading, so the table is not mistaken for the item table.
    expect(tree).toContain('Pozycje zamówienia lub umowy');
    expect(tree).toContain('Wartość zamówienia');
  });

  it('draws no line-item table when the invoice has no line items', () => {
    // A repeater with no entries still emits its header row, so the empty item
    // table shows up as a table whose only row is its header.
    const headerOnly = tables(docFor(template, fx(advance))).filter((body) => body.length === 1);
    expect(headerOnly.map((body) => JSON.stringify(body[0]))).toEqual([]);
  });

  it('leaves an ordinary invoice with its item table and no order section', () => {
    const tree = JSON.stringify(docFor(template, fx(plain)));
    expect(tree).toContain('Usługa przykładowa');
    expect(tree).not.toContain('Pozycje zamówienia lub umowy');
    expect(tree).not.toContain('Wartość zamówienia');
  });

  it('still renders a PDF', async () => {
    const bytes = await renderInvoicePdf(fx(advance), template);
    expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  });

  it('is strict-clean — every order path the template names resolves', async () => {
    await expect(renderInvoicePdf(fx(advance), template, { strict: true })).resolves.toBeInstanceOf(Uint8Array);
  });
});
