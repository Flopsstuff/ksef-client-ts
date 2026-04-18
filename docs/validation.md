# Validation & Data Integrity

Deep dive into the validation layer that ensures data correctness before it reaches the KSeF API. This layer provides checksum-based validators for Polish tax identifiers, regex patterns for all KSeF data formats, constraint constants for builder validation, and ZIP bomb protection for export downloads.

---

## Overview

The Polish National e-Invoice System (KSeF) enforces strict format and checksum rules on identifiers like NIP (tax ID), PESEL (personal ID), and KSeF invoice numbers. Submitting malformed data results in cryptic API errors or silent rejection. The validation layer catches these problems client-side, before any network I/O, producing clear error messages with field-level detail.

The layer has six components:

| Component | File | Role |
|-----------|------|------|
| **Invoice XML validator** | `src/validation/invoice-validator.ts` | Three-level invoice validation (well-formedness, schema, business rules) |
| **Schema registry** | `src/validation/schema-registry.ts` | Lazy-loading registry with namespace-based auto-detection |
| **Generated Zod schemas** | `src/validation/schemas/*.ts` | Build-time XSD-to-Zod schemas for all 6 invoice types |
| Regex patterns | `src/validation/patterns.ts` | Format validation for 17 identifier/data types |
| Checksum validators | `src/validation/patterns.ts` | Algorithmic validation (NIP, PESEL, KSeF Number CRC-8) |
| Constraint constants | `src/validation/constraints.ts` | Length limits and size bounds used by builders |
| ZIP bomb protection | `src/utils/zip.ts` | Safe decompression of export packages |

Everything is re-exported through `src/validation/index.ts` and `src/utils/index.ts`, making it available from the library's public API:

```typescript
import {
  isValidNip, isValidPesel, isValidKsefNumber,
  Nip, Pesel, KsefNumber,
  REQUIRED_CHALLENGE_LENGTH, CERTIFICATE_NAME_MAX_LENGTH,
} from 'ksef-client-ts';

import { unzip, createZip } from 'ksef-client-ts';
import type { UnzipOptions, ZipEntryInput } from 'ksef-client-ts';
```

---

## Invoice XML Validation

**Files:** `src/validation/invoice-validator.ts`, `src/validation/schema-registry.ts`, `src/validation/xml-to-object.ts`, `src/validation/schemas/*.ts`

KSeF rejects invalid invoice XML at submission time with cryptic server-side errors, wasting API quota. The invoice XML validator catches structural and constraint errors client-side before any network I/O.

### How it works

The validation pipeline has two phases: **build-time** schema generation and **runtime** validation.

```
BUILD-TIME (one-time setup, output committed to git)

  CIRFMF/ksef-docs (GitHub)        Official KSeF XSD schemas
          │
          │  yarn sync-schemas
          ▼
  docs/schemas/**/*.xsd             Local copy of XSD files (FA, PEF, RR)
          │
          │  yarn generate-schemas
          ▼
  src/validation/schemas/*.ts       Zod schemas (6 files + index.ts)


RUNTIME (every validate() call)

  Invoice XML string
          │
          │  @xmldom/xmldom DOMParser
          ▼
  Level 1: Well-formedness check    Rejects malformed XML
          │
          │  xmlToObject()
          ▼
  Plain JS object                   Elements → properties, arrays, @attributes
          │
          │  SchemaRegistry.detect() → namespace URI → schema type
          │  schema.safeParse(object)
          ▼
  Level 2: Schema validation        Required elements, enums, patterns, occurrences
          │
          │  collectNipPeselErrors()
          ▼
  Level 3: Business rules           NIP/PESEL checksum verification
          │
          ▼
  InvoiceValidationResult           { valid, schemaType, errors[] }
```

Each level short-circuits: if Level 1 fails, Levels 2-3 are skipped. See [Generated schemas](#generated-schemas) for details on the build-time pipeline and how to update schemas when KSeF publishes new versions.

### Four validation levels

The validator runs four independent levels, each callable separately or combined:

| Level | Function | What it checks |
|-------|----------|---------------|
| 1a | `validateCharValidity(xml)` | Pre-parse: no XML processing instructions outside the `<?xml?>` prolog; no W3C-discouraged Unicode code points |
| 1 | `validateWellFormedness(xml)` | XML is parseable (no unclosed tags, no encoding errors) |
| 2 | `validateSchema(xml, options?)` | Structure matches the KSeF XSD schema (required elements, patterns, enums, occurrence limits) |
| 3 | `validateBusinessRules(xml)` | Business logic beyond XSD (NIP/PESEL checksum verification) |
| All | `validate(xml, options?)` | Runs all four levels, short-circuits on first failure |

#### Level 1a — Character validity

KSeF API v2.4.0 rejects XML containing:

- **Processing instructions outside the prolog.** The XML declaration `<?xml version="1.0" encoding="UTF-8"?>` is allowed only as the first non-whitespace content; any other `<?...?>` token (e.g. `<?xml-stylesheet ...?>`) triggers `XML_PROCESSING_INSTRUCTION`.
- **Discouraged Unicode characters.** 19 code-point ranges are rejected per W3C XML 1.0 §2.2. Hitting any of them triggers `XML_DISCOURAGED_UNICODE`. The check de-duplicates by range, so a block of bad characters produces one error per distinct range, not one per character.

Discouraged ranges:

```text
[#x7F-#x84]       [#x86-#x9F]       [#xFDD0-#xFDEF]
[#x1FFFE-#x1FFFF] [#x2FFFE-#x2FFFF] [#x3FFFE-#x3FFFF]
[#x4FFFE-#x4FFFF] [#x5FFFE-#x5FFFF] [#x6FFFE-#x6FFFF]
[#x7FFFE-#x7FFFF] [#x8FFFE-#x8FFFF] [#x9FFFE-#x9FFFF]
[#xAFFFE-#xAFFFF] [#xBFFFE-#xBFFFF] [#xCFFFE-#xCFFFF]
[#xDFFFE-#xDFFFF] [#xEFFFE-#xEFFFF] [#xFFFFE-#xFFFFF]
[#x10FFFE-#x10FFFF]
```

Server-side enforcement on KSeF production is strict from **2026-07-16**. Running this check client-side gives callers precise offsets (`path: "offset:123"`) and avoids a server round-trip for issues detectable locally.

Opt out via `skipCharValidity: true` on `validate()` if you need the legacy behavior:

```typescript
await validate(xml, { skipCharValidity: true });
```

### CLI usage

Validate a single file:

```bash
ksef invoice validate invoice.xml
# ✓ invoice.xml: valid (FA3)

ksef invoice validate invoice.xml --json
# {"files":[{"file":"invoice.xml","valid":true,"schemaType":"FA3","errors":[]}],"summary":{"total":1,"valid":1,"invalid":0}}
```

Validate a directory of invoices:

```bash
ksef invoice validate ./invoices/
# ✓ inv-001.xml: valid (FA3)
# ✓ inv-002.xml: valid (FA3)
# ✗ inv-003.xml: INVALID (FA3)
#   [MISSING_REQUIRED_ELEMENT] at /Faktura/Podmiot1: Required
#
# Summary: 2 valid, 1 invalid, 3 total
```

Override schema auto-detection:

```bash
ksef invoice validate invoice.xml --schema FA2
```

Validate before sending (CLI):

```bash
ksef invoice send invoice.xml --validate
# ✓ Validation passed.
# ✓ Invoice sent. Ref: 20240115-AB-...
```

### Programmatic API

```typescript
import {
  validate, validateWellFormedness, validateSchema, validateBusinessRules,
  SchemaRegistry,
} from 'ksef-client-ts';

// Full validation (all three levels)
const result = await validate(invoiceXml);
if (!result.valid) {
  for (const error of result.errors) {
    console.error(`[${error.code}] ${error.path}: ${error.message}`);
  }
}

// Individual levels
const l1 = validateWellFormedness(xml);          // sync
const l2 = await validateSchema(xml);            // async (lazy schema loading)
const l3 = validateBusinessRules(xml);           // sync

// Explicit schema override (skip auto-detection)
const l2fa2 = await validateSchema(xml, { schema: 'FA2' });
```

### Validate-before-send (programmatic)

The `openOnlineSession` workflow accepts a `validate` option. When enabled, every `sendInvoice()` call validates the XML before encryption. On failure, it throws `KSeFValidationError`:

```typescript
import { openOnlineSession } from 'ksef-client-ts';
import { KSeFValidationError } from 'ksef-client-ts';

const handle = await openOnlineSession(client, { validate: true });

try {
  await handle.sendInvoice(invoiceXml);
} catch (err) {
  if (err instanceof KSeFValidationError) {
    console.error('Validation failed:', err.message);
    for (const detail of err.details) {
      console.error(`  ${detail.field}: ${detail.message}`);
    }
  }
}
```

Validation is opt-in (default: `false`) to avoid adding latency for systems that trust their XML generation.

### Schema auto-detection

The validator detects the invoice schema type from the root element's XML namespace URI:

| Namespace | Schema | Root element |
|-----------|--------|-------------|
| `http://crd.gov.pl/wzor/2025/06/25/13775/` | FA3 | `Faktura` |
| `http://crd.gov.pl/wzor/2023/06/29/12648/` | FA2 | `Faktura` |
| `http://crd.gov.pl/wzor/2026/03/06/14189/` | RR1_V11E | `Faktura` |
| `http://crd.gov.pl/wzor/2026/02/17/14164/` | RR1_V10E | `Faktura` |
| `urn:oasis:names:specification:ubl:schema:xsd:Invoice-2` | PEF3 | `Invoice` |
| `urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2` | PEF_KOR3 | `CreditNote` |

For PEF schemas, the root element name disambiguates `Invoice` (PEF3) from `CreditNote` (PEF_KOR3).

### Schema registry

`SchemaRegistry` manages lazy-loading of generated Zod schemas:

```typescript
import { SchemaRegistry } from 'ksef-client-ts';

// List all available schemas
SchemaRegistry.availableSchemas();
// ['FA3', 'FA2', 'RR1_V11E', 'RR1_V10E', 'PEF3', 'PEF_KOR3']

// Load a schema (lazy, cached after first load)
const schema = await SchemaRegistry.get('FA3');

// Auto-detect from namespace and root element
const type = SchemaRegistry.detect(
  'http://crd.gov.pl/wzor/2025/06/25/13775/', 'Faktura'
);
// 'FA3'
```

### Error codes

| Code | Level | Meaning |
|------|-------|---------|
| `MALFORMED_XML` | 1 | XML cannot be parsed (unclosed tags, encoding errors, empty input) |
| `MISSING_REQUIRED_ELEMENT` | 2 | A required element is absent |
| `INVALID_ENUM_VALUE` | 2 | Value not in the allowed enumeration |
| `PATTERN_MISMATCH` | 2 | String doesn't match the XSD pattern restriction |
| `MAX_OCCURS_EXCEEDED` | 2 | More occurrences than `maxOccurs` allows |
| `UNKNOWN_SCHEMA` | 2 | Namespace doesn't match any known invoice schema |
| `SCHEMA_VALIDATION_ERROR` | 2 | Other schema constraint violation |
| `INVALID_NIP_CHECKSUM` | 3 | NIP value fails weighted checksum |
| `INVALID_PESEL_CHECKSUM` | 3 | PESEL value fails weighted checksum |
| `FUTURE_INVOICE_DATE` | 3 | Invoice date (P_1) is in the future — KSeF rejects such invoices with status 445 |

Each error includes:
- `code` -- classification from the table above
- `message` -- human-readable description
- `path` -- XPath-like location, e.g. `/Faktura/Podmiot1/DaneIdentyfikacyjne/NIP`

### Generated schemas

This is the build-time half of the [validation pipeline](#how-it-works). The generator script (`scripts/generate-invoice-schemas.mjs`) parses official KSeF XSD files from `docs/schemas/`, resolves cross-file imports (base types, country codes), and emits self-contained Zod TypeScript files. Each schema type gets its own file:

| File | Source XSD | Types |
|------|-----------|-------|
| `fa3.ts` | `FA/schemat_FA(3)_v1-0E.xsd` | ~113 Zod types |
| `fa2.ts` | `FA/schemat_FA(2)_v1-0E.xsd` | ~111 Zod types |
| `rr1-v11e.ts` | `RR/schemat_FA_RR(1)_v1-1E.xsd` | ~102 Zod types |
| `rr1-v10e.ts` | `RR/schemat_FA_RR(1)_v1-0E.xsd` | ~102 Zod types |
| `pef3.ts` | `PEF/Schemat_PEF(3)_v2-1.xsd` | Wrapper-level validation |
| `pef-kor3.ts` | `PEF/Schemat_PEF_KOR(3)_v2-1.xsd` | Wrapper-level validation |

PEF schemas validate the KSeF wrapper structure but not the full UBL body (UBL base schemas are 2.3MB; nested types use `z.any()`).

To regenerate after updating XSD files:

```bash
yarn sync-schemas          # download latest XSD from CIRFMF/ksef-docs
yarn generate-schemas      # regenerate Zod schemas
yarn lint                  # verify generated code compiles
```

---

## NIP Validation

**File:** `src/validation/patterns.ts` -- `isValidNip()`

NIP (Numer Identyfikacji Podatkowej) is the Polish tax identification number. It is a 10-digit string with a weighted checksum.

### Format

```
[1-9] ((\d[1-9]) | ([1-9]\d)) \d{7}
```

- 10 digits total
- First digit is 1-9 (not zero)
- Digits 2-3 form a pair where at least one is non-zero (prevents `X00XXXXXXX` patterns)

### Checksum algorithm

Weights: `[6, 5, 7, 2, 3, 4, 5, 6, 7]`

1. Multiply each of the first 9 digits by its corresponding weight.
2. Sum all 9 products.
3. Compute `sum mod 11`.
4. If the remainder is 10, the NIP is **invalid** (no valid NIP has checksum digit 10).
5. Otherwise, the remainder must equal the 10th digit (index 9).

```typescript
function isValidNip(value: string): boolean {
  if (!Nip.test(value)) return false;  // format check first

  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(value[i]) * weights[i];
  }
  const checksum = sum % 11;
  return checksum !== 10 && checksum === Number(value[9]);
}
```

### Example

NIP `5261040828`:

| Position | Digit | Weight | Product |
|----------|-------|--------|---------|
| 0 | 5 | 6 | 30 |
| 1 | 2 | 5 | 10 |
| 2 | 6 | 7 | 42 |
| 3 | 1 | 2 | 2 |
| 4 | 0 | 3 | 0 |
| 5 | 4 | 4 | 16 |
| 6 | 0 | 5 | 0 |
| 7 | 8 | 6 | 48 |
| 8 | 2 | 7 | 14 |

Sum = 162, checksum = 162 mod 11 = 8. Check digit (position 9) = `8`. Valid.

---

## PESEL Validation

**File:** `src/validation/patterns.ts` -- `isValidPesel()`

PESEL (Powszechny Elektroniczny System Ewidencji Ludnosci) is the Polish national identification number. It is an 11-digit string encoding date of birth, serial number, sex, and a checksum digit.

### Format

```
\d{2} (month-code) \d{7}
```

- 11 digits total
- Digits 0-1: year (last two digits)
- Digits 2-3: month code (01-12 for 1900s, 21-32 for 2000s, 41-52 for 2100s, 61-72 for 2200s, 81-92 for 1800s)
- Digits 4-5: day (01-31)
- Digits 6-9: serial number (digit 9 encodes sex: even = female, odd = male)
- Digit 10: checksum

The regex validates month codes against all century offsets:

```
(?:0[1-9]|1[0-2]|2[1-9]|3[0-2]|4[1-9]|5[0-2]|6[1-9]|7[0-2]|8[1-9]|9[0-2])
```

### Checksum algorithm

Weights: `[1, 3, 7, 9, 1, 3, 7, 9, 1, 3]`

1. Multiply each of the first 10 digits by its corresponding weight.
2. Sum all 10 products.
3. Compute `(10 - (sum mod 10)) mod 10`.
4. The result must equal the 11th digit (index 10).

```typescript
function isValidPesel(value: string): boolean {
  if (!Pesel.test(value)) return false;  // format check first

  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(value[i]) * weights[i];
  }
  const checksum = (10 - (sum % 10)) % 10;
  return checksum === Number(value[10]);
}
```

### Example

PESEL `44051401458`:

| Position | Digit | Weight | Product |
|----------|-------|--------|---------|
| 0 | 4 | 1 | 4 |
| 1 | 4 | 3 | 12 |
| 2 | 0 | 7 | 0 |
| 3 | 5 | 9 | 45 |
| 4 | 1 | 1 | 1 |
| 5 | 4 | 3 | 12 |
| 6 | 0 | 7 | 0 |
| 7 | 1 | 9 | 9 |
| 8 | 4 | 1 | 4 |
| 9 | 5 | 3 | 15 |

Sum = 102, sum mod 10 = 2, checksum = (10 - 2) mod 10 = 8. Check digit (position 10) = `8`. Valid.

---

## KSeF Number Validation

**File:** `src/validation/patterns.ts` -- `isValidKsefNumber()`, `isValidKsefNumberV35()`, `isValidKsefNumberV36()`

The KSeF number is the unique identifier assigned to every invoice submitted to the National e-Invoice System. It is the most complex identifier to validate, combining a NIP, a date, a technical hex portion, and a CRC-8 checksum.

### Format breakdown

A KSeF number has two format variants:

**V35 format** (35 characters, no middle hyphen in the hex portion):

```
{NIP-10}-{Date-8}-{TechHex-12}{CRC-2}
 ^          ^         ^           ^
 |          |         |           +-- CRC-8 checksum (2 hex chars)
 |          |         +------------- Technical hex (12 hex chars, no hyphen)
 |          +----------------------- Date: YYYYMMDD (8 chars)
 +---------------------------------- NIP: 10 digits

Total: 10 + 1 + 8 + 1 + 12 + 2 + 1(hyphen) = 35
Structure: NNNNNNNNNN-YYYYMMDD-HHHHHHHHHHHH-CC
```

**V36 format** (36 characters, middle hyphen splits the hex portion):

```
{NIP-10}-{Date-8}-{TechHex1-6}-{TechHex2-6}-{CRC-2}
Structure: NNNNNNNNNN-YYYYMMDD-HHHHHH-HHHHHH-CC
```

The V35 and V36 patterns also accept alternative identifier prefixes beyond NIP:
- `M\d{9}` -- municipality identifiers
- `[A-Z]{3}\d{7}` -- three-letter-prefix identifiers

### CRC-8 algorithm

The CRC-8 checksum uses polynomial `0x07` with initial value `0x00`. It is computed over the **data portion** of the normalized (V35) form -- the first 32 characters (everything except the last 2 CRC characters plus the final hyphen).

```typescript
function computeCrc8Hex(data: string): string {
  let crc = 0x00;
  const bytes = new TextEncoder().encode(data);
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x80) !== 0
        ? ((crc << 1) ^ 0x07) & 0xff  // polynomial 0x07
        : (crc << 1) & 0xff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(2, '0');
}
```

**Algorithm step-by-step:**

1. Initialize CRC register to `0x00`.
2. Encode the data portion (first 32 characters of normalized form) as UTF-8 bytes.
3. For each byte:
   a. XOR the byte into the CRC register.
   b. For each of 8 bits:
      - If the MSB (bit 7) is set: shift left by 1, XOR with polynomial `0x07`.
      - Otherwise: shift left by 1.
      - Mask to 8 bits (`& 0xFF`).
4. Convert the final CRC byte to a 2-character uppercase hex string (zero-padded).
5. Compare with the last 2 characters of the KSeF number.

### Normalization for V36

When validating a V36 number, the function first normalizes it to V35 by removing the middle hyphen in the hex portion:

```
V36: NNNNNNNNNN-YYYYMMDD-HHHHHH-HHHHHH-CC  (5 hyphen-delimited parts)
V35: NNNNNNNNNN-YYYYMMDD-HHHHHHHHHHHH-CC    (4 hyphen-delimited parts)
```

The normalization joins parts[2] and parts[3] into a single 12-character hex block.

### Validation functions

| Function | Accepts | Behavior |
|----------|---------|----------|
| `isValidKsefNumber(value)` | Both V35 and V36 | Normalizes V36 to V35, then checks CRC |
| `isValidKsefNumberV35(value)` | Only V35 (35 chars) | Direct CRC check on `value.slice(0, 32)` |
| `isValidKsefNumberV36(value)` | Only V36 (36 chars) | Normalizes, then CRC check |

### Concrete example

Given KSeF number (V35): `5261040828-20240115-A1B2C3D4E5F6-7A`

1. Data portion = `5261040828-20240115-A1B2C3D4E5F6` (first 32 chars, after the last hyphen before CRC)
2. Compute CRC-8 over these 32 bytes using polynomial 0x07
3. Expected result: `7A` (last 2 chars)
4. If CRC matches, the number is valid

---

## Regex Patterns

**File:** `src/validation/patterns.ts`

All patterns are exported as `RegExp` instances with start (`^`) and end (`$`) anchors, ensuring full-string matching.

| Pattern | Description | Example |
|---------|-------------|---------|
| `Nip` | Polish tax ID, 10 digits, first non-zero | `5261040828` |
| `VatUe` | EU VAT number (all 27 EU member states + XI) | `DE123456789`, `PL5261040828` |
| `NipVatUe` | Combined NIP-VatUe with hyphen separator | `5261040828-DE123456789` |
| `InternalId` | NIP + 5-digit suffix | `5261040828-00001` |
| `PeppolId` | PEPPOL participant ID | `PPL000001` |
| `ReferenceNumber` | KSeF operation reference number (date + codes + checksums) | `20240115-AB-0123456789-ABCDEF0123-FF` |
| `KsefNumber` | KSeF invoice number (V35 or V36 format) | See KSeF Number section |
| `KsefNumberV35` | Strict V35 format (35 chars, no middle hyphen in hex) | `5261040828-20240115-A1B2C3D4E5F6-7A` |
| `KsefNumberV36` | Strict V36 format (36 chars, middle hyphen in hex) | `5261040828-20240115-A1B2C3-D4E5F6-7A` |
| `CertificateName` | Alphanumeric + Polish chars + underscore/hyphen/space | `Certyfikat_Testowy-2024` |
| `Pesel` | Polish personal ID, 11 digits with month-code validation | `44051401458` |
| `CertificateFingerprint` | SHA-256 fingerprint, 64 uppercase hex characters | `A1B2C3...` (64 chars) |
| `Base64String` | Standard Base64 with `=` padding | `dGVzdA==` |
| `Ip4Address` | IPv4 address (4 octets, 0-255) | `192.168.1.1` |
| `Ip4Range` | IPv4 range (two addresses separated by `-`) | `192.168.1.1-192.168.1.255` |
| `Ip4Mask` | IPv4 CIDR notation (address + `/0`..`/32`) | `192.168.1.0/24` |
| `Sha256Base64` | SHA-256 hash encoded as Base64 (43 chars + `=` padding) | `n4bQgYhMfWWaL-qgxVrQFaO_TxsrC4Is0V1sFbDwCgg=` |

### VatUe country coverage

The `VatUe` pattern covers all EU member states and Northern Ireland (XI prefix). Each country has its own sub-pattern reflecting the national format:

- Fixed-length: AT (8), DE (9), DK (8), EE (9), EL (9), FI (8), HR (11), HU (8), IT (11), LU (8), MT (8), PT (9), SE (12), SI (8), SK (10)
- Variable-length: BG (9-10), CZ (8-10), RO (2-10), LT (9 or 12), XI (9, 12, or GD/HA+3)
- Alphanumeric: ES, FR, IE, NL (contain letters in specific positions)

---

## Validator Functions

**File:** `src/validation/patterns.ts`

All validators follow the same contract: accept a `string`, return `boolean`. Three of them (`isValidNip`, `isValidPesel`, `isValidKsefNumber*`) perform algorithmic checksum verification beyond regex matching.

| Function | Validation type | Details |
|----------|----------------|---------|
| `isValidNip(value)` | Regex + checksum | NIP weighted sum mod 11 |
| `isValidPesel(value)` | Regex + checksum | PESEL weighted sum, complement mod 10 |
| `isValidKsefNumber(value)` | Regex + CRC-8 | Accepts V35 or V36, normalizes, checks CRC |
| `isValidKsefNumberV35(value)` | Regex + CRC-8 | V35 only |
| `isValidKsefNumberV36(value)` | Regex + CRC-8 | V36 only |
| `isValidVatUe(value)` | Regex only | EU VAT number format |
| `isValidNipVatUe(value)` | Regex only | Combined NIP-VatUe format |
| `isValidInternalId(value)` | Regex only | NIP + 5-digit suffix |
| `isValidPeppolId(value)` | Regex only | PEPPOL ID format |
| `isValidReferenceNumber(value)` | Regex only | KSeF reference number format |
| `isValidCertificateName(value)` | Regex only | Alphanumeric + Polish chars |
| `isValidCertificateFingerprint(value)` | Regex only | 64 uppercase hex chars |
| `isValidBase64(value)` | Regex only | Standard Base64 format |
| `isValidIp4Address(value)` | Regex only | IPv4 address format |
| `isValidSha256Base64(value)` | Regex only | SHA-256 in Base64 (43+1 chars) |

---

## Constraint Constants

**File:** `src/validation/constraints.ts`

These constants define length and size boundaries used by builders during `build()` validation.

| Constant | Value | Used by |
|----------|-------|---------|
| `REQUIRED_CHALLENGE_LENGTH` | `36` | Auth token request builders -- challenge must be exactly 36 characters |
| `CERTIFICATE_NAME_MIN_LENGTH` | `5` | Certificate enrollment builders |
| `CERTIFICATE_NAME_MAX_LENGTH` | `100` | Certificate enrollment builders |
| `SUBUNIT_NAME_MIN_LENGTH` | `5` | Subunit (organizational unit) builders |
| `SUBUNIT_NAME_MAX_LENGTH` | `256` | Subunit builders |
| `PERMISSION_DESCRIPTION_MIN_LENGTH` | `5` | Permission grant builders |
| `PERMISSION_DESCRIPTION_MAX_LENGTH` | `256` | Permission grant builders |

---

## ZIP Bomb Protection

**File:** `src/utils/zip.ts`

When exporting invoices from KSeF, the API returns encrypted ZIP archives. After decryption, the library extracts these archives using the `unzip()` function. ZIP bomb protection prevents a malicious or corrupted archive from consuming unbounded memory or disk space during extraction.

### What is a ZIP bomb?

A ZIP bomb is a small compressed file that expands to an enormous size when decompressed. A classic example: a 42 KB ZIP that expands to 4.5 petabytes. Without protection, extracting such a file would exhaust system memory and crash the process.

### Protection checks

The `unzip()` function enforces four limits, checked during extraction before reading file contents:

| Check | Default limit | Error message | Why |
|-------|--------------|---------------|-----|
| File count | 10,000 files | `zip contains too many files` | Prevents archives with millions of tiny files that exhaust file descriptors |
| Total uncompressed size | 2 GB (2,000,000,000 bytes) | `zip exceeds max_total_uncompressed_size` | Prevents memory exhaustion from aggregate size |
| Per-file uncompressed size | 500 MB (500,000,000 bytes) | `zip entry exceeds max_file_uncompressed_size` | Prevents a single enormous file from consuming all memory |
| Compression ratio | 200:1 | `zip entry exceeds max_compression_ratio` | Detects suspiciously high compression (normal XML compresses ~10:1) |

An additional check detects entries with zero compressed size but non-zero uncompressed size (`zip entry has suspicious compression metadata`), which would indicate corrupted or crafted metadata.

### Configuration

All limits are configurable through the `UnzipOptions` interface:

```typescript
interface UnzipOptions {
  maxFiles?: number;                   // default: 10,000
  maxTotalUncompressedSize?: number;   // default: 2,000,000,000 (2 GB)
  maxFileUncompressedSize?: number;    // default: 500,000,000 (500 MB)
  maxCompressionRatio?: number | null; // default: 200, null to disable
}
```

Set `maxCompressionRatio` to `null` to disable ratio checking (not recommended for untrusted data).

### Functions

#### `unzip(buffer, options?)`

Extracts a ZIP buffer into a `Map<string, Buffer>` (filename to content). Enforces all protection limits. Directory entries (filenames ending with `/`) are silently skipped.

```typescript
import { unzip } from 'ksef-client-ts';

const files = await unzip(zipBuffer, {
  maxFiles: 1000,
  maxCompressionRatio: 100,
});

for (const [name, content] of files) {
  console.log(`${name}: ${content.length} bytes`);
}
```

#### `createZip(entries)`

Creates a ZIP buffer from an array of `ZipEntryInput` objects. This function does not perform bomb protection (it is creating a ZIP, not reading an untrusted one).

```typescript
import { createZip } from 'ksef-client-ts';
import type { ZipEntryInput } from 'ksef-client-ts';

const entries: ZipEntryInput[] = [
  { fileName: 'invoice-001.xml', content: Buffer.from(xmlString) },
  { fileName: 'invoice-002.xml', content: Buffer.from(xmlString2) },
];

const zipBuffer = await createZip(entries);
```

### Integration with invoice export workflow

**File:** `src/workflows/invoice-export-workflow.ts`

The `exportAndDownload()` workflow function accepts an `extract` option. When `extract: true`, the downloaded and decrypted parts are concatenated and passed through `unzip()` with the configured safety limits:

```typescript
import { KSeFClient } from 'ksef-client-ts';

const client = new KSeFClient({ /* ... */ });

// Export with automatic extraction (ZIP bomb protection active)
const result = await client.workflows.exportAndDownload(filters, {
  extract: true,
  unzipOptions: {
    maxFiles: 5000,
    maxCompressionRatio: 150,
  },
});

// result.files is a Map<string, Buffer> of extracted invoice XMLs
for (const [filename, xml] of result.files) {
  console.log(`Extracted: ${filename} (${xml.length} bytes)`);
}
```

The `unzipOptions` field on `ExportAndDownloadOptions` passes directly to `unzip()`. When omitted, the defaults (10K files, 2 GB total, 500 MB per file, 200:1 ratio) apply.

---

## KSeFValidationError

**File:** `src/errors/ksef-validation-error.ts`

`KSeFValidationError` is the error type thrown by validators and builders when input data fails validation. It extends `KSeFError` (the base error for all library errors) and carries structured detail about what failed.

### Error hierarchy position

```
KSeFError (src/errors/ksef-error.ts)
  └── KSeFValidationError (src/errors/ksef-validation-error.ts)
```

`KSeFValidationError` is a **client-side** error -- it is thrown before any API call is made. This distinguishes it from `KSeFApiError` and its subtypes (401, 403, 429), which represent server responses.

### Interface

```typescript
interface ValidationDetail {
  field?: string;   // the field name that failed validation (optional)
  message: string;  // human-readable description of the failure
}

class KSeFValidationError extends KSeFError {
  readonly details: ValidationDetail[];

  constructor(message: string, details?: ValidationDetail[]);

  // Factory: single field validation failure
  static fromField(field: string, message: string): KSeFValidationError;

  // Factory: multiple validation messages (no field names)
  static fromMessages(messages: string[]): KSeFValidationError;
}
```

### Factory methods

**`fromField(field, message)`** -- Creates an error with a single `ValidationDetail` that includes the field name. Used by builders when a specific required field is missing:

```typescript
throw KSeFValidationError.fromField('challenge', 'Challenge is required');
// error.details = [{ field: 'challenge', message: 'Challenge is required' }]
```

**`fromMessages(messages)`** -- Creates an error from an array of message strings. The error's main message is all messages joined with `'; '`. Used when multiple validations fail simultaneously:

```typescript
throw KSeFValidationError.fromMessages([
  'ZIP data must not be empty',
  'maxPartSize must be positive',
]);
// error.message = 'ZIP data must not be empty; maxPartSize must be positive'
// error.details = [{ message: '...' }, { message: '...' }]
```

### Direct construction

For simple cases, the constructor is used directly with just a message string:

```typescript
throw new KSeFValidationError('maxPartSize must be a positive number');
// error.details = []  (empty array)
```

---

## Integration Points

Validation is used across the library at three levels: builders, HTTP policies, and workflows.

### Builders validate on `build()`

Every builder in `src/builders/` calls validation logic in its `build()` method. The pattern is consistent: check required fields, validate formats/constraints, throw `KSeFValidationError` on failure.

**`AuthTokenRequestBuilder`** (`src/builders/auth-token-request.ts`):
```typescript
build(): AuthTokenRequest {
  if (!this.challenge) {
    throw KSeFValidationError.fromField('challenge', 'Challenge is required');
  }
  if (!this.contextIdentifier) {
    throw KSeFValidationError.fromField('contextIdentifier', 'Context identifier is required');
  }
  // ...
}
```

**`BatchFileBuilder`** (`src/builders/batch-file.ts`):
```typescript
static build(zipBytes: Uint8Array, encryptFn, options?): BatchFileBuildResult {
  if (zipBytes.length === 0) {
    throw new KSeFValidationError('ZIP data must not be empty');
  }
  if (zipBytes.length > BATCH_MAX_TOTAL_SIZE) {
    throw new KSeFValidationError(`ZIP size exceeds maximum of 5 GB`);
  }
  // ...
}
```

**Permission builders** (`src/builders/permissions/person-permission.ts`, `entity-permission.ts`, `authorization-permission.ts`):
```typescript
build(): GrantPermissionsPersonRequest {
  if (!this.subjectIdentifier) {
    throw KSeFValidationError.fromField('subjectIdentifier', 'Subject identifier is required');
  }
  if (this.permissions.length === 0) {
    throw KSeFValidationError.fromField('permissions', 'At least one permission is required');
  }
  // ...
}
```

**`InvoiceQueryFilterBuilder`** (`src/builders/invoice-query-filter.ts`):
```typescript
build(): InvoiceQueryFilters {
  if (!this.subjectType) {
    throw KSeFValidationError.fromField('subjectType', 'Subject type is required');
  }
  if (!this.dateRange) {
    throw KSeFValidationError.fromField('dateRange', 'Date range is required');
  }
  // ...
}
```

### Presigned URL policy

**File:** `src/http/presigned-url-policy.ts`

The presigned URL security policy throws `KSeFValidationError` when a download URL fails security checks (non-HTTPS, disallowed host, redirect parameters, private IP). See [HTTP Resilience -- Presigned URL Validation](./http-resilience.md#presigned-url-validation) for details.

### UPO parser

**File:** `src/xml/upo-parser.ts`

The UPO (Urzedowe Poswiadczenie Odbioru) XML parser uses `KSeFValidationError` to report malformed or unparseable UPO documents.

### Workflow-level ZIP protection

**File:** `src/workflows/invoice-export-workflow.ts`

The export workflow passes `UnzipOptions` from the caller through to `unzip()`, providing ZIP bomb protection at the workflow level. Standard `Error` (not `KSeFValidationError`) is thrown by `unzip()` when limits are exceeded, since the ZIP utility is a general-purpose module.

### Catching validation errors

```typescript
import { KSeFValidationError } from 'ksef-client-ts';

try {
  const request = builder.build();
} catch (err) {
  if (err instanceof KSeFValidationError) {
    console.error('Validation failed:', err.message);
    for (const detail of err.details) {
      console.error(`  Field: ${detail.field ?? '(none)'}, Message: ${detail.message}`);
    }
  }
}
```
