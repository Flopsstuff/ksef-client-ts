import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { getBuiltinTemplate } from '../../../src/pdf/template/builtin/index.js';
import { documentFlags, kindFlags } from '../../../src/pdf/document-flags.js';
import { parseXmlForPdf } from '../../../src/pdf/parse.js';
import { blockRegistry } from '../../../src/pdf/template/blocks/index.js';
import { interpretTemplate, type RenderContext } from '../../../src/pdf/template/interpret.js';
import { makeLabelResolver, type Locale } from '../../../src/pdf/i18n/index.js';

/**
 * A correcting invoice (`KOR`, `KOR_ZAL`, `KOR_ROZ`) is a different document
 * from the one it corrects, and the page has to say so: which invoice it
 * corrects and by which KSeF number, why, when the correction takes effect in
 * the VAT ledger, and what its figures are — a signed delta, not an amount
 * due. Rendered as an ordinary invoice it looked plausible and was wrong on
 * every one of those points.
 */

const fx = (p: string) => readFileSync(new URL(`../../fixtures/pdf/${p}`, import.meta.url), 'utf8');

const rootOf = (xml: string): unknown => (parseXmlForPdf(xml) as Record<string, unknown>).Faktura;

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
function render(templateName: string, xml: string, locale: Locale = 'pl'): string[] {
  const template = getBuiltinTemplate(templateName)!;
  const root = rootOf(xml);
  const ctx: RenderContext = {
    root,
    strict: false,
    label: makeLabelResolver(locale, {}),
    bindings: { 'opts.logo': '', 'opts.ksefNumber': '', 'opts.accent': '', qrUrl: '', certificateQrUrl: '' },
    flags: { ...documentFlags(root), totalsBuckets: true },
  };
  return texts(interpretTemplate(template, ctx, blockRegistry));
}

describe('what kind of document a correction is', () => {
  it('names the three correcting kinds, and which one corrects what', () => {
    expect(kindFlags(rootOf(fx('fa3-kor.xml')))).toEqual({
      isAdvanceInvoice: false,
      isSettlementInvoice: false,
      isCorrection: true,
      isCorrectionOfAdvance: false,
      isCorrectionOfSettlement: false,
    });
    const korZal = kindFlags(rootOf(fx('fa3-zal.xml').replace('<RodzajFaktury>ZAL<', '<RodzajFaktury>KOR_ZAL<')));
    expect(korZal.isCorrection).toBe(true);
    expect(korZal.isCorrectionOfAdvance).toBe(true);
    expect(korZal.isAdvanceInvoice).toBe(false);
    const korRoz = kindFlags(rootOf(fx('fa3-roz.xml').replace('<RodzajFaktury>ROZ<', '<RodzajFaktury>KOR_ROZ<')));
    expect(korRoz.isCorrectionOfSettlement).toBe(true);
    expect(korRoz.isSettlementInvoice).toBe(false);
  });

  it('an ordinary invoice is none of them', () => {
    const flags = documentFlags(rootOf(fx('fa3.xml')));
    expect(flags.isCorrection).toBe(false);
    expect(flags.p15IsCorrection).toBe(false);
    expect(flags.partiesBefore).toBe(false);
    expect(flags.linesBefore).toBe(false);
  });

  it('sees the line items restated as before/after pairs', () => {
    expect(documentFlags(rootOf(fx('fa3-kor.xml'))).linesBefore).toBe(true);
  });
});

describe.each(['fa2-default', 'fa3-default'])('%s prints what a correction is about', (name) => {
  const fa = name.startsWith('fa2') ? 'fa2' : 'fa3';

  it('names the invoice it corrects, with its date and KSeF number', () => {
    const out = render(name, fx(`${fa}-kor.xml`));
    expect(out).toContain('Faktury korygowane');
    expect(out).toContain('FA/2025/01/001');
    expect(out).toContain('15.01.2025');
    expect(out).toContain('1111111111-20260115-010000000000-00');
  });

  it('says when the corrected invoice was issued outside KSeF', () => {
    const outside = fx(`${fa}-kor.xml`).replace(
      /<NrKSeF>1<\/NrKSeF>\s*<NrKSeFFaKorygowanej>[^<]*<\/NrKSeFFaKorygowanej>/,
      '<NrKSeFN>1</NrKSeFN>',
    );
    const out = render(name, outside);
    expect(out).toContain('wystawiona poza KSeF');
    expect(out).not.toContain('1111111111-20260115-010000000000-00');
  });

  it('states the reason and when the correction takes effect', () => {
    const out = render(name, fx(`${fa}-kor.xml`));
    expect(out).toContain('Korekta');
    expect(out).toContain('Przyczyna korekty: Zwrot 1 szt. towaru');
    expect(out).toContain('Typ korekty: Korekta skutkująca w dacie wystawienia faktury korygującej');
  });

  it('reads in English too, effect included', () => {
    const out = render(name, fx(`${fa}-kor.xml`), 'en');
    expect(out).toContain('Correcting invoice');
    expect(out).toContain('Corrected invoices');
    expect(out).toContain('Correction type: Effective on the date the correcting invoice is issued');
    expect(out.some((t) => t.startsWith('Correction amount'))).toBe(true);
  });

  it('prints none of it on an ordinary invoice', () => {
    const out = render(name, fx(`${fa}.xml`));
    for (const label of ['Korekta', 'Faktury korygowane', 'Przyczyna korekty', 'Typ korekty', 'Korekta kwoty']) {
      expect(out.some((t) => t.startsWith(label)), label).toBe(false);
    }
  });
});
