import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { getBuiltinTemplate } from '../../../src/pdf/template/builtin/index.js';
import { parseXmlForPdf } from '../../../src/pdf/parse.js';
import { partiesRenderer } from '../../../src/pdf/template/blocks/parties.js';
import type { PartiesBlock } from '../../../src/pdf/template/dsl.js';
import type { PdfNode, RenderChild, RenderContext } from '../../../src/pdf/template/interpret.js';

/**
 * `Podmiot2.Adres` is `minOccurs="0"` — art. 106e ust. 5 pkt 3 lets an invoice
 * omit the buyer's address entirely — while `AdresL1` and `KodKraju` are
 * mandatory *within* an address that exists. Binding the children directly made
 * the optional parent look mandatory; reading the group from the parent drops
 * it whole instead.
 */

const fa3 = readFileSync(new URL('../../fixtures/pdf/fa3.xml', import.meta.url), 'utf8');
const noRender: RenderChild = () => null;

function partyLines(templateName: string, xml: string, strict = false): string[] {
  const block = getBuiltinTemplate(templateName)!.blocks.find((b) => b.type === 'parties') as PartiesBlock;
  const ctx: RenderContext = {
    root: (parseXmlForPdf(xml) as Record<string, unknown>).Faktura,
    strict,
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

/** The FA(3) fixture with the buyer's address element removed, seller intact. */
const withoutBuyerAddress = fa3.replace(/<Podmiot2>[\s\S]*?<\/Podmiot2>/, (m) =>
  m.replace(/\s*<Adres>[\s\S]*?<\/Adres>/, ''),
);

describe.each(['fa2-default', 'fa3-default', 'fa3-showcase'])('%s buyer address', (name) => {
  it('prints the address the invoice carries', () => {
    const lines = partyLines(name, fa3);
    expect(lines).toContain('ul. Testowa 2');
    expect(lines).toContain('00-002 Kraków');
    expect(lines).toContain('PL');
  });

  it('drops the group, heading included, when the invoice carries none', () => {
    const lines = partyLines(name, withoutBuyerAddress);
    expect(lines).not.toContain('ul. Testowa 2');
    // The seller's address is mandatory and still there, so the panel is not
    // simply empty — only the buyer's group went.
    expect(lines).toContain('ul. Przykładowa 1');
    expect(lines.filter((t) => t === 'address')).toHaveLength(1);
  });

  it('does not throw under strict when the buyer states no address', () => {
    expect(() => partyLines(name, withoutBuyerAddress, true)).not.toThrow();
  });
});
