import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  validateWellFormedness,
  validateSchema,
  validateBusinessRules,
  validate,
  validateBatch,
  batchValidationDetails,
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

  it('passes with valid PESEL', () => {
    const xml = `<tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/">
      <Podmiot2><PESEL>44051401458</PESEL></Podmiot2>
    </tns:Faktura>`;
    const result = validateBusinessRules(xml);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
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

// ─── Date validation ───────────────────────────────────────────────────────

describe('validateBusinessRules – P_1 future date', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const makeXml = (p1: string) => `<tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/">
    <Podmiot1><NIP>5213003700</NIP></Podmiot1>
    <Fa><P_1>${p1}</P_1></Fa>
  </tns:Faktura>`;

  it('accepts P_1 = today', () => {
    vi.useFakeTimers({ now: new Date('2026-06-15T12:00:00Z') });
    const result = validateBusinessRules(makeXml('2026-06-15'));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts P_1 in the past', () => {
    vi.useFakeTimers({ now: new Date('2026-06-15T12:00:00Z') });
    const result = validateBusinessRules(makeXml('2026-06-14'));
    expect(result.valid).toBe(true);
  });

  it('rejects P_1 in the future', () => {
    vi.useFakeTimers({ now: new Date('2026-06-15T12:00:00Z') });
    const result = validateBusinessRules(makeXml('2026-06-16'));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.code).toBe('FUTURE_INVOICE_DATE');
    expect(result.errors[0]!.path).toBe('/Faktura/Fa/P_1');
    expect(result.errors[0]!.message).toContain('2026-06-16');
  });

  it('uses Poland time, not UTC — late CEST evening (23:30 CEST = 21:30 UTC)', () => {
    vi.useFakeTimers({ now: new Date('2026-06-15T21:30:00Z') });
    const result = validateBusinessRules(makeXml('2026-06-15'));
    expect(result.valid).toBe(true);
  });

  it('uses Poland time, not UTC — just after CEST midnight (00:30 CEST = 22:30 UTC prev day)', () => {
    // 2026-06-15T22:30:00Z = 2026-06-16T00:30:00+02:00 (CEST)
    // Poland date = June 16, UTC date = June 15
    vi.useFakeTimers({ now: new Date('2026-06-15T22:30:00Z') });
    const result = validateBusinessRules(makeXml('2026-06-16'));
    expect(result.valid).toBe(true);
  });

  it('uses Poland time, not UTC — rejects future date even when UTC is previous day', () => {
    // 2026-06-15T22:30:00Z = 2026-06-16T00:30:00+02:00 (CEST)
    vi.useFakeTimers({ now: new Date('2026-06-15T22:30:00Z') });
    const result = validateBusinessRules(makeXml('2026-06-17'));
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.code).toBe('FUTURE_INVOICE_DATE');
  });

  it('handles CET winter time — just after midnight (00:30 CET = 23:30 UTC prev day)', () => {
    // 2026-01-15T23:30:00Z = 2026-01-16T00:30:00+01:00 (CET)
    vi.useFakeTimers({ now: new Date('2026-01-15T23:30:00Z') });
    const result = validateBusinessRules(makeXml('2026-01-16'));
    expect(result.valid).toBe(true);
  });

  it('does not check DataWytworzeniaFa (not validated by KSeF)', () => {
    vi.useFakeTimers({ now: new Date('2026-06-15T12:00:00Z') });
    // Future DataWytworzeniaFa but valid P_1 — should pass
    const xml = `<tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/">
      <Naglowek><DataWytworzeniaFa>2099-12-31T00:00:00Z</DataWytworzeniaFa></Naglowek>
      <Podmiot1><NIP>5213003700</NIP></Podmiot1>
      <Fa><P_1>2026-06-15</P_1></Fa>
    </tns:Faktura>`;
    const result = validateBusinessRules(xml);
    expect(result.valid).toBe(true);
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

  it('short-circuits on Level 1a char-validity failure with XML_PROCESSING_INSTRUCTION', async () => {
    const xml = '<?xml version="1.0"?><?xml-stylesheet href="x"?><tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/"/>';
    const result = await validate(xml);
    expect(result.valid).toBe(false);
    expect(result.schemaType).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.code).toBe('XML_PROCESSING_INSTRUCTION');
  });

  it('skipCharValidity: true bypasses Level 1a and continues into schema detection', async () => {
    const xml = '<?xml version="1.0"?><?xml-stylesheet href="x"?><tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/"/>';
    const result = await validate(xml, { skipCharValidity: true });
    // L1a skipped → L1 well-formedness passes → L2 schema detection picks up
    // FA3 from the namespace, then the near-empty Faktura body triggers L2
    // structural failures. The PI must not surface, and the pipeline must
    // have progressed past char validity.
    expect(result.valid).toBe(false);
    expect(result.schemaType).toBe('FA3');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every(e => e.code !== 'XML_PROCESSING_INSTRUCTION')).toBe(true);
  });

  it('does not emit schema errors when Level 1a fails (short-circuit before L2)', async () => {
    // PI + unrecognized root element. Only PI error should surface; schema detection must be short-circuited.
    const xml = '<?xml version="1.0"?><?xml-stylesheet href="x"?><Unknown/>';
    const result = await validate(xml);
    expect(result.valid).toBe(false);
    expect(result.schemaType).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.code).toBe('XML_PROCESSING_INSTRUCTION');
  });
});

// ─── Business rules: nested NIP/PESEL array recursion ─────────────────

describe('validateBusinessRules — nested array recursion', () => {
  it('walks into arrays of objects and reports the index in the path', () => {
    // Typical shape: a list of Podmiot3 entries, each with its own NIP.
    // The second entry carries a bad checksum — the error path must carry
    // the `/1` index so the reviewer can find the exact offender.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>2025-01-15T10:00:00</DataWytworzeniaFa>
  </Naglowek>
  <Podmiot1>
    <NIP>5213003700</NIP>
  </Podmiot1>
  <Podmiot3>
    <DaneIdentyfikacyjne>
      <NIP>5213003700</NIP>
    </DaneIdentyfikacyjne>
  </Podmiot3>
  <Podmiot3>
    <DaneIdentyfikacyjne>
      <NIP>1111111112</NIP>
    </DaneIdentyfikacyjne>
  </Podmiot3>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2025-01-15</P_1>
    <P_2>FV/1</P_2>
    <P_15>100.00</P_15>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>x</P_7>
      <P_12>23</P_12>
    </FaWiersz>
  </Fa>
</tns:Faktura>`;
    const result = validateBusinessRules(xml);
    expect(result.valid).toBe(false);
    const nipErrors = result.errors.filter(e => e.code === 'INVALID_NIP_CHECKSUM');
    expect(nipErrors.length).toBeGreaterThan(0);
    // Pin the exact path — the `/1` index is what proves the array
    // recursion is threading the element index into the error path, not
    // merely walking the object tree by key name.
    expect(nipErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/Faktura/Podmiot3/1/DaneIdentyfikacyjne/NIP',
        }),
      ]),
    );
  });
});

// ─── Batch validation: iteration + detail formatting ──────────────────

describe('validateBatch + batchValidationDetails', () => {
  it('preserves per-file results and flattens error details for invalid files', async () => {
    // Two malformed files — different failure modes, both surface in batchValidationDetails.
    // (Full MINIMAL_FA3_XML passes L1 but may fail L2/L3 schema checks; we keep
    // this focused on the batch-iteration mechanics rather than schema specifics.)
    const batch = await validateBatch([
      { fileName: 'malformed-a.xml', xml: '<Faktura><unclosed></Faktura>' },
      { fileName: 'malformed-b.xml', xml: '' },
    ]);

    expect(batch.valid).toBe(false);
    expect(batch.results).toHaveLength(2);
    expect(batch.results[0]!.result.valid).toBe(false);
    expect(batch.results[1]!.result.valid).toBe(false);

    const details = batchValidationDetails(batch);
    expect(details.length).toBeGreaterThan(0);
    // Every detail's `field` begins with one of the source file names.
    const aDetails = details.filter(d => d.field?.startsWith('malformed-a.xml'));
    const bDetails = details.filter(d => d.field?.startsWith('malformed-b.xml'));
    expect(aDetails.length).toBeGreaterThan(0);
    expect(bDetails.length).toBeGreaterThan(0);
  });

  it('uses the bare file name when the underlying error has no path', async () => {
    // Well-formedness failure without a `path` on the error record — details
    // field collapses to just the file name (covers the
    // `e.path ? ... : r.fileName` ternary in batchValidationDetails).
    const batch = await validateBatch([
      { fileName: 'broken.xml', xml: '' },
    ]);
    const details = batchValidationDetails(batch);
    expect(details.length).toBeGreaterThan(0);
    expect(details.some(d => d.field === 'broken.xml')).toBe(true);
  });

  it('formats path-bearing errors as "fileName:path"', () => {
    // Feed a hand-crafted BatchValidationResult so we exercise the non-empty
    // `e.path` branch of the ternary directly (real validate() outputs that
    // include a `path` also exist, but testing through the full pipeline
    // adds avoidable coupling).
    const pathDetails = batchValidationDetails({
      valid: false,
      results: [
        {
          fileName: 'pathful.xml',
          result: {
            valid: false,
            schemaType: 'FA3',
            errors: [
              {
                code: 'INVALID_NIP_CHECKSUM',
                message: 'Bad NIP',
                path: '/Faktura/Podmiot1/NIP',
              },
            ],
          },
        },
      ],
    } as Parameters<typeof batchValidationDetails>[0]);
    expect(pathDetails).toContainEqual({
      field: 'pathful.xml:/Faktura/Podmiot1/NIP',
      message: 'Bad NIP',
    });
  });
});
