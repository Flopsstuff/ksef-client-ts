import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { getBuiltinTemplate } from '../../../src/pdf/template/builtin/index.js';
import { parseXmlForPdf } from '../../../src/pdf/parse.js';
import { paymentRenderer } from '../../../src/pdf/template/blocks/payment.js';
import type { PaymentBlock } from '../../../src/pdf/template/dsl.js';
import type { PdfNode, RenderChild, RenderContext } from '../../../src/pdf/template/interpret.js';

/**
 * `TerminPlatnosci` is `maxOccurs="100"`: an invoice paid in instalments states
 * one term per instalment. A scalar binding reads only the first, because a
 * path walk that meets an array follows its head — so every date after the
 * first vanished from the page with nothing to show it had.
 */

const fa3 = readFileSync(new URL('../../fixtures/pdf/fa3.xml', import.meta.url), 'utf8');

const INSTALMENTS = `<TerminPlatnosci><Termin>2025-02-01</Termin></TerminPlatnosci>
            <TerminPlatnosci><Termin>2025-03-01</Termin></TerminPlatnosci>
            <TerminPlatnosci><Termin>2025-04-01</Termin></TerminPlatnosci>`;

const noRender: RenderChild = () => null;

function paymentLines(templateName: string, xml: string): string[] {
  const block = getBuiltinTemplate(templateName)!.blocks.find((b) => b.type === 'payment') as PaymentBlock;
  const ctx: RenderContext = {
    root: (parseXmlForPdf(xml) as Record<string, unknown>).Faktura,
    strict: false,
    label: (k: string) => k,
    bindings: {},
    flags: { p15IsAmountDue: true },
  };
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value === null || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (typeof node.text === 'string') out.push(node.text);
    Object.values(node).forEach(walk);
  };
  walk(paymentRenderer(block, ctx, noRender) as PdfNode);
  return out;
}

const instalments = fa3.replace(/<TerminPlatnosci>[\s\S]*?<\/TerminPlatnosci>/, INSTALMENTS);

describe.each(['fa2-default', 'fa3-default', 'fa3-showcase'])('%s payment terms', (name) => {
  it('prints every term an instalment schedule carries', () => {
    const dates = paymentLines(name, instalments).filter((t) => t.startsWith('paymentDate: '));
    expect(dates).toEqual(['paymentDate: 01.02.2025', 'paymentDate: 01.03.2025', 'paymentDate: 01.04.2025']);
  });

  it('prints a single term exactly as before', () => {
    const dates = paymentLines(name, fa3).filter((t) => t.startsWith('paymentDate: '));
    expect(dates).toEqual(['paymentDate: 01.02.2025']);
  });

  it('prints no term line at all when the invoice states none', () => {
    const noTerms = fa3.replace(/\s*<TerminPlatnosci>[\s\S]*?<\/TerminPlatnosci>/, '');
    expect(noTerms).not.toContain('TerminPlatnosci');
    expect(paymentLines(name, noTerms).some((t) => t.startsWith('paymentDate'))).toBe(false);
  });

  it('skips a term that carries only a description, not a date', () => {
    // `Termin` and `TerminOpis` are both optional inside a term, so an entry
    // may have no date to print — and a dangling label is worse than nothing.
    const described = fa3.replace(
      /<TerminPlatnosci>[\s\S]*?<\/TerminPlatnosci>/,
      '<TerminPlatnosci><Termin>2025-02-01</Termin></TerminPlatnosci>' +
        '<TerminPlatnosci><TerminOpis><Ilosc>14</Ilosc><Jednostka>dni</Jednostka>' +
        '<ZdarzeniePoczatkowe>od wydania</ZdarzeniePoczatkowe></TerminOpis></TerminPlatnosci>',
    );
    const dates = paymentLines(name, described).filter((t) => t.startsWith('paymentDate'));
    expect(dates).toEqual(['paymentDate: 01.02.2025']);
  });
});
