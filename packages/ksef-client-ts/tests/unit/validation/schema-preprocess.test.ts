/**
 * Exercises the array-coercion preprocess functions used throughout the
 * generated Zod invoice schemas: `v => Array.isArray(v) ? v : v == null ? [] : [v]`.
 *
 * The XML fixtures naturally hit only one of the three branches per field
 * (whichever shape `xml-to-object` produces). These tests feed each
 * preprocess-bearing field with all three variants — null, single value,
 * and array — so the branch gate stays met as the generated schemas evolve.
 *
 * Per-field assertion strategy: each preprocess function runs whenever Zod
 * traverses to its field, regardless of whether sibling fields ultimately
 * fail validation. So for FA2/FA3/FA_RR1 we don't require overall success —
 * we only require that safeParse returns without throwing AND that no issue
 * complains that the preprocess field itself is the wrong type. That proves
 * the coercion ran.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { xmlToObject } from '../../../src/validation/xml-to-object.js';
import { FA2Schema } from '../../../src/validation/schemas/fa2.js';
import { FA3Schema } from '../../../src/validation/schemas/fa3.js';
import { FA_RR1Schema } from '../../../src/validation/schemas/fa-rr1.js';
import { PEF3Schema } from '../../../src/validation/schemas/pef3.js';
import { PEF_KOR3Schema } from '../../../src/validation/schemas/pef-kor3.js';

const FIXTURES = join(__dirname, '../../fixtures/invoices');

function loadAsObject(name: string): Record<string, unknown> {
  const xml = readFileSync(join(FIXTURES, name), 'utf-8');
  const result = xmlToObject(xml);
  if (!result.object) throw new Error('failed to parse fixture');
  return result.object;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
    if (next == null || typeof next !== 'object' || Array.isArray(next)) {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function pathSegments(path: string): string[] {
  return path.split('.');
}

/**
 * After preprocess runs, the value at `path` should be coerced to an array.
 * If the surrounding object fails validation, result.data is undefined — so
 * instead we verify no issue at `path` complains the field is the wrong
 * type. Preprocess running means we never see "expected array" errors at
 * the field's own path.
 */
function expectPreprocessRanAt(
  result: { success: boolean; error?: { issues: Array<{ path: Array<string | number>; code: string; expected?: string }> } },
  path: string,
): void {
  if (result.success) return;
  const segs = pathSegments(path);
  const offending = result.error!.issues.find(
    (i) =>
      i.path.length === segs.length &&
      i.path.every((p, idx) => p === segs[idx]) &&
      i.code === 'invalid_type' &&
      i.expected === 'array',
  );
  expect(
    offending,
    `preprocess at ${path} should have coerced the value into an array; issues=${JSON.stringify(result.error!.issues)}`,
  ).toBeUndefined();
}

describe('Invoice schemas — preprocess array coercion', () => {
  describe('PEF3 — top-level Invoice', () => {
    const base = (): Record<string, unknown> => ({
      ID: '1',
      IssueDate: '2025-01-01',
      AccountingSupplierParty: {},
      AccountingCustomerParty: {},
      LegalMonetaryTotal: {},
      InvoiceLine: [{}],
    });

    const arrayFields = [
      'Note',
      'InvoicePeriod',
      'BillingReference',
      'DespatchDocumentReference',
      'ReceiptDocumentReference',
      'StatementDocumentReference',
      'OriginatorDocumentReference',
      'ContractDocumentReference',
      'AdditionalDocumentReference',
      'ProjectReference',
      'Signature',
      'Delivery',
      'PaymentMeans',
      'PaymentTerms',
      'PrepaidPayment',
      'AllowanceCharge',
      'TaxTotal',
      'WithholdingTaxTotal',
    ];

    it('accepts array, single, and null for each preprocess-typed field', () => {
      for (const field of arrayFields) {
        expect(PEF3Schema.safeParse({ ...base(), [field]: [{ a: 1 }, { b: 2 }] }).success).toBe(true);
        expect(PEF3Schema.safeParse({ ...base(), [field]: null }).success).toBe(true);
        expect(PEF3Schema.safeParse({ ...base(), [field]: { foo: 'bar' } }).success).toBe(true);
      }
    });

    it('coerces a single InvoiceLine into the required min(1) array', () => {
      expect(PEF3Schema.safeParse({ ...base(), InvoiceLine: { id: 'x' } }).success).toBe(true);
      // null collapses to [] which violates min(1)
      expect(PEF3Schema.safeParse({ ...base(), InvoiceLine: null }).success).toBe(false);
    });
  });

  describe('PEF_KOR3 — top-level CreditNote', () => {
    const base = (): Record<string, unknown> => ({
      ID: '1',
      IssueDate: '2025-01-01',
      AccountingSupplierParty: {},
      AccountingCustomerParty: {},
      LegalMonetaryTotal: {},
      CreditNoteLine: [{}],
    });

    const arrayFields = [
      'Note',
      'InvoicePeriod',
      'DiscrepancyResponse',
      'BillingReference',
      'DespatchDocumentReference',
      'ReceiptDocumentReference',
      'ContractDocumentReference',
      'AdditionalDocumentReference',
      'StatementDocumentReference',
      'OriginatorDocumentReference',
      'Signature',
      'Delivery',
      'DeliveryTerms',
      'PaymentMeans',
      'PaymentTerms',
      'AllowanceCharge',
      'TaxTotal',
    ];

    it('accepts array, single, and null for each preprocess-typed field', () => {
      for (const field of arrayFields) {
        expect(PEF_KOR3Schema.safeParse({ ...base(), [field]: [{ a: 1 }] }).success).toBe(true);
        expect(PEF_KOR3Schema.safeParse({ ...base(), [field]: null }).success).toBe(true);
        expect(PEF_KOR3Schema.safeParse({ ...base(), [field]: { foo: 'bar' } }).success).toBe(true);
      }
    });

    it('coerces a single CreditNoteLine into the required min(1) array', () => {
      expect(PEF_KOR3Schema.safeParse({ ...base(), CreditNoteLine: { id: 'x' } }).success).toBe(true);
      expect(PEF_KOR3Schema.safeParse({ ...base(), CreditNoteLine: null }).success).toBe(false);
    });
  });

  describe('FA3 — array-typed optional fields', () => {
    const fixture = (): Record<string, unknown> => loadAsObject('valid-fa3.xml');

    // Each entry: dotted path → minimal valid single-item sample.
    const cases: Array<[string, unknown]> = [
      ['Podmiot1.DaneKontaktowe', { Email: 'a@b.pl' }],
      ['Podmiot2.DaneKontaktowe', { Email: 'a@b.pl' }],
      ['Podmiot3', {
        DaneIdentyfikacyjne: { NIP: '5213003700' },
        Rola: '1',
      }],
      ['Fa.WZ', 'WZ-1'],
      ['Fa.Podmiot2K', {
        DaneIdentyfikacyjne: { NIP: '3861610227' },
      }],
      ['Fa.ZaliczkaCzesciowa', { P_6Z: '2025-01-10', P_15Z: '100.00' }],
      ['Fa.DodatkowyOpis', { Klucz: 'k', Wartosc: 'v' }],
      ['Fa.DaneFaKorygowanej', {
        DataWystFaKorygowanej: '2025-01-01',
        NrFaKorygowanej: 'FV/2024/999',
      }],
      ['Fa.FakturaZaliczkowa', { NrKSeFZN: '1', NrFaZaliczkowej: 'FZ-1' }],
      ['Fa.Platnosc.ZaplataCzesciowa', {
        KwotaZaplatyCzesciowej: '50.00',
        DataZaplatyCzesciowej: '2025-01-10',
      }],
      ['Fa.Platnosc.TerminPlatnosci', { Termin: '2025-02-01' }],
      ['Fa.Platnosc.RachunekBankowy', { NrRB: '12345678901234567890123456' }],
      ['Fa.Platnosc.RachunekBankowyFaktora', { NrRB: '99345678901234567890123456' }],
    ];

    it('coerces array, single, and null variants for every preprocess path', () => {
      for (const [path, sample] of cases) {
        for (const variant of [
          [clone(sample), clone(sample)], // array branch
          null,                            // v == null branch
          clone(sample),                   // [v] branch
        ]) {
          const obj = clone(fixture());
          setPath(obj, path, variant);
          const result = FA3Schema.safeParse(obj);
          expectPreprocessRanAt(result, path);
        }
      }
    });

    it('handles preprocess fields nested under optional parent groups', () => {
      // Rozliczenie and WarunkiTransakcji aren't in the fixture; populate
      // the parent with valid context so the preprocess fields inside
      // execute against the real schema.
      const cases: Array<[string, unknown]> = [
        ['Fa.Rozliczenie.Obciazenia', { Kwota: '10.00', Powod: 'X' }],
        ['Fa.Rozliczenie.Odliczenia', { Kwota: '5.00', Powod: 'Y' }],
        ['Fa.WarunkiTransakcji.Umowy', { DataUmowy: '2025-01-01', NrUmowy: 'U-1' }],
        ['Fa.WarunkiTransakcji.Zamowienia', { DataZamowienia: '2025-01-01', NrZamowienia: 'Z-1' }],
        ['Fa.WarunkiTransakcji.NrPartiiTowaru', 'BATCH-1'],
      ];

      for (const [path, sample] of cases) {
        for (const variant of [[clone(sample), clone(sample)], null, clone(sample)]) {
          const obj = clone(fixture());
          setPath(obj, path, variant);
          const result = FA3Schema.safeParse(obj);
          expectPreprocessRanAt(result, path);
        }
      }
    });

    it('coerces the inner PodmiotUpowazniony.DaneKontaktowe preprocess', () => {
      // PodmiotUpowazniony.DaneKontaktowe is a separate preprocess function
      // (line 207 in fa3.ts). Give it a valid surrounding object so the
      // preprocess runs even if other fields would otherwise be flagged.
      for (const variant of [
        [{ EmailPU: 'a@b.pl' }, { EmailPU: 'c@d.pl' }],
        null,
        { EmailPU: 'a@b.pl' },
      ]) {
        const obj = clone(fixture());
        obj.PodmiotUpowazniony = {
          DaneIdentyfikacyjne: { NIP: '5213003700', Nazwa: 'TestPU' },
          Adres: { KodKraju: 'PL', AdresL1: 'ul. PU 1' },
          DaneKontaktowe: variant,
          RolaPU: '1',
        };
        const result = FA3Schema.safeParse(obj);
        expectPreprocessRanAt(result, 'PodmiotUpowazniony.DaneKontaktowe');
      }
    });

    it('coerces multi-line FaWiersz into the required min(1) array', () => {
      const obj = clone(fixture());
      setPath(obj, 'Fa.FaWiersz', [{
        NrWierszaFa: '1',
        P_7: 'Linia A',
        P_8A: 'szt.',
        P_8B: '1',
        P_9A: '100.00',
        P_11: '100.00',
        P_12: '23',
      }, {
        NrWierszaFa: '2',
        P_7: 'Linia B',
        P_8A: 'szt.',
        P_8B: '2',
        P_9A: '50.00',
        P_11: '100.00',
        P_12: '23',
      }]);
      const result = FA3Schema.safeParse(obj);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    });

    it('runs preprocess for the Adnotacje.NoweSrodkiTransportu nested array', () => {
      // The fixture uses the P_22N branch of the NoweSrodkiTransportu
      // union; here we hit the P_22 branch which contains the inner
      // NowySrodekTransportu preprocess.
      const obj = clone(fixture());
      setPath(obj, 'Fa.Adnotacje.NoweSrodkiTransportu', {
        P_22: '1',
        P_42_5: '1',
        NowySrodekTransportu: [
          { P_22A: '2025-01-15', P_NrWierszaNST: '1' },
          { P_22A: '2025-01-16', P_NrWierszaNST: '2' },
        ],
      });
      const result = FA3Schema.safeParse(obj);
      expectPreprocessRanAt(result, 'Fa.Adnotacje.NoweSrodkiTransportu.NowySrodekTransportu');

      // Same path with a single object — exercises the [v] branch.
      setPath(obj, 'Fa.Adnotacje.NoweSrodkiTransportu', {
        P_22: '1',
        P_42_5: '1',
        NowySrodekTransportu: { P_22A: '2025-01-15', P_NrWierszaNST: '1' },
      });
      const single = FA3Schema.safeParse(obj);
      expectPreprocessRanAt(single, 'Fa.Adnotacje.NoweSrodkiTransportu.NowySrodekTransportu');
    });
  });

  describe('FA2 — array-typed optional fields', () => {
    const fixture = (): Record<string, unknown> => loadAsObject('valid-fa2.xml');

    const cases: Array<[string, unknown]> = [
      ['Podmiot1.DaneKontaktowe', { Email: 'a@b.pl' }],
      ['Podmiot2.DaneKontaktowe', { Email: 'a@b.pl' }],
      ['Podmiot3', {
        DaneIdentyfikacyjne: { NIP: '5213003700' },
        Rola: '1',
      }],
      ['Fa.WZ', 'WZ-1'],
      ['Fa.DodatkowyOpis', { Klucz: 'k', Wartosc: 'v' }],
    ];

    it('coerces array, single, and null for each path', () => {
      for (const [path, sample] of cases) {
        for (const variant of [[clone(sample), clone(sample)], null, clone(sample)]) {
          const obj = clone(fixture());
          setPath(obj, path, variant);
          const result = FA2Schema.safeParse(obj);
          expectPreprocessRanAt(result, path);
        }
      }
    });
  });

  describe('FA_RR1 — array-typed optional fields', () => {
    const fixture = (): Record<string, unknown> => loadAsObject('valid-rr1.xml');

    const cases: Array<[string, unknown]> = [
      ['Podmiot1.DaneKontaktowe', { Email: 'a@b.pl' }],
      ['Podmiot2.DaneKontaktowe', { Email: 'a@b.pl' }],
      ['Podmiot3', {
        DaneIdentyfikacyjne: { NIP: '5213003700' },
      }],
      ['Fa.DodatkowyOpis', { Klucz: 'k', Wartosc: 'v' }],
    ];

    it('coerces array, single, and null for each path', () => {
      for (const [path, sample] of cases) {
        for (const variant of [[clone(sample), clone(sample)], null, clone(sample)]) {
          const obj = clone(fixture());
          setPath(obj, path, variant);
          const result = FA_RR1Schema.safeParse(obj);
          expectPreprocessRanAt(result, path);
        }
      }
    });
  });
});
