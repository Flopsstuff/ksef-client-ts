### Requirement: SystemCode enum defines all KSeF document types
The system SHALL export a `SystemCode` string enum with exactly 5 members representing all KSeF document structures:
- `FA_2` = `"FA (2)"` — standard invoice v2
- `FA_3` = `"FA (3)"` — standard invoice v3
- `PEF_3` = `"PEF (3)"` — Peppol e-invoice (UBL)
- `PEF_KOR_3` = `"PEF_KOR (3)"` — Peppol credit note (UBL)
- `FA_RR_1` = `"FA_RR (1)"` — revenue record / technical correction

#### Scenario: Enum values match KSeF API wire format
- **WHEN** a `SystemCode` member is used as `formCode.systemCode` in an API request
- **THEN** its string value MUST match the format expected by KSeF API (e.g., `"FA (2)"`, `"PEF (3)"`)

#### Scenario: Enum is exhaustive
- **WHEN** a developer iterates over `SystemCode` members
- **THEN** there SHALL be exactly 5 members covering all document types in KSeF API v2.3.0

### Requirement: Typed FormCode constants for all document variants
The system SHALL export a `FORM_CODES` constant object containing 7 pre-built `FormCode` objects with literal types. Each constant MUST have readonly `systemCode`, `schemaVersion`, and `value` fields matching the KSeF API specification:

| Key | systemCode | schemaVersion | value |
|-----|------------|---------------|-------|
| `FA_2` | `FA (2)` | `1-0E` | `FA` |
| `FA_3` | `FA (3)` | `1-0E` | `FA` |
| `PEF_3` | `PEF (3)` | `2-1` | `PEF` |
| `PEF_KOR_3` | `PEF_KOR (3)` | `2-1` | `PEF` |
| `FA_RR_1_LEGACY` | `FA_RR (1)` | `1-0E` | `RR` |
| `FA_RR_1_TRANSITION` | `FA_RR (1)` | `1-1E` | `RR` |
| `FA_RR_1` | `FA_RR (1)` | `1-1E` | `FA_RR` |

#### Scenario: Constants are type-safe with literal types
- **WHEN** a developer uses `FORM_CODES.FA_2.systemCode`
- **THEN** TypeScript SHALL infer the type as the string literal `"FA (2)"`, not `string`

#### Scenario: Constants satisfy the FormCode interface
- **WHEN** a `FORM_CODES` member is passed where `FormCode` is expected
- **THEN** it MUST be assignable without type errors

### Requirement: Session-type constrained FormCode unions
The system SHALL export two union types restricting which form codes are valid per session type:
- `OnlineSessionFormCode` — all 7 variants (FA_2, FA_3, PEF_3, PEF_KOR_3, FA_RR_1_LEGACY, FA_RR_1_TRANSITION, FA_RR_1)
- `BatchSessionFormCode` — FA and FA_RR variants only (FA_2, FA_3, FA_RR_1_LEGACY, FA_RR_1_TRANSITION, FA_RR_1); PEF and PEF_KOR MUST be excluded

#### Scenario: PEF form code rejected for batch session at type level
- **WHEN** a developer passes `FORM_CODES.PEF_3` where `BatchSessionFormCode` is expected
- **THEN** TypeScript SHALL report a type error at compile time

#### Scenario: All form codes accepted for online session
- **WHEN** a developer passes any `FORM_CODES` member where `OnlineSessionFormCode` is expected
- **THEN** it MUST compile without type errors

### Requirement: FormCode lookup by SystemCode
The system SHALL provide a `getFormCode(systemCode: SystemCode)` function that returns the default `FormCode` constant for a given system code. The default for `FA_RR_1` SHALL be the current variant (`FA_RR_1`, not legacy or transition).

#### Scenario: Lookup FA_2
- **WHEN** `getFormCode(SystemCode.FA_2)` is called
- **THEN** it SHALL return `FORM_CODES.FA_2`

#### Scenario: Lookup FA_RR_1 returns current variant
- **WHEN** `getFormCode(SystemCode.FA_RR_1)` is called
- **THEN** it SHALL return `FORM_CODES.FA_RR_1` (schemaVersion `1-1E`, value `FA_RR`)

### Requirement: Parse FormCode from API response
The system SHALL provide a `parseFormCode(raw: FormCode)` function that matches a raw `{ systemCode, schemaVersion, value }` object from an API response to the closest typed constant. If no exact match is found, it SHALL return the raw object unchanged.

#### Scenario: Parse exact match
- **WHEN** `parseFormCode({ systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" })` is called
- **THEN** it SHALL return `FORM_CODES.FA_3`

#### Scenario: Parse FA_RR transition variant
- **WHEN** `parseFormCode({ systemCode: "FA_RR (1)", schemaVersion: "1-1E", value: "RR" })` is called
- **THEN** it SHALL return `FORM_CODES.FA_RR_1_TRANSITION`

#### Scenario: Parse unknown form code passes through
- **WHEN** `parseFormCode({ systemCode: "UNKNOWN (9)", schemaVersion: "1-0E", value: "X" })` is called
- **THEN** it SHALL return the raw object as-is

### Requirement: Validate FormCode for session type
The system SHALL provide a `validateFormCodeForSession(formCode: FormCode, sessionType: 'online' | 'batch')` function that returns `true` if the form code is valid for the given session type, `false` otherwise.

#### Scenario: PEF invalid for batch
- **WHEN** `validateFormCodeForSession(FORM_CODES.PEF_3, 'batch')` is called
- **THEN** it SHALL return `false`

#### Scenario: PEF valid for online
- **WHEN** `validateFormCodeForSession(FORM_CODES.PEF_3, 'online')` is called
- **THEN** it SHALL return `true`

#### Scenario: FA valid for both
- **WHEN** `validateFormCodeForSession(FORM_CODES.FA_2, 'batch')` is called
- **THEN** it SHALL return `true`

### Requirement: InvoiceType mapping per document structure
The system SHALL export a mapping from `SystemCode` to allowed `InvoiceType` values:
- `FA_2`, `FA_3` → `Vat`, `Zal`, `Kor`, `Roz`, `Upr`, `KorZal`, `KorRoz`
- `PEF_3` → `VatPef`, `VatPefSp`, `KorPef`
- `PEF_KOR_3` → `KorPef`
- `FA_RR_1` → `VatRr`, `KorVatRr`

#### Scenario: Get allowed invoice types for FA
- **WHEN** the mapping is queried for `SystemCode.FA_2`
- **THEN** it SHALL return `['Vat', 'Zal', 'Kor', 'Roz', 'Upr', 'KorZal', 'KorRoz']`

#### Scenario: Get allowed invoice types for PEF
- **WHEN** the mapping is queried for `SystemCode.PEF_3`
- **THEN** it SHALL return `['VatPef', 'VatPefSp', 'KorPef']`

### Requirement: Human-friendly form code keys for CLI
The system SHALL export a `FORM_CODE_KEYS` mapping from short string keys to `FormCode` constants for CLI usage:
- `FA2` → `FORM_CODES.FA_2`
- `FA3` → `FORM_CODES.FA_3`
- `PEF3` → `FORM_CODES.PEF_3`
- `PEFKOR3` → `FORM_CODES.PEF_KOR_3`
- `FARR1` → `FORM_CODES.FA_RR_1`

#### Scenario: CLI key lookup
- **WHEN** `FORM_CODE_KEYS["FA3"]` is accessed
- **THEN** it SHALL return `FORM_CODES.FA_3`

#### Scenario: Keys are case-sensitive
- **WHEN** `FORM_CODE_KEYS["fa3"]` is accessed
- **THEN** it SHALL return `undefined`
