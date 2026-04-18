import { describe, it, expect } from 'vitest';
import { serializeInvoiceXml } from '../../../src/xml/invoice-serializer.js';
import { parseXml } from '../../../src/xml/xml-engine.js';
import { KSeFValidationError } from '../../../src/errors/ksef-validation-error.js';
import type { FakturaInput } from '../../../src/xml/types.js';
import type { FormCode } from '../../../src/models/common.js';

// ── Fixtures ────────────────────────────────────────────────────────────

function minimalFaktura(overrides: Partial<FakturaInput> = {}): FakturaInput {
  return {
    Naglowek: {
      KodFormularza: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' } as FormCode,
      WariantFormularza: 3,
      DataWytworzeniaFa: '2026-04-18T00:00:00Z',
    },
    Podmiot1: { DaneIdentyfikacyjne: { NIP: '1234567890', Nazwa: 'S' } },
    Fa: { KodWaluty: 'PLN', P_1: '2026-04-18', P_2: 'FA/2026/001' },
    ...overrides,
  };
}

// ── Polymorphic dispatch ────────────────────────────────────────────────

describe('serializeInvoiceXml — polymorphic dispatch', () => {
  it('returns a Buffer for string input', () => {
    const out = serializeInvoiceXml('<Faktura/>');
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.toString('utf8')).toBe('<Faktura/>');
  });

  it('returns a Buffer for Buffer input', () => {
    const input = Buffer.from('<Faktura/>', 'utf8');
    const out = serializeInvoiceXml(input);
    expect(Buffer.isBuffer(out)).toBe(true);
  });

  it('returns a Buffer for pre-parsed XmlDocument input', () => {
    const doc = parseXml('<Root><A>1</A></Root>');
    const out = serializeInvoiceXml(doc);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.toString('utf8')).toContain('<Root>');
    expect(out.toString('utf8')).toContain('<A>1</A>');
  });

  it('returns a Buffer for FakturaInput with <Faktura> root', () => {
    const out = serializeInvoiceXml(minimalFaktura(), { schema: 'FA3' });
    expect(Buffer.isBuffer(out)).toBe(true);
    const xml = out.toString('utf8');
    expect(xml).toContain('<Faktura');
    expect(xml).toContain('xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"');
    expect(xml).toContain('</Faktura>');
  });

  it('returns a Buffer for PefUblDocumentInput (Invoice)', () => {
    const out = serializeInvoiceXml({ Invoice: { ID: 'INV' } });
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.toString('utf8')).toContain(
      'xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
    );
  });

  it('returns a Buffer for PefUblDocumentInput (CreditNote)', () => {
    const out = serializeInvoiceXml({ CreditNote: { ID: 'CN' } });
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.toString('utf8')).toContain(
      'xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"',
    );
  });
});

// ── BOM stripping + Buffer pass-through ─────────────────────────────────

describe('serializeInvoiceXml — BOM and Buffer pass-through', () => {
  it('strips leading UTF-8 BOM from a string input', () => {
    const out = serializeInvoiceXml('\uFEFF<Faktura/>');
    // First bytes must be the literal '<Faktura/>', no BOM (EF BB BF).
    expect(out[0]).toBe(0x3c); // '<'
    expect(out.toString('utf8')).toBe('<Faktura/>');
    expect(out.toString('utf8').charCodeAt(0)).not.toBe(0xfeff);
  });

  it('does not strip BOM from Buffer inputs (byte-for-byte pass-through)', () => {
    const bomBytes = Buffer.from([0xef, 0xbb, 0xbf]);
    const body = Buffer.from('<Faktura/>', 'utf8');
    const input = Buffer.concat([bomBytes, body]);
    const out = serializeInvoiceXml(input);
    expect(out.equals(input)).toBe(true);
  });

  it('returns Buffer bytes unchanged (byte-for-byte)', () => {
    const input = Buffer.from('<Faktura><A>1</A></Faktura>', 'utf8');
    const out = serializeInvoiceXml(input);
    expect(out).toBe(input); // Same reference — impl is `return input`.
    expect(out.equals(input)).toBe(true);
  });

  it('encodes non-BOM string input as UTF-8', () => {
    const out = serializeInvoiceXml('<Fa>ąźół</Fa>');
    expect(out.toString('utf8')).toBe('<Fa>ąźół</Fa>');
  });
});

// ── Unknown-shape validation ────────────────────────────────────────────

describe('serializeInvoiceXml — unknown-shape validation', () => {
  it('throws KSeFValidationError and names Naglowek when a Faktura-like object is missing it', () => {
    try {
      serializeInvoiceXml({
        Podmiot1: { DaneIdentyfikacyjne: { NIP: '1' } },
        Fa: { P_1: '2026-04-18' },
      } as unknown as FakturaInput);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(KSeFValidationError);
      expect((err as Error).message).toMatch(/Naglowek/);
    }
  });

  it('throws KSeFValidationError and names Fa when a Faktura-like object is missing it', () => {
    try {
      serializeInvoiceXml({
        Naglowek: { WariantFormularza: 3 },
        Podmiot1: {},
      } as unknown as FakturaInput);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(KSeFValidationError);
      expect((err as Error).message).toMatch(/Fa/);
    }
  });

  it('throws KSeFValidationError when both Invoice and CreditNote are present', () => {
    try {
      serializeInvoiceXml({ Invoice: { ID: '1' }, CreditNote: { ID: '2' } });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(KSeFValidationError);
      expect((err as Error).message).toMatch(/Invoice/);
      expect((err as Error).message).toMatch(/CreditNote/);
    }
  });

  it('throws KSeFValidationError for an object that matches neither shape', () => {
    expect(() => serializeInvoiceXml({ Unknown: 'x' })).toThrow(KSeFValidationError);
  });

  it('accepts a Faktura-shaped object and dispatches to buildFakturaXml', () => {
    const out = serializeInvoiceXml({
      Naglowek: { WariantFormularza: 3 },
      Podmiot1: {},
      Fa: { P_1: '2026-04-18' },
    } as unknown as FakturaInput);
    expect(Buffer.isBuffer(out)).toBe(true);
    const xml = out.toString('utf8');
    expect(xml).toContain('<Faktura');
    expect(xml).toContain('</Faktura>');
  });
});

// ── Normalization: undefined / null / arrays ────────────────────────────

describe('serializeInvoiceXml — value normalization', () => {
  it('omits keys with undefined values', () => {
    const input = minimalFaktura({
      Fa: {
        KodWaluty: 'PLN',
        P_1: '2026-04-18',
        P_6: undefined as unknown as string,
        P_2: 'FA/1',
      },
    });
    const xml = serializeInvoiceXml(input, { schema: 'FA3' }).toString('utf8');
    expect(xml).toContain('<P_1>2026-04-18</P_1>');
    expect(xml).toContain('<P_2>FA/1</P_2>');
    expect(xml).not.toContain('<P_6');
    expect(xml).not.toContain('</P_6>');
  });

  it('renders null values as empty self-closing elements', () => {
    const input = minimalFaktura({
      Fa: {
        P_1: '2026-04-18',
        P_2: 'FA/1',
        // `null` → empty element per spec.
        P_6: null,
      },
    });
    const xml = serializeInvoiceXml(input, { schema: 'FA3' }).toString('utf8');
    // fast-xml-parser renders null as either <P_6/> or <P_6></P_6>; both are acceptable.
    expect(xml).toMatch(/<P_6\s*\/>|<P_6><\/P_6>/);
  });

  it('renders array values as repeated elements in input order', () => {
    const input = minimalFaktura({
      Fa: {
        KodWaluty: 'PLN',
        P_1: '2026-04-18',
        P_2: 'FA/1',
        FaWiersz: [
          { NrWierszaFa: '1', P_7: 'alpha' },
          { NrWierszaFa: '2', P_7: 'beta' },
        ],
      },
    });
    const xml = serializeInvoiceXml(input, { schema: 'FA3' }).toString('utf8');
    const matches = xml.match(/<FaWiersz>/g) ?? [];
    expect(matches).toHaveLength(2);
    expect(xml.indexOf('alpha')).toBeGreaterThan(-1);
    expect(xml.indexOf('alpha')).toBeLessThan(xml.indexOf('beta'));
  });
});

// ── Determinism ─────────────────────────────────────────────────────────

describe('serializeInvoiceXml — determinism', () => {
  it('produces byte-identical output on repeated calls with same input', () => {
    const input = minimalFaktura();
    const a = serializeInvoiceXml(input, { schema: 'FA3' });
    const b = serializeInvoiceXml(input, { schema: 'FA3' });
    expect(a.equals(b)).toBe(true);
  });

  it('produces byte-identical output for equivalent inputs with different key order', () => {
    const a = serializeInvoiceXml(minimalFaktura(), { schema: 'FA3' });
    const reshuffled: FakturaInput = {
      Fa: { P_2: 'FA/2026/001', KodWaluty: 'PLN', P_1: '2026-04-18' },
      Podmiot1: { DaneIdentyfikacyjne: { Nazwa: 'S', NIP: '1234567890' } },
      Naglowek: {
        DataWytworzeniaFa: '2026-04-18T00:00:00Z',
        WariantFormularza: 3,
        KodFormularza: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' } as FormCode,
      },
    };
    const b = serializeInvoiceXml(reshuffled, { schema: 'FA3' });
    expect(a.equals(b)).toBe(true);
  });
});
