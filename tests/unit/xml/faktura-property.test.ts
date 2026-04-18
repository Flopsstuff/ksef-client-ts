/**
 * Property-based XSD validation for the Faktura FA2 / FA3 serializer.
 *
 * The generators below assemble randomized-but-XSD-valid `FakturaInput`
 * instances modelled on the canonical fixtures in
 * `tests/fixtures/xml/invoice-template-fa-{2,3}.xml`. Each generated input is
 * passed through `serializeInvoiceXml` and the resulting XML is validated
 * against the bundled KSeF FA2/FA3 XSDs.
 *
 * Gated on `libxmljsAvailable` so the suite skips cleanly on CI matrix entries
 * where the native `libxmljs2` build fails.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { serializeInvoiceXml } from '../../../src/xml/index.js';
import type { FakturaInput, XmlObject } from '../../../src/xml/types.js';
import type { FormCode } from '../../../src/models/common.js';
import {
  FA_XSD_PATHS,
  libxmljsAvailable,
  validateAgainstXsd,
} from './xsd-validator.js';

// ── Primitive arbitraries ──────────────────────────────────────────────

/**
 * Random 10-digit NIP string constrained by the KSeF XSD pattern
 * `[1-9]((\d[1-9])|([1-9]\d))\d{7}`: first digit must be non-zero, and at
 * least one of the second or third digits must be non-zero (i.e. not all
 * three leading digits may form the shape `N00…`).
 */
const nipArb = fc
  .tuple(
    fc.integer({ min: 1, max: 9 }),
    fc.integer({ min: 1, max: 9 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9_999_999 }),
  )
  .map(([d1, d2, d3, rest]) => `${d1}${d2}${d3}${rest.toString().padStart(7, '0')}`);

/** Random ISO-8601 date in the 2026–2027 range. */
const isoDateArb = fc
  .tuple(
    fc.integer({ min: 2026, max: 2027 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(
    ([y, m, d]) =>
      `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`,
  );

/** Random ISO-8601 datetime with a UTC Z suffix. */
const isoDateTimeArb = fc
  .tuple(
    fc.integer({ min: 2026, max: 2027 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 }),
    fc.integer({ min: 0, max: 59 }),
  )
  .map(([y, mo, d, h, mi, s]) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}Z`;
  });

/** Random invoice number (TZnakowy); ASCII-safe to avoid encoding surprises. */
const invoiceNumberArb = fc
  .tuple(
    fc.stringMatching(/^[A-Z]{2,5}$/),
    fc.integer({ min: 1, max: 99_999 }),
  )
  .map(([prefix, n]) => `${prefix}/${n.toString().padStart(4, '0')}/2026`);

/** Random two-decimal positive monetary amount in [0.01, 99_999.99]. */
const amountArb = fc
  .integer({ min: 1, max: 9_999_999 })
  .map((cents) => (cents / 100).toFixed(2));

/** Simple alphabetic name (ASCII). */
const nameArb = fc
  .stringMatching(/^[A-Za-z][A-Za-z ]{2,30}$/)
  .map((s) => s.trim());

/**
 * Simple address-line-1 string.
 *
 * The regex pins both boundary characters to alphanumeric/dot so the result
 * always has a non-whitespace prefix AND suffix — XSD `TAdresPolskiL1` and
 * its foreign equivalents require `minLength=1`, and an earlier iteration
 * that relied on `.trim()` after an unconstrained `[A-Za-z0-9 .]{3,40}`
 * regex could shrink to an empty string.
 */
const addressLineArb = fc.stringMatching(
  /^[A-Za-z0-9][A-Za-z0-9 .]{1,38}[A-Za-z0-9.]$/,
);

// ── Structural sub-arbitraries ─────────────────────────────────────────

function podmiotArb(): fc.Arbitrary<XmlObject> {
  return fc
    .record({
      nip: nipArb,
      name: nameArb,
      addr1: addressLineArb,
    })
    .map(({ nip, name, addr1 }) => ({
      DaneIdentyfikacyjne: { NIP: nip, Nazwa: name },
      Adres: { KodKraju: 'PL', AdresL1: addr1 },
    }));
}

/**
 * FA3 Podmiot2 requires `JST` and `GV` enum elements — these are mandatory
 * per the FA3 XSD (`tns:TPodmiot2` sequence), unlike FA2. Both are pinned to
 * `"2"` (Nie) because the value `"1"` triggers an additional business rule
 * requiring a matching Podmiot3 entry, which is beyond the scope of this
 * property test.
 */
function podmiotFa3BuyerArb(): fc.Arbitrary<XmlObject> {
  return podmiotArb().map((base) => ({ ...base, JST: '2', GV: '2' }));
}

function faWierszArb(index: number): fc.Arbitrary<XmlObject> {
  return fc
    .record({
      desc: nameArb,
      qty: fc.integer({ min: 1, max: 50 }),
      unitPrice: amountArb,
    })
    .map(({ desc, qty, unitPrice }) => {
      // Compute line net total with two decimals, re-using unitPrice's format.
      const total = (Number(unitPrice) * qty).toFixed(2);
      return {
        NrWierszaFa: index,
        P_7: desc,
        P_8A: 'szt.',
        P_8B: qty,
        P_9A: unitPrice,
        P_11: total,
        P_12: '23',
      };
    });
}

function faWierszListArb(min = 1, max = 5): fc.Arbitrary<XmlObject[]> {
  return fc.integer({ min, max }).chain((len) =>
    fc.tuple(...Array.from({ length: len }, (_, i) => faWierszArb(i + 1))),
  ).map((rows) => rows as XmlObject[]);
}

// Static Adnotacje block matching the canonical FA2/FA3 fixtures — these
// fields are all required by the XSD, so there is no meaningful variation
// worth randomising here.
function staticAdnotacje(): XmlObject {
  return {
    P_16: '2',
    P_17: '2',
    P_18: '2',
    P_18A: '2',
    Zwolnienie: { P_19N: '1' },
    NoweSrodkiTransportu: { P_22N: '1' },
    P_23: '2',
    PMarzy: { P_PMarzyN: '1' },
  };
}

// ── FA2 arbitrary ──────────────────────────────────────────────────────

const fakturaFa2Arbitrary: fc.Arbitrary<FakturaInput> = fc
  .record({
    dataWytworzenia: isoDateTimeArb,
    issueDate: isoDateArb,
    invoiceNumber: invoiceNumberArb,
    seller: podmiotArb(),
    buyer: podmiotArb(),
    base: amountArb,
    vat: amountArb,
    gross: amountArb,
    rows: faWierszListArb(1, 4),
  })
  .map(({ dataWytworzenia, issueDate, invoiceNumber, seller, buyer, base, vat, gross, rows }) => {
    const kodFormularza: FormCode = {
      systemCode: 'FA (2)',
      schemaVersion: '1-0E',
      value: 'FA',
    };
    return {
      Naglowek: {
        KodFormularza: kodFormularza,
        WariantFormularza: 2,
        DataWytworzeniaFa: dataWytworzenia,
        SystemInfo: 'property-test',
      },
      Podmiot1: seller,
      Podmiot2: buyer,
      Fa: {
        KodWaluty: 'PLN',
        P_1: issueDate,
        P_2: invoiceNumber,
        P_13_1: base,
        P_14_1: vat,
        P_15: gross,
        Adnotacje: staticAdnotacje(),
        RodzajFaktury: 'VAT',
        FaWiersz: rows,
      },
    };
  });

// ── FA3 arbitrary ──────────────────────────────────────────────────────

/**
 * Generates 1, 2, or 3 VAT rate groups (P_13_1/P_14_1, P_13_2/P_14_2,
 * P_13_3/P_14_3). All groups use independently-random two-decimal amounts.
 */
function rateGroupsArb(): fc.Arbitrary<XmlObject> {
  return fc
    .integer({ min: 1, max: 3 })
    .chain((groupCount) =>
      fc
        .tuple(
          ...Array.from({ length: groupCount }, () =>
            fc.record({ base: amountArb, vat: amountArb }),
          ),
        )
        .map((groups) => {
          const out: XmlObject = {};
          groups.forEach((g, i) => {
            const idx = i + 1;
            out[`P_13_${idx}`] = g.base;
            out[`P_14_${idx}`] = g.vat;
          });
          return out;
        }),
    );
}

const fakturaFa3Arbitrary: fc.Arbitrary<FakturaInput> = fc
  .record({
    dataWytworzenia: isoDateTimeArb,
    issueDate: isoDateArb,
    invoiceNumber: invoiceNumberArb,
    seller: podmiotArb(),
    buyer: podmiotFa3BuyerArb(),
    rateGroups: rateGroupsArb(),
    gross: amountArb,
    rows: faWierszListArb(1, 4),
  })
  .map(
    ({
      dataWytworzenia,
      issueDate,
      invoiceNumber,
      seller,
      buyer,
      rateGroups,
      gross,
      rows,
    }) => {
      const kodFormularza: FormCode = {
        systemCode: 'FA (3)',
        schemaVersion: '1-0E',
        value: 'FA',
      };
      return {
        Naglowek: {
          KodFormularza: kodFormularza,
          WariantFormularza: 3,
          DataWytworzeniaFa: dataWytworzenia,
          SystemInfo: 'property-test',
        },
        Podmiot1: seller,
        Podmiot2: buyer,
        Fa: {
          KodWaluty: 'PLN',
          P_1: issueDate,
          P_2: invoiceNumber,
          ...rateGroups,
          P_15: gross,
          Adnotacje: staticAdnotacje(),
          RodzajFaktury: 'VAT',
          FaWiersz: rows,
        },
      };
    },
  );

// ── Property tests ─────────────────────────────────────────────────────

describe.skipIf(!libxmljsAvailable)('FakturaInput — property-based XSD validation', () => {
  it('25 random FA2 instances all pass FA2 XSD validation', () => {
    fc.assert(
      fc.property(fakturaFa2Arbitrary, (faktura) => {
        const xml = serializeInvoiceXml(faktura, { schema: 'FA2' }).toString('utf8');
        const result = validateAgainstXsd(xml, FA_XSD_PATHS.FA2);
        if (!result.valid) {
          // Surface the first XSD error with the offending XML for triage.
          throw new Error(
            `FA2 XSD validation failed: ${result.errors.slice(0, 3).join(' | ')}\nXML:\n${xml}`,
          );
        }
        expect(result.valid).toBe(true);
      }),
      { numRuns: 25 },
    );
  });

  it('25 random FA3 instances (1–3 VAT rate groups) all pass FA3 XSD validation', () => {
    fc.assert(
      fc.property(fakturaFa3Arbitrary, (faktura) => {
        const xml = serializeInvoiceXml(faktura, { schema: 'FA3' }).toString('utf8');
        const result = validateAgainstXsd(xml, FA_XSD_PATHS.FA3);
        if (!result.valid) {
          throw new Error(
            `FA3 XSD validation failed: ${result.errors.slice(0, 3).join(' | ')}\nXML:\n${xml}`,
          );
        }
        expect(result.valid).toBe(true);
      }),
      { numRuns: 25 },
    );
  });
});
