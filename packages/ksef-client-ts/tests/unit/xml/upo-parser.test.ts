import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUpoXml } from '../../../src/xml/upo-parser.js';
import { KSeFValidationError } from '../../../src/errors/ksef-validation-error.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../../fixtures/upo');

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf8');
}

// ── Fixture file contents (loaded once) ─────────────────────────────────

const nipFakturaXml = loadFixture('upo-faktura-kontekst-id-nip.xml');
const nipSesjaXml = loadFixture('upo-sesja-kontekst-id-nip.xml');
const internalIdFakturaXml = loadFixture('upo-faktura-internal-id.xml');
const internalIdSesjaXml = loadFixture('upo-sesja-internal-id.xml');
const vatUeFakturaXml = loadFixture('upo-faktura-id-zlozony-vat-ue.xml');
const vatUeSesjaXml = loadFixture('upo-sesja-id-zlozony-vat-ue.xml');
const peppolFakturaXml = loadFixture('upo-faktura-peppol.xml');

// ── 1. Happy path ───────────────────────────────────────────────────────

describe('parseUpoXml', () => {
  it('parses single-invoice NIP UPO with correct top-level fields', () => {
    const result = parseUpoXml(nipFakturaXml);

    expect(result.nazwaPodmiotuPrzyjmujacego).toBe(
      'Ministerstwo Finansów - środowisko testowe (TE)',
    );
    expect(result.numerReferencyjnySesji).toBe(
      '36950822-93-9D5A28BFDA-47C899773E-5C',
    );
    expect(result.nazwaStrukturyLogicznej).toBe('Schemat_FA(3)_v1-0E.xsd');
    expect(result.kodFormularza).toBe('FA (3)');

    // Context
    expect(result.uwierzytelnienie.idKontekstu).toEqual({
      kind: 'Nip',
      nip: '5265877635',
    });

    // Auth proof
    expect(result.uwierzytelnienie.proof).toEqual({
      kind: 'SkrotDokumentuUwierzytelniajacego',
      skrotDokumentuUwierzytelniajacego:
        'kyqH+QUgP8ATWd/95IY632mP4uqibwG66Oqclq9+qno=',
    });

    // Dokumenty
    expect(result.dokumenty).toHaveLength(1);
    const doc = result.dokumenty[0];
    expect(doc.nipSprzedawcy).toBe('5265877635');
    expect(doc.numerKSeFDokumentu).toBe(
      '5265877635-20250916-0200A0D6723E-C2',
    );
    expect(doc.numerFaktury).toBe('FA/XVQUD-9997622510/04/2027');
    expect(doc.dataWystawieniaFaktury).toBe('2025-09-16');
    expect(doc.dataPrzeslaniaDokumentu).toBe(
      '2025-09-16T11:05:40.841+02:00',
    );
    expect(doc.dataNadaniaNumeruKSeF).toBe(
      '2025-09-16T11:05:41.045+02:00',
    );
    expect(doc.skrotDokumentu).toBe(
      'GZMGNVzs3krF6URKgvaw77OOeG3nJ+WGziT5xguliQ8=',
    );
    expect(doc.trybWysylki).toBe('Online');

    // OpisPotwierdzenia absent for single-invoice
    expect(result.opisPotwierdzenia).toBeUndefined();
  });

  it('parses multi-document session UPO with OpisPotwierdzenia', () => {
    const result = parseUpoXml(nipSesjaXml);

    expect(result.dokumenty).toHaveLength(2);

    // First document
    expect(result.dokumenty[0].numerKSeFDokumentu).toBe(
      '5265877635-20250916-010040741B3E-46',
    );
    expect(result.dokumenty[0].numerFaktury).toBe(
      'FA/SIGTF-3388125147/11/2025',
    );

    // Second document
    expect(result.dokumenty[1].numerKSeFDokumentu).toBe(
      '5265877635-20250916-0200A0D6723E-C2',
    );
    expect(result.dokumenty[1].numerFaktury).toBe(
      'FA/XVQUD-9997622510/04/2027',
    );

    // OpisPotwierdzenia present
    expect(result.opisPotwierdzenia).toBeDefined();
    expect(result.opisPotwierdzenia).toEqual({
      strona: 1,
      liczbaStron: 1,
      zakresDokumentowOd: 1,
      zakresDokumentowDo: 2,
      calkowitaLiczbaDokumentow: 2,
    });
  });

  it('parses Buffer input with same result as string', () => {
    const buffer = Buffer.from(nipFakturaXml, 'utf8');
    const fromString = parseUpoXml(nipFakturaXml);
    const fromBuffer = parseUpoXml(buffer);

    expect(fromBuffer).toEqual(fromString);
  });

  it('strips namespace prefixes correctly', () => {
    // Wrap the NIP fixture with ns1: prefixes to simulate namespaced XML
    const namespacedXml = nipFakturaXml
      .replace(/<Potwierdzenie\s+xmlns="[^"]*">/,
        '<ns1:Potwierdzenie xmlns:ns1="http://upo.schematy.mf.gov.pl/KSeF/v4-3">')
      .replace('</Potwierdzenie>', '</ns1:Potwierdzenie>')
      .replace(/<NazwaPodmiotuPrzyjmujacego>/g, '<ns1:NazwaPodmiotuPrzyjmujacego>')
      .replace(/<\/NazwaPodmiotuPrzyjmujacego>/g, '</ns1:NazwaPodmiotuPrzyjmujacego>')
      .replace(/<NumerReferencyjnySesji>/g, '<ns1:NumerReferencyjnySesji>')
      .replace(/<\/NumerReferencyjnySesji>/g, '</ns1:NumerReferencyjnySesji>')
      .replace(/<Uwierzytelnienie>/g, '<ns1:Uwierzytelnienie>')
      .replace(/<\/Uwierzytelnienie>/g, '</ns1:Uwierzytelnienie>')
      .replace(/<IdKontekstu>/g, '<ns1:IdKontekstu>')
      .replace(/<\/IdKontekstu>/g, '</ns1:IdKontekstu>')
      .replace(/<Nip>/g, '<ns1:Nip>')
      .replace(/<\/Nip>/g, '</ns1:Nip>')
      .replace(/<SkrotDokumentuUwierzytelniajacego>/g, '<ns1:SkrotDokumentuUwierzytelniajacego>')
      .replace(/<\/SkrotDokumentuUwierzytelniajacego>/g, '</ns1:SkrotDokumentuUwierzytelniajacego>')
      .replace(/<NazwaStrukturyLogicznej>/g, '<ns1:NazwaStrukturyLogicznej>')
      .replace(/<\/NazwaStrukturyLogicznej>/g, '</ns1:NazwaStrukturyLogicznej>')
      .replace(/<KodFormularza>/g, '<ns1:KodFormularza>')
      .replace(/<\/KodFormularza>/g, '</ns1:KodFormularza>')
      .replace(/<Dokument>/g, '<ns1:Dokument>')
      .replace(/<\/Dokument>/g, '</ns1:Dokument>')
      .replace(/<NipSprzedawcy>/g, '<ns1:NipSprzedawcy>')
      .replace(/<\/NipSprzedawcy>/g, '</ns1:NipSprzedawcy>')
      .replace(/<NumerKSeFDokumentu>/g, '<ns1:NumerKSeFDokumentu>')
      .replace(/<\/NumerKSeFDokumentu>/g, '</ns1:NumerKSeFDokumentu>')
      .replace(/<NumerFaktury>/g, '<ns1:NumerFaktury>')
      .replace(/<\/NumerFaktury>/g, '</ns1:NumerFaktury>')
      .replace(/<DataWystawieniaFaktury>/g, '<ns1:DataWystawieniaFaktury>')
      .replace(/<\/DataWystawieniaFaktury>/g, '</ns1:DataWystawieniaFaktury>')
      .replace(/<DataPrzeslaniaDokumentu>/g, '<ns1:DataPrzeslaniaDokumentu>')
      .replace(/<\/DataPrzeslaniaDokumentu>/g, '</ns1:DataPrzeslaniaDokumentu>')
      .replace(/<DataNadaniaNumeruKSeF>/g, '<ns1:DataNadaniaNumeruKSeF>')
      .replace(/<\/DataNadaniaNumeruKSeF>/g, '</ns1:DataNadaniaNumeruKSeF>')
      .replace(/<SkrotDokumentu>/g, '<ns1:SkrotDokumentu>')
      .replace(/<\/SkrotDokumentu>/g, '</ns1:SkrotDokumentu>')
      .replace(/<TrybWysylki>/g, '<ns1:TrybWysylki>')
      .replace(/<\/TrybWysylki>/g, '</ns1:TrybWysylki>');

    const original = parseUpoXml(nipFakturaXml);
    const namespaced = parseUpoXml(namespacedXml);

    expect(namespaced).toEqual(original);
  });
});

// ── 2. Context identifier variants ──────────────────────────────────────

describe('context identifiers', () => {
  it('parses Nip context from NIP fixture', () => {
    const result = parseUpoXml(nipFakturaXml);
    expect(result.uwierzytelnienie.idKontekstu).toEqual({
      kind: 'Nip',
      nip: '5265877635',
    });
  });

  it('parses IdWewnetrzny context from internal-id fixture', () => {
    const result = parseUpoXml(internalIdFakturaXml);
    expect(result.uwierzytelnienie.idKontekstu).toEqual({
      kind: 'IdWewnetrzny',
      idWewnetrzny: '5265877635-12345',
    });
  });

  it('parses IdZlozonyVatUE context from vat-ue fixture', () => {
    const result = parseUpoXml(vatUeFakturaXml);
    expect(result.uwierzytelnienie.idKontekstu).toEqual({
      kind: 'IdZlozonyVatUE',
      idZlozonyVatUE: '5265877635-ATU12345678',
    });
  });

  it('parses IdDostawcyUslugPeppol context from peppol fixture', () => {
    const result = parseUpoXml(peppolFakturaXml);
    expect(result.uwierzytelnienie.idKontekstu).toEqual({
      kind: 'IdDostawcyUslugPeppol',
      idDostawcyUslugPeppol: 'PPL123456',
    });
  });
});

// ── 3. Auth proof variants ──────────────────────────────────────────────

describe('auth proof variants', () => {
  it('parses SkrotDokumentuUwierzytelniajacego from NIP fixture', () => {
    const result = parseUpoXml(nipFakturaXml);
    expect(result.uwierzytelnienie.proof).toEqual({
      kind: 'SkrotDokumentuUwierzytelniajacego',
      skrotDokumentuUwierzytelniajacego:
        'kyqH+QUgP8ATWd/95IY632mP4uqibwG66Oqclq9+qno=',
    });
  });

  it('parses NumerReferencyjnyTokenaKSeF from internal-id fixture', () => {
    const result = parseUpoXml(internalIdFakturaXml);
    expect(result.uwierzytelnienie.proof).toEqual({
      kind: 'NumerReferencyjnyTokenaKSeF',
      numerReferencyjnyTokenaKSeF:
        '20250819-EC-1ECDD12000-5EE71AE5E3-B7',
    });
  });
});

// ── 4. OpisPotwierdzenia ────────────────────────────────────────────────

describe('OpisPotwierdzenia', () => {
  it('is present in session NIP fixture with correct numeric values', () => {
    const result = parseUpoXml(nipSesjaXml);

    expect(result.opisPotwierdzenia).toBeDefined();
    expect(result.opisPotwierdzenia!.strona).toBe(1);
    expect(result.opisPotwierdzenia!.liczbaStron).toBe(1);
    expect(result.opisPotwierdzenia!.zakresDokumentowOd).toBe(1);
    expect(result.opisPotwierdzenia!.zakresDokumentowDo).toBe(2);
    expect(result.opisPotwierdzenia!.calkowitaLiczbaDokumentow).toBe(2);
  });

  it('is absent in single-invoice NIP fixture', () => {
    const result = parseUpoXml(nipFakturaXml);
    expect(result.opisPotwierdzenia).toBeUndefined();
  });
});

// ── 5. Validation errors ────────────────────────────────────────────────

describe('validation errors', () => {
  it('throws KSeFValidationError for missing root element', () => {
    expect(() => parseUpoXml('<NotPotwierdzenie/>')).toThrow(
      KSeFValidationError,
    );
  });

  it('throws KSeFValidationError when required document field is missing', () => {
    const modified = nipFakturaXml.replace(
      /<NumerKSeFDokumentu>[^<]*<\/NumerKSeFDokumentu>/,
      '',
    );
    expect(() => parseUpoXml(modified)).toThrow(KSeFValidationError);
    expect(() => parseUpoXml(modified)).toThrow(/Dokument\.NumerKSeFDokumentu/);
  });

  it('throws KSeFValidationError for empty string field', () => {
    const modified = nipFakturaXml.replace(
      /<NipSprzedawcy>[^<]*<\/NipSprzedawcy>/,
      '<NipSprzedawcy></NipSprzedawcy>',
    );
    expect(() => parseUpoXml(modified)).toThrow(KSeFValidationError);
    expect(() => parseUpoXml(modified)).toThrow(/Dokument\.NipSprzedawcy/);
  });

  it('throws KSeFValidationError when no Dokument elements present', () => {
    const modified = nipFakturaXml.replace(
      /<Dokument>[\s\S]*?<\/Dokument>/g,
      '',
    );
    expect(() => parseUpoXml(modified)).toThrow(KSeFValidationError);
    expect(() => parseUpoXml(modified)).toThrow(/at least one Dokument/);
  });

  it('throws KSeFValidationError for unsupported context identifier', () => {
    const modified = nipFakturaXml.replace(
      /<Nip>5265877635<\/Nip>/,
      '<UnknownId>123</UnknownId>',
    );
    expect(() => parseUpoXml(modified)).toThrow(KSeFValidationError);
    expect(() => parseUpoXml(modified)).toThrow(/Unsupported context identifier/);
  });

  it('throws KSeFValidationError for invalid numeric in OpisPotwierdzenia', () => {
    const modified = nipSesjaXml.replace(
      /<Strona>1<\/Strona>/,
      '<Strona>abc</Strona>',
    );
    expect(() => parseUpoXml(modified)).toThrow(KSeFValidationError);
    expect(() => parseUpoXml(modified)).toThrow(/OpisPotwierdzenia\.Strona/);
  });
});

// ── 6. Array normalization ──────────────────────────────────────────────

describe('array normalization', () => {
  it('normalizes single Dokument to array of 1', () => {
    const result = parseUpoXml(nipFakturaXml);
    expect(Array.isArray(result.dokumenty)).toBe(true);
    expect(result.dokumenty).toHaveLength(1);
  });

  it('normalizes multiple Dokument elements to array of N', () => {
    const result = parseUpoXml(nipSesjaXml);
    expect(Array.isArray(result.dokumenty)).toBe(true);
    expect(result.dokumenty).toHaveLength(2);

    // Verify both documents have distinct KSeF numbers
    expect(result.dokumenty[0].numerKSeFDokumentu).toBe(
      '5265877635-20250916-010040741B3E-46',
    );
    expect(result.dokumenty[1].numerKSeFDokumentu).toBe(
      '5265877635-20250916-0200A0D6723E-C2',
    );
  });
});
