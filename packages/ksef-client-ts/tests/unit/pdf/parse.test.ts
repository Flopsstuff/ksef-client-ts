import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  pdfXmlParser,
  parseXmlForPdf,
  detectInvoiceVersion,
  detectUpoVersion,
} from '../../../src/pdf/parse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../../fixtures');

function loadFixture(rel: string): string {
  return fs.readFileSync(path.join(fixturesDir, rel), 'utf8');
}

const fa3Xml = loadFixture('pdf/fa3.xml');
const fa2Xml = loadFixture('pdf/fa2.xml');
const upoV43Xml = loadFixture('pdf/upo-4_3.xml');

// Non-FA / non-Faktura roots for negative detection — inline so the test stays
// self-contained and free of any personal invoice data.
const pef3Xml =
  '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>1</ID></Invoice>';
const rr1Xml =
  '<FakturaRR><Naglowek><KodFormularza kodSystemowy="FA_RR (1)">FA_RR</KodFormularza></Naglowek></FakturaRR>';

describe('pdfXmlParser', () => {
  it('parses a mixed-content element into #text plus @-prefixed attributes', () => {
    const parsed = pdfXmlParser.parse(
      '<KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>',
    ) as Record<string, Record<string, unknown>>;
    expect(parsed.KodFormularza).toEqual({
      '#text': 'FA',
      '@kodSystemowy': 'FA (3)',
      '@wersjaSchemy': '1-0E',
    });
  });

  it('strips namespace prefixes from element names', () => {
    const parsed = pdfXmlParser.parse('<tns:Fa><tns:P_2>X</tns:P_2></tns:Fa>') as Record<
      string,
      Record<string, unknown>
    >;
    expect(parsed.Fa).toEqual({ P_2: 'X' });
  });

  it('keeps numeric-looking values as strings (parseTagValue: false)', () => {
    const parsed = pdfXmlParser.parse('<P_8B>05</P_8B>') as Record<string, unknown>;
    expect(parsed.P_8B).toBe('05');
  });
});

describe('parseXmlForPdf', () => {
  it('returns an object keyed by the document root', () => {
    const parsed = parseXmlForPdf(fa3Xml);
    expect(parsed).toHaveProperty('Faktura');
  });

  it('collapses a single repeated element into an object (not an array)', () => {
    const parsed = parseXmlForPdf(fa3Xml) as {
      Faktura: { Fa: { FaWiersz: unknown } };
    };
    expect(Array.isArray(parsed.Faktura.Fa.FaWiersz)).toBe(false);
  });

  it('returns {} for an empty string without throwing', () => {
    expect(parseXmlForPdf('')).toEqual({});
  });

  it('returns {} for non-XML text without throwing', () => {
    expect(parseXmlForPdf('just some text')).toEqual({});
  });

  it('does not throw on malformed / unterminated XML', () => {
    expect(() => parseXmlForPdf('<a><b>oops')).not.toThrow();
    expect(parseXmlForPdf('<a><b>oops')).toHaveProperty('a');
  });
});

describe('detectInvoiceVersion', () => {
  it('detects FA(3) from a real fixture', () => {
    expect(detectInvoiceVersion(fa3Xml)).toBe('FA(3)');
  });

  it('detects FA(2) from a real fixture', () => {
    expect(detectInvoiceVersion(fa2Xml)).toBe('FA(2)');
  });

  it('detects FA(3) via WariantFormularza when kodSystemowy is absent', () => {
    const xml = '<Faktura><Naglowek><WariantFormularza>3</WariantFormularza></Naglowek></Faktura>';
    expect(detectInvoiceVersion(xml)).toBe('FA(3)');
  });

  it('detects FA(2) via WariantFormularza when kodSystemowy is absent', () => {
    const xml = '<Faktura><Naglowek><WariantFormularza>2</WariantFormularza></Naglowek></Faktura>';
    expect(detectInvoiceVersion(xml)).toBe('FA(2)');
  });

  it('detects FA(3) from kodSystemowy alone (no WariantFormularza)', () => {
    const xml =
      '<Faktura><Naglowek><KodFormularza kodSystemowy="FA (3)">FA</KodFormularza></Naglowek></Faktura>';
    expect(detectInvoiceVersion(xml)).toBe('FA(3)');
  });

  it('returns null for a Faktura with neither a recognized kod nor variant', () => {
    const xml =
      '<Faktura><Naglowek><WariantFormularza>1</WariantFormularza></Naglowek></Faktura>';
    expect(detectInvoiceVersion(xml)).toBeNull();
  });

  it('returns null for a UPO document (no Faktura root)', () => {
    expect(detectInvoiceVersion(upoV43Xml)).toBeNull();
  });

  it('returns null for a PEF/UBL Invoice (root is Invoice, not Faktura)', () => {
    expect(detectInvoiceVersion(pef3Xml)).toBeNull();
  });

  it('returns null for a farmer invoice (root is FakturaRR, not Faktura)', () => {
    expect(detectInvoiceVersion(rr1Xml)).toBeNull();
  });

  it('returns null for unrecognized / non-invoice XML', () => {
    expect(detectInvoiceVersion('<Foo><Bar>baz</Bar></Foo>')).toBeNull();
  });

  // A document that states both markers has to mean one version by them.
  // Accepting either alone let a mismatched pair through, and every binding
  // would then resolve against the wrong schema.
  it('returns null when the two markers contradict each other', () => {
    const kod2variant3 =
      '<Faktura><Naglowek><KodFormularza kodSystemowy="FA (2)">FA</KodFormularza>' +
      '<WariantFormularza>3</WariantFormularza></Naglowek></Faktura>';
    expect(detectInvoiceVersion(kod2variant3)).toBeNull();

    const kod3variant2 =
      '<Faktura><Naglowek><KodFormularza kodSystemowy="FA (3)">FA</KodFormularza>' +
      '<WariantFormularza>2</WariantFormularza></Naglowek></Faktura>';
    expect(detectInvoiceVersion(kod3variant2)).toBeNull();
  });

  it('returns null when one of two present markers is unrecognized', () => {
    const xml =
      '<Faktura><Naglowek><KodFormularza kodSystemowy="FA (1)">FA</KodFormularza>' +
      '<WariantFormularza>3</WariantFormularza></Naglowek></Faktura>';
    expect(detectInvoiceVersion(xml)).toBeNull();
  });

  it('still accepts a document whose two markers agree', () => {
    const xml =
      '<Faktura><Naglowek><KodFormularza kodSystemowy="FA (3)">FA</KodFormularza>' +
      '<WariantFormularza>3</WariantFormularza></Naglowek></Faktura>';
    expect(detectInvoiceVersion(xml)).toBe('FA(3)');
  });
});

describe('detectUpoVersion', () => {
  it('detects UPO(4.3) from a real v4-3 fixture', () => {
    expect(detectUpoVersion(upoV43Xml)).toBe('UPO(4.3)');
  });

  it('detects UPO(4.2) from a v4-2 namespace (raw-scan fallback)', () => {
    const xml =
      '<Potwierdzenie xmlns="http://upo.schematy.mf.gov.pl/KSeF/v4-2"><NumerReferencyjnySesji>X</NumerReferencyjnySesji></Potwierdzenie>';
    expect(detectUpoVersion(xml)).toBe('UPO(4.2)');
  });

  it('returns null for a Potwierdzenie without a recognized version marker', () => {
    const xml = '<Potwierdzenie xmlns="http://upo.schematy.mf.gov.pl/KSeF/v9-9"><X>1</X></Potwierdzenie>';
    expect(detectUpoVersion(xml)).toBeNull();
  });

  it('returns null for a non-UPO document (no Potwierdzenie root)', () => {
    expect(detectUpoVersion(fa3Xml)).toBeNull();
  });

  // The version lives in the root element's own xmlns. Scanning the whole
  // source let any Potwierdzenie that merely mentions the string pass as that
  // version — a quoted URL in a note is enough.
  it('ignores the marker when it appears outside the root tag', () => {
    const xml =
      '<Potwierdzenie xmlns="http://example.invalid/other">' +
      '<Uwagi>see http://upo.schematy.mf.gov.pl/KSeF/v4-3 for details</Uwagi>' +
      '</Potwierdzenie>';
    expect(detectUpoVersion(xml)).toBeNull();
  });

  it('reads the marker from a namespace-prefixed root tag', () => {
    const xml =
      '<upo:Potwierdzenie xmlns:upo="http://upo.schematy.mf.gov.pl/KSeF/v4-3">' +
      '<upo:X>1</upo:X></upo:Potwierdzenie>';
    expect(detectUpoVersion(xml)).toBe('UPO(4.3)');
  });

  it('returns null for unrecognized XML', () => {
    expect(detectUpoVersion('<Foo/>')).toBeNull();
  });
});
