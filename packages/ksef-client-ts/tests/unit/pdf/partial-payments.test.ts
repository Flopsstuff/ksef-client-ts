import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { getBuiltinTemplate } from '../../../src/pdf/template/builtin/index.js';
import { paymentFlags } from '../../../src/pdf/document-flags.js';
import { parseXmlForPdf } from '../../../src/pdf/parse.js';
import { paymentRenderer } from '../../../src/pdf/template/blocks/payment.js';
import type { PaymentBlock } from '../../../src/pdf/template/dsl.js';
import type { PdfNode, RenderChild, RenderContext } from '../../../src/pdf/template/interpret.js';

/**
 * `Platnosc` states how much has been paid through a choice: either `Zaplacono`
 * — a bare `1` meaning settled in full, with `DataZaplaty` — or
 * `ZnacznikZaplatyCzesciowej` (1 in part, 2 in full) with up to 100
 * `ZaplataCzesciowa` entries, each an amount, a date and a form.
 *
 * An invoice settled in instalments therefore carries no `Zaplacono` at all, so
 * templates bound to that field alone printed nothing for it: neither that part
 * of the money had arrived, nor how much, nor when.
 */

const fx = (n: string) => readFileSync(new URL(`../../fixtures/pdf/${n}`, import.meta.url), 'utf8');
const noRender: RenderChild = () => null;
const bodyOf = (xml: string) => (parseXmlForPdf(xml) as Record<string, unknown>).Faktura;

function paymentLines(templateName: string, xml: string, locale?: (k: string) => string): string[] {
  const block = getBuiltinTemplate(templateName)!.blocks.find((b) => b.type === 'payment') as PaymentBlock;
  const root = bodyOf(xml);
  const ctx: RenderContext = {
    root,
    strict: false,
    label: locale ?? ((k: string) => k),
    bindings: {},
    flags: { p15IsAmountDue: true, ...paymentFlags(root) },
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

describe('how much of the invoice has been paid', () => {
  it('reads the full-payment branch', () => {
    expect(paymentFlags(bodyOf(fx('fa3.xml')))).toEqual({ paidInFull: true, paidInPart: false });
  });

  it('reads the partial branch, which carries no Zaplacono at all', () => {
    const xml = fx('fa3-czesciowa.xml');
    expect(xml).not.toContain('<Zaplacono>');
    expect(paymentFlags(bodyOf(xml))).toEqual({ paidInFull: false, paidInPart: true });
  });

  it('treats the marker value 2 as paid in full', () => {
    const xml = fx('fa3-czesciowa.xml').replace(
      '<ZnacznikZaplatyCzesciowej>1<',
      '<ZnacznikZaplatyCzesciowej>2<',
    );
    expect(paymentFlags(bodyOf(xml))).toEqual({ paidInFull: true, paidInPart: false });
  });

  it('says nothing either way when the invoice states no payment status', () => {
    const xml = fx('fa3.xml').replace(/\s*<Zaplacono>1<\/Zaplacono>/, '');
    expect(paymentFlags(bodyOf(xml))).toEqual({ paidInFull: false, paidInPart: false });
  });
});

/**
 * FA models two different things that both look like "part payments", and only
 * one of them adds up:
 *
 * - `Fa.ZaliczkaCzesciowa` — the payments an advance invoice documents having
 *   received, each `P_15Z` "składająca się na kwotę w polu P_15". These sum to
 *   `P_15` exactly.
 * - `Fa.Platnosc.ZaplataCzesciowa` — settlements against the receivable. These
 *   sum to less than the total for as long as the invoice is only part-paid;
 *   that is what `ZnacznikZaplatyCzesciowej = 1` means.
 *
 * Reading a page of the second as though it were the first is what makes the
 * figures look broken, so both are rendered and each is named for what it is.
 */
describe.each(['fa2-default', 'fa3-default', 'fa3-showcase'])('%s payments that make up P_15', (name) => {
  const fa = name.startsWith('fa2') ? 'fa2' : 'fa3';

  it('prints each received payment, and they add up to P_15', () => {
    const xml = fx(`${fa}-zal.xml`);
    const amounts = [...xml.matchAll(/<P_15Z>([\d.]+)<\/P_15Z>/g)].map((m) => Number(m[1]));
    const total = Number(/<P_15>([\d.]+)<\/P_15>/.exec(xml)![1]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(total);

    const lines = paymentLines(name, xml);
    expect(lines).toEqual(
      expect.arrayContaining([
        'advancePayments',
        'advancePaymentAmount: 300,00 PLN',
        'advancePaymentDate: 10.01.2025',
        'advancePaymentAmount: 150,00 PLN',
        'advancePaymentDate: 14.01.2025',
      ]),
    );
  });

  it('prints no such section for an invoice that documents a single payment', () => {
    expect(paymentLines(name, fx(`${fa}.xml`))).not.toContain('advancePayments');
  });
});

describe.each(['fa2-default', 'fa3-default', 'fa3-showcase'])('%s partial payments', (name) => {
  const fa = name.startsWith('fa2') ? 'fa2' : 'fa3';

  it('prints every part payment with its amount, date and form', () => {
    const lines = paymentLines(name, fx(`${fa}-czesciowa.xml`));
    expect(lines).toEqual(
      expect.arrayContaining([
        'paidInPart',
        'partialPayments',
        'partialAmount: 300,00 PLN',
        'partialDate: 20.01.2025',
        'paymentMethod: Przelew',
        'partialAmount: 150,00 PLN',
        'partialDate: 05.02.2025',
        'paymentMethod: Karta',
      ]),
    );
  });

  it('keeps each part payment’s lines together, in document order', () => {
    const lines = paymentLines(name, fx(`${fa}-czesciowa.xml`));
    const group = lines.slice(lines.indexOf('partialPayments') + 1);
    expect(group.slice(0, 6)).toEqual([
      'partialAmount: 300,00 PLN',
      'partialDate: 20.01.2025',
      'paymentMethod: Przelew',
      'partialAmount: 150,00 PLN',
      'partialDate: 05.02.2025',
      'paymentMethod: Karta',
    ]);
  });

  it('states the status as a fact, not as the schema’s 1', () => {
    const lines = paymentLines(name, fx(`${fa}.xml`));
    expect(lines).toContain('paid');
    expect(lines.some((t) => t.startsWith('paid: '))).toBe(false);
    expect(lines).not.toContain('paidInPart');
  });

  it('prints no partial section for an invoice that has none', () => {
    const lines = paymentLines(name, fx(`${fa}.xml`));
    expect(lines).not.toContain('partialPayments');
    expect(lines.some((t) => t.startsWith('partialAmount'))).toBe(false);
  });

  it('qualifies a part payment with the currency the document states once', () => {
    // The amount lives inside the repeater and the currency does not, so a
    // bare `300,00` is the ambiguity the suffix exists to remove — on a EUR
    // invoice it reads as the wrong money entirely.
    const eur = fx(`${fa}-czesciowa.xml`).replace('<KodWaluty>PLN</KodWaluty>', '<KodWaluty>EUR</KodWaluty>');
    const lines = paymentLines(name, eur);
    expect(lines).toContain('partialAmount: 300,00 EUR');
  });

  it('still prints the bank accounts after the part payments', () => {
    const lines = paymentLines(name, fx(`${fa}-czesciowa.xml`));
    expect(lines.indexOf('bankAccounts')).toBeGreaterThan(lines.indexOf('partialPayments'));
    expect(lines).toContain('bankAccount: 11109000880000000100000001');
  });
});
