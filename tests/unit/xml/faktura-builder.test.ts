import { describe, it, expect } from 'vitest';
import {
  buildFakturaXml,
  isFakturaInput,
  toKodFormularza,
  FAKTURA_NAMESPACE,
  ETD_NAMESPACE,
} from '../../../src/xml/faktura-builder.js';
import type { FakturaInput } from '../../../src/xml/types.js';
import type { FormCode } from '../../../src/models/common.js';

// ── Minimal fixtures ───────────────────────────────────────────────────

function minimalFa3(overrides: Partial<FakturaInput> = {}): FakturaInput {
  return {
    Naglowek: {
      KodFormularza: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' } as FormCode,
      WariantFormularza: 3,
      DataWytworzeniaFa: '2026-04-18T00:00:00Z',
    },
    Podmiot1: {
      DaneIdentyfikacyjne: { NIP: '1234567890', Nazwa: 'Sprzedawca Sp. z o.o.' },
    },
    Fa: {
      KodWaluty: 'PLN',
      P_1: '2026-04-18',
      P_2: 'FA/2026/001',
      P_15: '1000.00',
    },
    ...overrides,
  };
}

function minimalFa2(): FakturaInput {
  return {
    Naglowek: {
      KodFormularza: { systemCode: 'FA (2)', schemaVersion: '1-0E', value: 'FA' } as FormCode,
      WariantFormularza: 2,
      DataWytworzeniaFa: '2026-04-18T00:00:00Z',
    },
    Podmiot1: { DaneIdentyfikacyjne: { NIP: '1234567890', Nazwa: 'S' } },
    Fa: { KodWaluty: 'PLN', P_1: '2026-04-18', P_2: 'FA/2' },
  };
}

// ── Namespace injection ─────────────────────────────────────────────────

describe('buildFakturaXml — namespace injection', () => {
  it('injects FA3 default namespaces on <Faktura> root', () => {
    const xml = buildFakturaXml(minimalFa3(), { schema: 'FA3' });
    expect(xml).toContain(`xmlns="${FAKTURA_NAMESPACE.FA3}"`);
    expect(xml).toContain(`xmlns:etd="${ETD_NAMESPACE.FA3}"`);
    expect(xml).toContain('xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"');
    expect(xml).toContain(
      'xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/"',
    );
  });

  it('injects FA2 default namespaces on <Faktura> root and does NOT leak FA3 URIs', () => {
    const xml = buildFakturaXml(minimalFa2(), { schema: 'FA2' });
    expect(xml).toContain(`xmlns="${FAKTURA_NAMESPACE.FA2}"`);
    expect(xml).toContain(`xmlns:etd="${ETD_NAMESPACE.FA2}"`);
    // Exclusivity check — mirror of the FA3 override test at line 76.
    expect(xml).not.toContain(FAKTURA_NAMESPACE.FA3);
    expect(xml).not.toContain(ETD_NAMESPACE.FA3);
  });

  it('defaults to FA3 namespaces when schema is not specified', () => {
    const xml = buildFakturaXml(minimalFa3());
    expect(xml).toContain(`xmlns="${FAKTURA_NAMESPACE.FA3}"`);
  });

  it('allows explicit fakturaNamespace override', () => {
    const xml = buildFakturaXml(minimalFa3(), {
      schema: 'FA3',
      fakturaNamespace: 'http://example/custom',
    });
    expect(xml).toContain('xmlns="http://example/custom"');
    expect(xml).not.toContain(`xmlns="${FAKTURA_NAMESPACE.FA3}"`);
  });

  it('allows explicit etdNamespace override', () => {
    const xml = buildFakturaXml(minimalFa3(), {
      schema: 'FA3',
      etdNamespace: 'http://example/etd',
    });
    expect(xml).toContain('xmlns:etd="http://example/etd"');
    expect(xml).not.toContain(`xmlns:etd="${ETD_NAMESPACE.FA3}"`);
  });
});

// ── KodFormularza rendering ─────────────────────────────────────────────

describe('buildFakturaXml — KodFormularza / FormCode', () => {
  it('renders KodFormularza with both attributes and text content', () => {
    const xml = buildFakturaXml(minimalFa3(), { schema: 'FA3' });
    expect(xml).toContain(
      '<KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>',
    );
  });

  it('toKodFormularza maps { systemCode, schemaVersion, value } to xml attribute shape', () => {
    const obj = toKodFormularza({ systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' });
    expect(obj).toEqual({
      '@_kodSystemowy': 'FA (3)',
      '@_wersjaSchemy': '1-0E',
      '#text': 'FA',
    });
  });
});

// ── ORDER_MAP + multi-rate interleave ───────────────────────────────────

describe('buildFakturaXml — element ordering', () => {
  it('emits P_* children of Fa in numeric order, not input order', () => {
    const input = minimalFa3({
      Fa: {
        P_15: '1000',
        P_13_10: 'ten',
        P_13_2: 'two',
        P_13_1: 'one',
        P_2: 'FA/2026/001',
        P_1: '2026-04-18',
      },
    });
    const xml = buildFakturaXml(input, { schema: 'FA3' });
    const order = ['P_1', 'P_2', 'P_13_1', 'P_13_2', 'P_13_10', 'P_15'];
    for (let i = 0; i + 1 < order.length; i += 1) {
      const a = xml.indexOf(`<${order[i]}>`);
      const b = xml.indexOf(`<${order[i + 1]}>`);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(b);
    }
  });

  it('multi-rate interleave: P_13_1, P_14_1, P_14_1W, P_13_2, P_14_2, P_13_6_1, P_15', () => {
    // The scenario from the spec — this is the smekcio TS d1ec8fe regression test.
    const input = minimalFa3({
      Fa: {
        P_15: '1500.00',
        P_13_6_1: '6-1',
        P_13_2: '100',
        P_14_1W: '23W',
        P_14_1: '23',
        P_13_1: '500',
        P_14_2: '46',
      },
    });
    const xml = buildFakturaXml(input, { schema: 'FA3' });
    const expectedOrder = [
      'P_13_1',
      'P_14_1',
      'P_14_1W',
      'P_13_2',
      'P_14_2',
      'P_13_6_1',
      'P_15',
    ];
    const positions = expectedOrder.map((key) => xml.indexOf(`<${key}>`));
    for (const pos of positions) expect(pos).toBeGreaterThanOrEqual(0);
    for (let i = 0; i + 1 < positions.length; i += 1) {
      expect(positions[i]).toBeLessThan(positions[i + 1]);
    }
  });

  it('appends unknown custom key (not in ORDER_MAP, not matching P_*) last in its parent', () => {
    const input = minimalFa3({
      Fa: {
        MyCustomKey: 'custom',
        P_1: '2026-04-18',
        P_2: 'FA/2026/001',
      },
    });
    const xml = buildFakturaXml(input, { schema: 'FA3' });
    // P_1 and P_2 are in ORDER_MAP — they come first. MyCustomKey comes last.
    expect(xml).toContain('<MyCustomKey>custom</MyCustomKey>');
    const p1 = xml.indexOf('<P_1>');
    const p2 = xml.indexOf('<P_2>');
    const custom = xml.indexOf('<MyCustomKey>');
    expect(p1).toBeLessThan(p2);
    expect(p2).toBeLessThan(custom);
  });
});

// ── Deterministic output / key-order invariance ─────────────────────────

describe('buildFakturaXml — deterministic output', () => {
  it('produces byte-identical output on repeated calls with same input', () => {
    const input = minimalFa3();
    const a = buildFakturaXml(input, { schema: 'FA3' });
    const b = buildFakturaXml(input, { schema: 'FA3' });
    expect(a).toBe(b);
  });

  it('produces byte-identical output for equivalent inputs with different key order', () => {
    const xmlA = buildFakturaXml(minimalFa3(), { schema: 'FA3' });
    const reshuffled: FakturaInput = {
      Fa: {
        P_15: '1000.00',
        P_2: 'FA/2026/001',
        P_1: '2026-04-18',
        KodWaluty: 'PLN',
      },
      Podmiot1: {
        DaneIdentyfikacyjne: { Nazwa: 'Sprzedawca Sp. z o.o.', NIP: '1234567890' },
      },
      Naglowek: {
        DataWytworzeniaFa: '2026-04-18T00:00:00Z',
        WariantFormularza: 3,
        KodFormularza: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' } as FormCode,
      },
    };
    const xmlB = buildFakturaXml(reshuffled, { schema: 'FA3' });
    expect(xmlA).toBe(xmlB);
  });
});

// ── Array repetition ────────────────────────────────────────────────────

describe('buildFakturaXml — array repetition', () => {
  it('renders FaWiersz array as multiple <FaWiersz> elements in input order', () => {
    const input = minimalFa3({
      Fa: {
        P_1: '2026-04-18',
        P_2: 'FA/2026/001',
        FaWiersz: [
          { NrWierszaFa: '1', P_7: 'row-1' },
          { NrWierszaFa: '2', P_7: 'row-2' },
          { NrWierszaFa: '3', P_7: 'row-3' },
        ],
      },
    });
    const xml = buildFakturaXml(input, { schema: 'FA3' });
    const matches = xml.match(/<FaWiersz>/g) ?? [];
    expect(matches).toHaveLength(3);
    // Array order preserved — row-1 before row-2 before row-3.
    const r1 = xml.indexOf('row-1');
    const r2 = xml.indexOf('row-2');
    const r3 = xml.indexOf('row-3');
    expect(r1).toBeGreaterThan(-1);
    expect(r1).toBeLessThan(r2);
    expect(r2).toBeLessThan(r3);
  });
});

// ── Shape guard ─────────────────────────────────────────────────────────

describe('isFakturaInput', () => {
  it('returns true for objects with Naglowek and Fa', () => {
    expect(isFakturaInput({ Naglowek: {}, Fa: {} })).toBe(true);
    expect(isFakturaInput(minimalFa3())).toBe(true);
  });

  it('returns false when Naglowek or Fa are missing', () => {
    expect(isFakturaInput({ Naglowek: {} })).toBe(false);
    expect(isFakturaInput({ Fa: {} })).toBe(false);
    expect(isFakturaInput({ Podmiot1: {} })).toBe(false);
  });

  it('returns false for non-object / array / null inputs', () => {
    expect(isFakturaInput(null)).toBe(false);
    expect(isFakturaInput(undefined)).toBe(false);
    expect(isFakturaInput('<Faktura/>')).toBe(false);
    expect(isFakturaInput([])).toBe(false);
  });

  // Tight check: presence alone is not enough — malformed values like
  // `Naglowek: 'x'` used to pass and produce broken XML at XSD time.
  it('returns false when Naglowek or Fa values are not non-array objects', () => {
    expect(isFakturaInput({ Naglowek: 'x', Fa: {} })).toBe(false);
    expect(isFakturaInput({ Naglowek: {}, Fa: 1 })).toBe(false);
    expect(isFakturaInput({ Naglowek: null, Fa: {} })).toBe(false);
    expect(isFakturaInput({ Naglowek: {}, Fa: null })).toBe(false);
    expect(isFakturaInput({ Naglowek: [], Fa: {} })).toBe(false);
    expect(isFakturaInput({ Naglowek: {}, Fa: [] })).toBe(false);
  });
});

// ── Builder namespaces override payload ────────────────────────────────
//
// Regression pin for the symmetric PEF behaviour: a caller cannot shadow
// the FA2/FA3 xmlns / xmlns:etd attrs by slipping `@_xmlns` into the input
// via the index signature. `options.fakturaNamespace` / `etdNamespace` are
// the supported override path.

describe('buildFakturaXml — builder namespaces override payload', () => {
  it('ignores @_xmlns in payload and emits canonical FA3 namespace', () => {
    const fa = minimalFa3() as FakturaInput & Record<string, string>;
    fa['@_xmlns'] = 'http://evil.example/override';
    fa['@_xmlns:etd'] = 'http://evil.example/override-etd';
    const xml = buildFakturaXml(fa);
    expect(xml).toContain(`xmlns="${FAKTURA_NAMESPACE.FA3}"`);
    expect(xml).toContain(`xmlns:etd="${ETD_NAMESPACE.FA3}"`);
    expect(xml).not.toContain('http://evil.example/override');
  });
});

// ── null vs undefined rendering ────────────────────────────────────────
//
// Pins the contract documented in docs/xml-serialization.md ("null vs
// undefined"): `undefined` values are omitted from the output, `null`
// renders as a self-closing empty element. Catches a fast-xml-parser
// version/config drift where `suppressEmptyNode` or null-handling would
// silently change the emitted shape.

describe('buildFakturaXml — null vs undefined rendering', () => {
  it('omits `undefined` child elements entirely', () => {
    const xml = buildFakturaXml(minimalFa3({ Fa: { P_1: '2026-04-18', P_2: 'X', P_15: undefined } }));
    expect(xml).not.toContain('<P_15');
  });

  it('renders `null` child elements as self-closing empty elements', () => {
    const xml = buildFakturaXml(minimalFa3({ Fa: { P_1: '2026-04-18', P_2: 'X', P_15: null } }));
    expect(xml).toContain('<P_15/>');
    expect(xml).not.toContain('<P_15></P_15>');
  });
});

// ── normalizeTopLevelChild / normalizeNaglowek edges ───────────────────
//
// Pin the two recursion branches that fire when Faktura top-level children
// (or Naglowek sub-children) arrive as arrays rather than single objects,
// and the Naglowek object-but-not-FormCode path.

describe('buildFakturaXml — top-level and Naglowek array normalization', () => {
  it('normalizes a top-level child provided as an array of objects', () => {
    const input = minimalFa3({
      // Podmiot3 is optional and can be a repeated group under a single parent —
      // we send it as an array to exercise the array-map branch.
      Podmiot3: [
        { DaneIdentyfikacyjne: { NIP: '1111111111', Nazwa: 'Third Party A' } },
        { DaneIdentyfikacyjne: { NIP: '2222222222', Nazwa: 'Third Party B' } },
      ] as never,
    });
    const xml = buildFakturaXml(input, { schema: 'FA3' });
    expect(xml).toContain('Third Party A');
    expect(xml).toContain('Third Party B');
  });

  it('preserves a Naglowek sub-element provided as an object (not FormCode)', () => {
    const input = minimalFa3({
      Naglowek: {
        KodFormularza: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' } as FormCode,
        WariantFormularza: 3,
        DataWytworzeniaFa: '2026-04-18T00:00:00Z',
        // Arbitrary non-FormCode object inside Naglowek — exercises the
        // `isObject && !isFormCodeShape` branch in normalizeNaglowek.
        SystemInfo: { Name: 'test-runner', Version: '1.0' } as never,
      },
    });
    const xml = buildFakturaXml(input, { schema: 'FA3' });
    expect(xml).toContain('<SystemInfo>');
    expect(xml).toContain('<Name>test-runner</Name>');
  });

  it('preserves a Naglowek sub-element provided as an array', () => {
    const input = minimalFa3({
      Naglowek: {
        KodFormularza: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' } as FormCode,
        WariantFormularza: 3,
        DataWytworzeniaFa: '2026-04-18T00:00:00Z',
        // Array of objects inside Naglowek — exercises array-map branch.
        Extras: [{ K: 'a' }, { K: 'b' }] as never,
      },
    });
    const xml = buildFakturaXml(input, { schema: 'FA3' });
    expect(xml).toContain('<K>a</K>');
    expect(xml).toContain('<K>b</K>');
  });
});
