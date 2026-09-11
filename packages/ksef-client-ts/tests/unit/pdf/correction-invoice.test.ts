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

function docOf(templateName: string, xml: string, locale: Locale = 'pl'): Record<string, unknown> {
  const template = getBuiltinTemplate(templateName)!;
  const root = rootOf(xml);
  const ctx: RenderContext = {
    root,
    strict: false,
    label: makeLabelResolver(locale, {}),
    bindings: { 'opts.logo': '', 'opts.ksefNumber': '', 'opts.accent': '', qrUrl: '', certificateQrUrl: '' },
    flags: { ...documentFlags(root), totalsBuckets: true },
  };
  return interpretTemplate(template, ctx, blockRegistry);
}

/** Render through the same flag derivation the public entry point uses. */
function render(templateName: string, xml: string, locale: Locale = 'pl'): string[] {
  return texts(docOf(templateName, xml, locale));
}

/** The item tables — the ones headed by the line-number column — as their cell texts. */
function itemTables(doc: Record<string, unknown>): string[][] {
  const out: string[][] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value === null || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    const table = node.table as { body?: unknown[][] } | undefined;
    if (table?.body && Array.isArray(table.body[0]) && (table.body[0][0] as { text?: string })?.text === 'Lp.') {
      out.push(texts({ content: table.body.slice(1) }));
    }
    Object.values(node).forEach(walk);
  };
  walk(doc.content);
  return out;
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
    expect(documentFlags(rootOf(fx('fa3-kor.xml'))).orderLinesBefore).toBe(false);
  });

  it('sees the order items of an advance correction restated as pairs', () => {
    // A correction of an advance invoice keeps its items under the order,
    // marked StanPrzedZ, not under FaWiersz.
    const flags = documentFlags(rootOf(fx('fa3-kor-zal.xml')));
    expect(flags.orderLinesBefore).toBe(true);
    expect(flags.linesBefore).toBe(false);
    expect(documentFlags(rootOf(fx('fa3-zal-b.xml'))).orderLinesBefore).toBe(false);
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

describe.each(['fa2-default', 'fa3-default'])('%s prints what a correction changed', (name) => {
  const fa = name.startsWith('fa2') ? 'fa2' : 'fa3';

  it('shows the line items as they were and as they are, in two tables', () => {
    const doc = docOf(name, fx(`${fa}-kor.xml`));
    const out = texts(doc);
    expect(out).toContain('Stan przed korektą');
    expect(out).toContain('Stan po korekcie');
    const [before, after] = itemTables(doc);
    expect(before).toContain('500,00');
    expect(before).not.toContain('400,00');
    expect(after).toContain('400,00');
    expect(after).not.toContain('500,00');
  });

  it('splits the order items of an advance correction the same way', () => {
    const doc = docOf(name, fx(`${fa}-kor-zal.xml`));
    const out = texts(doc);
    expect(out).toContain('Pozycje zamówienia lub umowy');
    expect(out).toContain('Stan przed korektą');
    expect(out).toContain('Stan po korekcie');
    // Both states of the one order item, each in its own table.
    expect(itemTables(doc)).toHaveLength(2);
    for (const table of itemTables(doc)) expect(table).toContain('1 000,00'.replace(' ', '\u00a0'));
    // The advance invoice it corrects has one order table and no state headings.
    const advance = docOf(name, fx(`${fa}-zal-b.xml`));
    expect(itemTables(advance)).toHaveLength(1);
    expect(texts(advance)).not.toContain('Stan przed korektą');
  });

  it('draws one item table and no state headings on an ordinary invoice', () => {
    const doc = docOf(name, fx(`${fa}.xml`));
    expect(itemTables(doc)).toHaveLength(1);
    const out = texts(doc);
    expect(out).not.toContain('Stan przed korektą');
    expect(out).not.toContain('Stan po korekcie');
  });

  it('shows the parties as they stood, beside the parties as corrected', () => {
    const out = render(name, fx(`${fa}-kor-zal.xml`));
    expect(out).toContain('Sprzedawca przed korektą');
    expect(out).toContain('ul. Przykładowa 1');
    expect(out).toContain('ul. Nowa 8');
    expect(out).toContain('Nabywca przed korektą');
    expect(out).toContain('ul. Morska 17');
    expect(out).toContain('ul. Portowa 5');
  });

  it('prints every buyer the correction restates, not only the first', () => {
    // The schema allows up to 101 Podmiot2K entries — a buyer and additional
    // buyers — and a scalar path would silently show the first alone.
    const second = `<Podmiot2K>
            <DaneIdentyfikacyjne><NIP>6666666666</NIP><Nazwa>Drugi Odbiorca S.A.</Nazwa></DaneIdentyfikacyjne>
            <Adres><KodKraju>PL</KodKraju><AdresL1>ul. Druga 2</AdresL1><AdresL2>80-001 Gdańsk</AdresL2></Adres>
        </Podmiot2K>
        <P_15ZK>`;
    const twoBuyers = fx(`${fa}-kor-zal.xml`).replace('<P_15ZK>', second);
    const out = render(name, twoBuyers);
    expect(out).toContain('Odbiorca Handlowy Sp. z o.o.');
    expect(out).toContain('Drugi Odbiorca S.A.');
    expect(out).toContain('6666666666');
    expect(out).toContain('ul. Druga 2');
  });

  it('leaves a party out of the "before" panel when only the other was restated', () => {
    const buyerOnly = fx(`${fa}-kor-zal.xml`).replace(/<Podmiot1K>.*?<\/Podmiot1K>\s*/s, '');
    const out = render(name, buyerOnly);
    expect(out).toContain('Nabywca przed korektą');
    expect(out).not.toContain('Sprzedawca przed korektą');
    const nobody = buyerOnly.replace(/<Podmiot2K>.*?<\/Podmiot2K>\s*/s, '');
    expect(render(name, nobody)).not.toContain('Nabywca przed korektą');
  });

  it('states what an advance correction restates: the payment before it', () => {
    const out = render(name, fx(`${fa}-kor-zal.xml`));
    expect(out).toContain('Kwota zapłaty przed korektą');
    expect(out).toContain('800,00');
    // A data-only correction corrects nothing about the money.
    expect(out.some((t) => t.startsWith('Korekta kwoty'))).toBe(true);
    expect(out).toContain('0,00');
    expect(render(name, fx(`${fa}-kor-zal.xml`), 'en')).toContain('Advance invoice correction');
  });

  it('states what a settlement correction restates: the remainder before it', () => {
    const out = render(name, fx(`${fa}-kor-roz.xml`));
    expect(out).toContain('Pozostało do zapłaty przed korektą');
    expect(out).toContain('165,00');
    expect(out).toContain('-61,50');
    expect(out).toContain('-50,00');
    expect(out).not.toContain('Kwota zapłaty przed korektą');
    // The order-net bridge is a settlement invoice's, not its correction's.
    expect(out.some((t) => t.includes('Rozliczono zaliczkami'))).toBe(false);
  });

  it('prints the exchange rate before the correction when the document carries one', () => {
    const withRate = fx(`${fa}-kor-roz.xml`).replace('</P_15ZK>', '</P_15ZK>\n        <KursWalutyZK>4.25</KursWalutyZK>');
    const out = render(name, withRate);
    expect(out).toContain('Kurs waluty przed korektą');
    expect(out).toContain('4,25');
  });

  it('prints the additional key/value notes the invoice carries', () => {
    const out = render(name, fx(`${fa}-kor.xml`));
    expect(out).toContain('Dodatkowe informacje');
    expect(out).toContain('Numer zgłoszenia zwrotu');
    expect(out).toContain('RMA/2025/0007');
    expect(render(name, fx(`${fa}.xml`))).not.toContain('Dodatkowe informacje');
  });
});
