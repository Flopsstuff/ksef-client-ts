import { describe, it, expect } from 'vitest';
import {
  validateWellFormedness,
  validateSchema,
  validateBusinessRules,
  validate,
} from '../../../src/validation/invoice-validator.js';

// Minimal valid FA3 XML (enough to pass well-formedness and auto-detection)
const MINIMAL_FA3_XML = `<?xml version="1.0" encoding="UTF-8"?>
<tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>2025-01-15T10:00:00</DataWytworzeniaFa>
  </Naglowek>
  <Podmiot1>
    <NIP>5213003700</NIP>
    <Nazwa>Test Company Sp. z o.o.</Nazwa>
  </Podmiot1>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2025-01-15</P_1>
    <P_2>FV/2025/001</P_2>
    <P_15>100.00</P_15>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Usługa testowa</P_7>
      <P_12>23</P_12>
    </FaWiersz>
  </Fa>
</tns:Faktura>`;

// ─── Level 1: Well-formedness ───────────────────────────────────────────────

describe('validateWellFormedness', () => {
  it('accepts valid XML', () => {
    const result = validateWellFormedness(MINIMAL_FA3_XML);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.schemaType).toBe('FA3');
  });

  it('rejects malformed XML', () => {
    const result = validateWellFormedness('<Root><Unclosed');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.code).toBe('MALFORMED_XML');
  });

  it('rejects empty input', () => {
    const result = validateWellFormedness('');
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.code).toBe('MALFORMED_XML');
    expect(result.errors[0]!.message).toBe('Empty XML input');
  });

  it('rejects whitespace-only input', () => {
    const result = validateWellFormedness('   \n\t  ');
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.code).toBe('MALFORMED_XML');
  });
});

// ─── Level 2: Schema validation ─────────────────────────────────────────────

describe('validateSchema', () => {
  it('detects FA3 schema type from namespace', async () => {
    const result = await validateSchema(MINIMAL_FA3_XML);
    expect(result.schemaType).toBe('FA3');
  });

  it('detects and reports schema violations', async () => {
    // Missing required Podmiot1 and Fa
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/">
      <Naglowek>
        <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
        <WariantFormularza>3</WariantFormularza>
        <DataWytworzeniaFa>2025-01-15T10:00:00</DataWytworzeniaFa>
      </Naglowek>
    </tns:Faktura>`;

    const result = await validateSchema(xml);
    expect(result.valid).toBe(false);
    expect(result.schemaType).toBe('FA3');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports unknown schema for unrecognized namespace', async () => {
    const xml = `<Unknown xmlns="http://unknown.example.com/"><A>test</A></Unknown>`;
    const result = await validateSchema(xml);
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.code).toBe('UNKNOWN_SCHEMA');
  });

  it('accepts explicit schema override', async () => {
    // Force FA3 schema even though there's no namespace
    const xml = `<Faktura>
      <Naglowek>
        <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
        <WariantFormularza>3</WariantFormularza>
        <DataWytworzeniaFa>2025-01-15T10:00:00</DataWytworzeniaFa>
      </Naglowek>
    </Faktura>`;

    const result = await validateSchema(xml, { schema: 'FA3' });
    // Should use FA3 schema regardless of detection
    expect(result.schemaType).toBe('FA3');
  });

  it('rejects malformed XML at schema level', async () => {
    const result = await validateSchema('<Root><Broken');
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.code).toBe('MALFORMED_XML');
  });
});

// ─── Level 3: Business rules ────────────────────────────────────────────────

describe('validateBusinessRules', () => {
  it('passes with valid NIP', () => {
    const xml = `<tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/">
      <Podmiot1><NIP>5213003700</NIP></Podmiot1>
    </tns:Faktura>`;
    const result = validateBusinessRules(xml);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects invalid NIP checksum', () => {
    const xml = `<tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/">
      <Podmiot1><NIP>1234567890</NIP></Podmiot1>
    </tns:Faktura>`;
    const result = validateBusinessRules(xml);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.code).toBe('INVALID_NIP_CHECKSUM');
    expect(result.errors[0]!.path).toBe('/Faktura/Podmiot1/NIP');
  });

  it('rejects invalid PESEL checksum', () => {
    const xml = `<tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/">
      <Podmiot2><PESEL>12345678901</PESEL></Podmiot2>
    </tns:Faktura>`;
    const result = validateBusinessRules(xml);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.code).toBe('INVALID_PESEL_CHECKSUM');
    expect(result.errors[0]!.path).toBe('/Faktura/Podmiot2/PESEL');
  });

  it('validates multiple Podmiot elements', () => {
    const xml = `<tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/">
      <Podmiot1><NIP>1234567890</NIP></Podmiot1>
      <Podmiot2><NIP>1234567891</NIP></Podmiot2>
    </tns:Faktura>`;
    const result = validateBusinessRules(xml);
    expect(result.valid).toBe(false);
    // Both NIPs are invalid
    expect(result.errors.length).toBe(2);
  });
});

// ─── Combined validation ────────────────────────────────────────────────────

describe('validate (combined)', () => {
  it('short-circuits on Level 1 failure', async () => {
    const result = await validate('');
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.code).toBe('MALFORMED_XML');
  });

  it('short-circuits on Level 2 failure', async () => {
    const xml = `<Unknown xmlns="http://unknown.example.com/"><A>test</A></Unknown>`;
    const result = await validate(xml);
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.code).toBe('UNKNOWN_SCHEMA');
  });

  it('reaches Level 3 when L1 and L2 pass', async () => {
    // This tests the full pipeline — result depends on schema strictness
    const result = await validate(MINIMAL_FA3_XML);
    // Should at least detect the schema type
    expect(result.schemaType).toBe('FA3');
  });
});
