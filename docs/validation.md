# Validation & Data Integrity

Deep dive into the validation layer that ensures data correctness before it reaches the KSeF API. This layer provides checksum-based validators for Polish tax identifiers, regex patterns for all KSeF data formats, constraint constants for builder validation, and ZIP bomb protection for export downloads.

---

## Overview

The Polish National e-Invoice System (KSeF) enforces strict format and checksum rules on identifiers like NIP (tax ID), PESEL (personal ID), and KSeF invoice numbers. Submitting malformed data results in cryptic API errors or silent rejection. The validation layer catches these problems client-side, before any network I/O, producing clear error messages with field-level detail.

The layer has four components:

| Component | File | Role |
|-----------|------|------|
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
