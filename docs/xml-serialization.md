# Invoice XML Serialization

Build KSeF-compliant invoice XML (FA2, FA3, PEF, PEF_KOR) from typed TypeScript objects. The serializer produces output that matches the official XSDs — correct element order, correct namespaces, and the per-VAT-rate `P_13_N / P_14_N / P_14_NW` interleave required by FA3 — so invoices are not rejected for structural reasons at submission time.

The entry points live in `src/xml/` and are re-exported from the package root:

```typescript
import {
  serializeInvoiceXml,
  buildFakturaXml,
  buildPefXml,
} from 'ksef-client-ts';
```

---

## Overview

The module does not invent its own XML engine and it does not reorder the invoice on behalf of the user — it **produces** XML. Plain typed objects go in, a UTF-8-encoded `Buffer` (or `string` from the typed helpers) comes out. Element order is driven by a hand-transcribed `ORDER_MAP` keyed on each parent element, combined with a natural sort over `P_*` ordinals so that `P_13_10` follows `P_13_9` rather than landing after `P_13_1`.

| Entry point | Accepts | Returns | Use when |
|-------------|---------|---------|----------|
| `serializeInvoiceXml(input, options?)` | `string` / `Buffer` / `XmlDocument` / `FakturaInput` / `PefUblDocumentInput` | `Buffer` | You have a typed object, a pre-built string, or a pre-parsed tree and want a single dispatch point |
| `buildFakturaXml(faktura, options?)` | `FakturaInput` | `string` | You know you are building an FA2/FA3 invoice |
| `buildPefXml(input, options?)` | `PefUblDocumentInput` | `string` | You know you are building a PEF Invoice or PEF_KOR CreditNote |

### Supported document forms

| Schema | Target XSD | Root element |
|--------|------------|--------------|
| FA2 | `docs/schemas/FA/schemat_FA(2)_v1-0E.xsd` | `Faktura` |
| FA3 | `docs/schemas/FA/schemat_FA(3)_v1-0E.xsd` | `Faktura` |
| PEF | `docs/schemas/PEF/Schemat_PEF(3)_v2-1.xsd` (UBL Invoice-2) | `Invoice` |
| PEF_KOR | `docs/schemas/PEF/Schemat_PEF_KOR(3)_v2-1.xsd` (UBL CreditNote-2) | `CreditNote` |

FA3 is the default schema for `FakturaInput` (required on DEMO and PROD since February 2026). Pass `{ schema: 'FA2' }` to target the legacy schema.

---

## Quick Start — Build FA3

```typescript
import { buildFakturaXml, type FakturaInput } from 'ksef-client-ts';

const faktura: FakturaInput = {
  Naglowek: {
    KodFormularza: {
      systemCode: 'FA (3)',
      schemaVersion: '1-0E',
      value: 'FA',
    },
    WariantFormularza: 3,
    DataWytworzeniaFa: '2026-04-18T10:00:00Z',
  },
  Podmiot1: {
    DaneIdentyfikacyjne: {
      NIP: '5261040828',
      Nazwa: 'Sprzedawca sp. z o.o.',
    },
    Adres: {
      KodKraju: 'PL',
      AdresL1: 'ul. Marszałkowska 1',
      AdresL2: '00-001 Warszawa',
    },
  },
  Podmiot2: {
    DaneIdentyfikacyjne: {
      NIP: '1234567890',
      Nazwa: 'Nabywca S.A.',
    },
    Adres: {
      KodKraju: 'PL',
      AdresL1: 'ul. Krakowska 2',
      AdresL2: '30-001 Kraków',
    },
  },
  Fa: {
    KodWaluty: 'PLN',
    P_1: '2026-04-18',
    P_2: 'FV/2026/04/001',
    P_13_1: '100.00',
    P_14_1: '23.00',
    P_15: '123.00',
    FaWiersz: [
      {
        NrWierszaFa: 1,
        P_7: 'Usługa konsultingowa',
        P_8A: 'godz.',
        P_8B: '1.00',
        P_9A: '100.00',
        P_11: '100.00',
        P_12: '23',
      },
    ],
  },
};

const xml: string = buildFakturaXml(faktura);
// <?xml version="1.0" encoding="UTF-8"?>
// <Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"
//          xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/">
//   <Naglowek>
//     <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
//     ...
//   </Naglowek>
//   ...
// </Faktura>
```

The polymorphic entry point behaves identically for typed input and returns a `Buffer`:

```typescript
import { serializeInvoiceXml } from 'ksef-client-ts';

const buffer: Buffer = serializeInvoiceXml(faktura);
// Ready to pass to session.sendInvoice(buffer).
```

Pass `{ schema: 'FA2' }` in `options` to build against the legacy FA2 namespace.

---

## PEF Invoice

PEF invoices are UBL 2.1 documents wrapped with the KSeF UBL namespace set. The builder injects the five UBL namespaces (`xmlns`, `xmlns:ext`, `xmlns:cbc`, `xmlns:cac`, `xmlns:cbc-pl`, `xmlns:cac-pl`) on the root element — callers only supply the body.

```typescript
import { buildPefXml, type PefUblInvoiceInput } from 'ksef-client-ts';

const pef: PefUblInvoiceInput = {
  Invoice: {
    'cbc:CustomizationID': 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
    'cbc:ID': 'PEF/2026/04/001',
    'cbc:IssueDate': '2026-04-18',
    'cbc:InvoiceTypeCode': '380',
    'cbc:DocumentCurrencyCode': 'PLN',
    'cac:AccountingSupplierParty': {
      'cac:Party': {
        'cac:PartyTaxScheme': {
          'cbc:CompanyID': 'PL5261040828',
          'cac:TaxScheme': { 'cbc:ID': 'VAT' },
        },
      },
    },
    'cac:AccountingCustomerParty': {
      'cac:Party': {
        'cac:PartyTaxScheme': {
          'cbc:CompanyID': 'PL1234567890',
          'cac:TaxScheme': { 'cbc:ID': 'VAT' },
        },
      },
    },
  },
};

const xml: string = buildPefXml(pef);
```

The builder infers the schema from the root key (`Invoice` → PEF, `CreditNote` → PEF_KOR). Pass `{ schema: 'PEF' }` explicitly if the call site needs to document intent.

---

## PEF_KOR CreditNote

```typescript
import { buildPefXml, type PefUblCreditNoteInput } from 'ksef-client-ts';

const creditNote: PefUblCreditNoteInput = {
  CreditNote: {
    'cbc:CustomizationID': 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
    'cbc:ID': 'KOR/2026/04/001',
    'cbc:IssueDate': '2026-04-18',
    'cbc:CreditNoteTypeCode': '381',
    'cbc:DocumentCurrencyCode': 'PLN',
    'cac:BillingReference': {
      'cac:InvoiceDocumentReference': {
        'cbc:ID': 'PEF/2026/04/001',
      },
    },
    'cac:AccountingSupplierParty': {
      'cac:Party': {
        'cac:PartyTaxScheme': {
          'cbc:CompanyID': 'PL5261040828',
          'cac:TaxScheme': { 'cbc:ID': 'VAT' },
        },
      },
    },
    'cac:AccountingCustomerParty': {
      'cac:Party': {
        'cac:PartyTaxScheme': {
          'cbc:CompanyID': 'PL1234567890',
          'cac:TaxScheme': { 'cbc:ID': 'VAT' },
        },
      },
    },
  },
};

const xml: string = buildPefXml(creditNote);
```

Mixing `Invoice` and `CreditNote` in the same input, or passing a `schema` option that contradicts the detected root, throws `KSeFValidationError`.

---

## Multi-Rate Interleave (FA3)

FA3 XSDs require that per-VAT-rate totals interleave — all values for rate 1 (`P_13_1`, `P_14_1`, optionally `P_14_1W`), then all values for rate 2, and so on — **not** all `P_13_*` first followed by all `P_14_*`. Getting this wrong is the single most common reason FA3 invoices fail XSD validation, and the bug is silent: `fast-xml-parser` will happily emit lexicographically ordered output that the KSeF server then rejects.

The serializer handles this for you. The input can list the fields in any order; the output is always:

```text
P_13_1, P_14_1, P_14_1W, P_13_2, P_14_2, P_14_2W, ..., P_13_6_1, P_15
```

Example:

```typescript
const fa: FakturaInput = {
  Naglowek: { /* ... */ },
  Podmiot1: { /* ... */ },
  Fa: {
    // Declared in whatever order is convenient
    P_15: '246.00',
    P_14_2: '23.00',
    P_13_1: '100.00',
    P_14_1: '23.00',
    P_13_2: '100.00',
    P_14_1W: '0.00',
  },
};

// Emitted order (inside <Fa>):
//   P_13_1, P_14_1, P_14_1W, P_13_2, P_14_2, P_15
```

This matters because the XSD defines `<xsd:sequence>` (not `<xsd:all>`) for these elements — the server rejects reordered input. The serializer has a dedicated regression test covering the exact interleaved sequence; the underlying logic lives in `src/xml/order-map.ts` alongside the `ORDER_MAP` constant and the `comparePKey` natural-sort helper.

---

## Pass-Through Inputs

`serializeInvoiceXml` is deliberately polymorphic. If you already have XML — from a legacy system, from disk, from an earlier serialization step — it is passed through **unchanged**:

| Input | Behavior |
|-------|----------|
| `Buffer` | Returned byte-for-byte |
| `string` | UTF-8 BOM stripped, wrapped in a `Buffer`; no validation, no reordering |
| Pre-parsed `XmlDocument` (from `parseXml`) | Rebuilt via the engine; existing order preserved |

```typescript
import { readFileSync } from 'node:fs';
import { serializeInvoiceXml } from 'ksef-client-ts';

// Pass-through: existing XML is not validated or reformatted.
const existing: Buffer = readFileSync('./invoice.xml');
const buffer: Buffer = serializeInvoiceXml(existing);

// String: BOM stripped if present; otherwise untouched.
const asString: string = readFileSync('./invoice.xml', 'utf8');
const buffer2: Buffer = serializeInvoiceXml(asString);
```

**Pass-through does not validate.** If the input is structurally invalid, the serializer will not catch it — the server will. Combine with the [invoice XML validator](./validation.md) if you want a client-side safety net before submission.

---

## Limitations

- **No runtime XSD validation.** XSD validation happens in the dev-only test harness, not at runtime. `libxmljs2` is ~2 MB, native, and flaky across Node versions; bundling it would bloat the package for every consumer. Use the [XML validator](./validation.md) (Zod-based, generated from the same XSDs) for client-side safety.
- **No FA_RR structural builder.** The FA_RR v1-1E schema shipped in December 2025. No reference implementation has a structural builder for it yet. FA_RR XML is supported via the pass-through path — build the XML yourself (or with another tool) and pipe it through `serializeInvoiceXml` to get a `Buffer`.
- **No round-trip parsing.** The serializer is one-way: typed object → XML. Parsing XML back into a `FakturaInput` is out of scope.
- **No fluent builder DSL.** Plain typed objects only. A fluent wrapper can be layered on top later without breaking the object-based API; demand has not materialised yet.
- **No custom form extensions.** Unknown top-level elements in known parents are appended in insertion order after the XSD-defined children, but the serializer does not invent namespaces or schemas for form variants it does not know.

---

## Troubleshooting

### "Faktura input is missing required top-level key(s)"

Typed-object inputs are duck-typed against `FakturaInput` (must contain `Naglowek` and `Fa`) or `PefUblDocumentInput` (must contain exactly one of `Invoice` / `CreditNote`). If the input looks like a Faktura but is missing `Naglowek` or `Fa`, the error message names the first missing key.

### BOM in string input

UTF-8 BOM (`\uFEFF`) at the start of a string input is stripped silently before wrapping in a `Buffer`. If your source (spreadsheet export, Windows text editor) prepends a BOM, you do not need to strip it yourself.

### `KodFormularza` attributes missing

`KodFormularza` is accepted as a `FormCode` object `{ systemCode, schemaVersion, value }` and rendered as `<KodFormularza kodSystemowy="..." wersjaSchemy="...">FA</KodFormularza>`. If you pass a plain string instead, the attributes are not emitted and the XSD will reject the document. Use the typed `FormCode` shape.

### `null` vs `undefined`

`undefined` values are omitted from the output. `null` renders as an empty element (`<P_X/>`). This matches smekcio TS behavior.

### Namespace override

The default FA2/FA3 namespaces are checked in and correct for the current KSeF schemas. The `fakturaNamespace` and `etdNamespace` options exist for advanced cases (e.g., testing against a draft schema) and should be left at their defaults in production.
