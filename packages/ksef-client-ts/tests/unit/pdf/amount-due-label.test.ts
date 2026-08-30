import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { getBuiltinTemplate } from '../../../src/pdf/template/builtin/index.js';
import { p15Flags } from '../../../src/pdf/document-flags.js';
import { parseXmlForPdf } from '../../../src/pdf/parse.js';
import { blockRegistry } from '../../../src/pdf/template/blocks/index.js';
import { interpretTemplate, type RenderContext } from '../../../src/pdf/template/interpret.js';
import { makeLabelResolver } from '../../../src/pdf/i18n/index.js';

/**
 * `P_15` is not one figure with one name. The FA schemas define it as the total
 * receivable, except on an advance invoice (`ZAL`/`KOR_ZAL`) where it is the
 * payment the document records as *already received*; and when the document
 * carries `Rozliczenie.DoZaplaty` — `P_15` plus surcharges minus deductions —
 * that is the figure the buyer actually pays.
 *
 * Printing `P_15` under a flat `Do zapłaty` therefore told the reader of an
 * advance invoice to pay the amount they had already paid, and the reader of a
 * settled invoice to pay a figure that was not the one owed.
 */

const fx = (p: string) => readFileSync(new URL(`../../fixtures/pdf/${p}`, import.meta.url), 'utf8');

/** Every rendered text run in the document, flattened. */
function texts(doc: Record<string, unknown>): string[] {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value === null || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (typeof node.text === 'string') out.push(node.text);
    Object.values(node).forEach(walk);
  };
  walk(doc.content);
  return out;
}

/** Render through the same flag derivation the public entry point uses. */
function render(templateName: string, xml: string): string[] {
  const template = getBuiltinTemplate(templateName)!;
  const root = (parseXmlForPdf(xml) as Record<string, unknown>).Faktura;
  const ctx: RenderContext = {
    root,
    strict: false,
    label: makeLabelResolver('pl', {}),
    bindings: { 'opts.logo': '', 'opts.ksefNumber': '', 'opts.accent': '', qrUrl: '', certificateQrUrl: '' },
    flags: { ...p15Flags(root), totalsBuckets: true },
  };
  return texts(interpretTemplate(template, ctx, blockRegistry));
}

describe('which reading of P_15 a document supports', () => {
  it('an ordinary invoice: P_15 is the amount due', () => {
    expect(p15Flags((parseXmlForPdf(fx('fa3.xml')) as Record<string, unknown>).Faktura)).toEqual({
      p15IsAmountDue: true,
      p15IsAdvancePaid: false,
      p15IsAmountTotal: false,
    });
  });

  it('an advance invoice: P_15 is a payment already received', () => {
    expect(p15Flags((parseXmlForPdf(fx('fa3-zal.xml')) as Record<string, unknown>).Faktura)).toEqual({
      p15IsAmountDue: false,
      p15IsAdvancePaid: true,
      p15IsAmountTotal: false,
    });
  });

  it('a settled invoice: P_15 is only the total, DoZaplaty is the payable', () => {
    expect(p15Flags((parseXmlForPdf(fx('fa3-rozliczenie.xml')) as Record<string, unknown>).Faktura)).toEqual({
      p15IsAmountDue: false,
      p15IsAdvancePaid: false,
      p15IsAmountTotal: true,
    });
  });

  it('an advance invoice that also settles stays an advance invoice', () => {
    const xml = fx('fa3-rozliczenie.xml').replace(
      '<RodzajFaktury>VAT</RodzajFaktury>',
      '<RodzajFaktury>ZAL</RodzajFaktury>',
    );
    expect(p15Flags((parseXmlForPdf(xml) as Record<string, unknown>).Faktura).p15IsAdvancePaid).toBe(true);
  });
});

describe.each(['fa2-default', 'fa3-default', 'fa3-showcase'])('%s names the figure it prints', (name) => {
  const fa = name.startsWith('fa2') ? 'fa2' : 'fa3';

  it('calls P_15 the amount due on an ordinary invoice', () => {
    const out = render(name, fx(`${fa}.xml`));
    expect(out.some((t) => /Do zap[łl]aty/i.test(t))).toBe(true);
    expect(out.some((t) => t.includes('Kwota zapłaty'))).toBe(false);
  });

  it('never demands payment of an advance already received', () => {
    const out = render(name, fx(`${fa}-zal.xml`));
    // The advance is labelled as a payment made, and nothing on the page says
    // the reader still owes it.
    expect(out.some((t) => t.includes('Kwota zapłaty'))).toBe(true);
    expect(out.some((t) => /Do zap[łl]aty/i.test(t))).toBe(false);
  });

  it('prints the settled payable, not P_15, when the document states one', () => {
    const out = render(name, fx(`${fa}-rozliczenie.xml`));
    const due = out.findIndex((t) => /Do zap[łl]aty/i.test(t));
    expect(due, 'the settled payable must be labelled').toBeGreaterThanOrEqual(0);
    // 625,00 is DoZaplaty (P_15 615,00 + 10,00 of surcharges), and it is the
    // figure printed under `Do zapłaty` — P_15 keeps its own name.
    expect(out).toContain('625,00');
    expect(out.some((t) => t.includes('Kwota należności ogółem'))).toBe(true);
  });
});
