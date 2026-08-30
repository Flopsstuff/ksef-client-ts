import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { getBuiltinTemplate } from '../../../src/pdf/template/builtin/index.js';
import { parseXmlForPdf } from '../../../src/pdf/parse.js';
import { partiesRenderer } from '../../../src/pdf/template/blocks/parties.js';
import type { PartiesBlock } from '../../../src/pdf/template/dsl.js';
import type { PdfNode, RenderChild, RenderContext } from '../../../src/pdf/template/interpret.js';

/**
 * `TPodmiot2` states the counterparty's identifier as a choice, and two of its
 * branches are pairs: `KodUE` + `NrVatUE`, and an optional `KodKraju` before
 * `NrID`. Printing only the number dropped the country it belongs to, which
 * turns a VAT number into a different — and ambiguous — one.
 */

const fa3 = readFileSync(new URL('../../fixtures/pdf/fa3.xml', import.meta.url), 'utf8');

const noRender: RenderChild = () => null;

/** The buyer panel's lines, for an invoice whose identifier branch is swapped in. */
function buyerLines(templateName: string, identifier: string): string[] {
  const xml = fa3.replace('<NIP>2222222222</NIP>', identifier);
  const block = getBuiltinTemplate(templateName)!.blocks.find((b) => b.type === 'parties') as PartiesBlock;
  const ctx: RenderContext = {
    root: (parseXmlForPdf(xml) as Record<string, unknown>).Faktura,
    strict: false,
    label: (k: string) => k,
    bindings: {},
    flags: {},
  };
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value === null || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (typeof node.text === 'string') out.push(node.text);
    Object.values(node).forEach(walk);
  };
  walk(partiesRenderer(block, ctx, noRender) as PdfNode);
  return out;
}

describe.each(['fa2-default', 'fa3-default', 'fa3-showcase'])('%s prints a whole buyer identifier', (name) => {
  it('keeps the country code an EU VAT number is stated with', () => {
    const lines = buyerLines(name, '<KodUE>DE</KodUE><NrVatUE>123456789</NrVatUE>');
    expect(lines).toContain('DE 123456789');
    expect(lines).not.toContain('123456789');
  });

  it('keeps the country a foreign identifier is qualified by', () => {
    const lines = buyerLines(name, '<KodKraju>UA</KodKraju><NrID>ID-999</NrID>');
    expect(lines).toContain('UA ID-999');
  });

  it('still prints an unqualified NrID, since KodKraju is optional there', () => {
    const lines = buyerLines(name, '<NrID>ID-999</NrID>');
    expect(lines).toContain('ID-999');
  });

  it('leaves a domestic NIP exactly as it was', () => {
    const lines = buyerLines(name, '<NIP>2222222222</NIP>');
    expect(lines).toContain('2222222222');
  });
});
