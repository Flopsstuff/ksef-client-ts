## ADDED Requirements

### Requirement: XML well-formedness check (Level 1)
`InvoiceValidator` SHALL parse input XML string with `@xmldom/xmldom` DOMParser and report parsing errors with location information.

#### Scenario: Valid XML
- **WHEN** `validateWellFormedness(xml)` is called with well-formed XML
- **THEN** it returns `{ valid: true, errors: [], warnings: [] }`

#### Scenario: Malformed XML
- **WHEN** `validateWellFormedness(xml)` is called with XML that has unclosed tags
- **THEN** it returns `{ valid: false, errors: [{ code: 'XML_PARSE_ERROR', message: ..., path: '' }] }`

#### Scenario: Empty input
- **WHEN** `validateWellFormedness('')` is called with an empty string
- **THEN** it returns `{ valid: false }` with error code `XML_PARSE_ERROR`

### Requirement: Schema validation (Level 2)
`InvoiceValidator` SHALL convert parsed XML DOM to a plain JS object and validate it against the corresponding generated Zod schema. It MUST auto-detect the schema type from the XML namespace URI.

#### Scenario: Valid FA(3) invoice
- **WHEN** `validateSchema(xml)` is called with valid FA(3) invoice XML
- **THEN** it returns `{ valid: true, errors: [], schemaType: 'FA3' }`

#### Scenario: Missing required element
- **WHEN** `validateSchema(xml)` is called with FA(3) XML missing `Podmiot1`
- **THEN** it returns `{ valid: false, errors: [{ code: 'MISSING_REQUIRED_ELEMENT', path: '/Faktura/Podmiot1', ... }] }`

#### Scenario: Invalid enum value
- **WHEN** `validateSchema(xml)` is called with an invalid country code in `KodKraju`
- **THEN** it returns an error with code `INVALID_ENUM_VALUE` and the path to the element

#### Scenario: String pattern mismatch
- **WHEN** `validateSchema(xml)` is called with a NIP value that doesn't match the XSD pattern
- **THEN** it returns an error with code `PATTERN_MISMATCH` and the expected pattern

#### Scenario: Excess occurrences
- **WHEN** `validateSchema(xml)` contains more elements than `maxOccurs` allows
- **THEN** it returns an error with code `MAX_OCCURS_EXCEEDED`

#### Scenario: Explicit schema override
- **WHEN** `validateSchema(xml, { schema: 'FA2' })` is called with explicit schema type
- **THEN** it uses the FA(2) schema regardless of the XML namespace

#### Scenario: Unknown namespace
- **WHEN** `validateSchema(xml)` is called with XML whose namespace doesn't match any known schema
- **THEN** it returns `{ valid: false, errors: [{ code: 'UNKNOWN_SCHEMA', ... }] }`

### Requirement: Schema auto-detection
`InvoiceValidator` SHALL detect the invoice schema type from the root element's namespace URI.

#### Scenario: Detect FA(2) by namespace
- **WHEN** XML root element has namespace `http://crd.gov.pl/wzor/2023/06/29/12648/`
- **THEN** `schemaType` is `'FA2'`

#### Scenario: Detect FA(3) by namespace
- **WHEN** XML root element has namespace `http://crd.gov.pl/wzor/2025/06/25/13775/`
- **THEN** `schemaType` is `'FA3'`

#### Scenario: Detect PEF vs PEF_KOR by root element
- **WHEN** XML has PEF namespace and root element is `Faktura`
- **THEN** `schemaType` is `'PEF3'`

#### Scenario: Detect PEF_KOR by root element
- **WHEN** XML has PEF namespace and root element is `FakturaKorygujaca`
- **THEN** `schemaType` is `'PEF_KOR3'`

#### Scenario: Detect RR version by schema attribute
- **WHEN** XML has RR namespace and schemaVersion attribute is `1-1E`
- **THEN** `schemaType` is `'RR1_V11E'`

### Requirement: Business rules validation (Level 3)
`InvoiceValidator` SHALL validate business rules that go beyond XSD schema constraints.

#### Scenario: NIP checksum validation
- **WHEN** `validateBusinessRules(xml)` is called with invoice XML containing an invalid NIP in `Podmiot1/DaneIdentyfikacyjne/NIP`
- **THEN** it returns an error with code `INVALID_NIP_CHECKSUM` and the path to the NIP element

#### Scenario: PESEL checksum validation
- **WHEN** invoice XML contains an invalid PESEL in subject identification
- **THEN** it returns an error with code `INVALID_PESEL_CHECKSUM`

#### Scenario: Valid business rules
- **WHEN** all NIP/PESEL values in the invoice pass checksum validation
- **THEN** `validateBusinessRules(xml)` returns `{ valid: true, errors: [] }`

### Requirement: Combined validation
`validate(xml)` SHALL run all three levels sequentially and return a combined result. It MUST stop at the first failing level (Level 1 failure skips Level 2 and 3).

#### Scenario: All levels pass
- **WHEN** `validate(xml)` is called with a fully valid invoice
- **THEN** it returns `{ valid: true, errors: [], warnings: [], schemaType: 'FA3' }`

#### Scenario: Level 1 failure short-circuits
- **WHEN** `validate(xml)` is called with malformed XML
- **THEN** it returns Level 1 errors only, does not attempt Level 2 or 3

#### Scenario: Level 2 failure includes all schema errors
- **WHEN** `validate(xml)` is called with well-formed XML that has multiple schema violations
- **THEN** it returns all Level 2 errors (not just the first one) and does not run Level 3

### Requirement: Validation result structure
All validation methods MUST return `InvoiceValidationResult` with typed errors.

#### Scenario: Error includes XPath-like path
- **WHEN** a validation error occurs on element `Podmiot1/DaneIdentyfikacyjne/NIP`
- **THEN** the error `path` field is `/Faktura/Podmiot1/DaneIdentyfikacyjne/NIP`

#### Scenario: Error message includes context
- **WHEN** a pattern mismatch or type error occurs
- **THEN** the error `message` field includes relevant context (e.g., the expected pattern or type) from the underlying Zod validation

### Requirement: Schema registry
`SchemaRegistry` SHALL map schema type identifiers to their corresponding Zod schemas with lazy loading.

#### Scenario: Resolve schema by type
- **WHEN** `SchemaRegistry.get('FA3')` is called
- **THEN** it returns the FA(3) Zod schema

#### Scenario: Lazy loading
- **WHEN** no validation has been performed yet
- **THEN** no schema modules are loaded into memory

#### Scenario: List available schemas
- **WHEN** `SchemaRegistry.availableSchemas()` is called
- **THEN** it returns `['FA2', 'FA3', 'PEF3', 'PEF_KOR3', 'RR1_V10E', 'RR1_V11E']`

### Requirement: XML to object conversion
`xmlToObject()` SHALL convert an xmldom Document to a plain JS object suitable for Zod validation.

#### Scenario: Elements become object properties
- **WHEN** XML element `<Podmiot1><NIP>1234567890</NIP></Podmiot1>` is converted
- **THEN** the result includes `{ Podmiot1: { NIP: '1234567890' } }`

#### Scenario: Repeated elements become arrays
- **WHEN** XML contains multiple `<FakturaWiersz>` elements
- **THEN** the result includes `FakturaWiersz: [...]` as an array

#### Scenario: Attributes use @ prefix
- **WHEN** XML element has attributes `<Faktura kodFormularza="FA">`
- **THEN** the result includes `{ '@kodFormularza': 'FA' }`

#### Scenario: Namespace prefixes are stripped
- **WHEN** XML uses namespace prefixes like `<tns:Faktura>`
- **THEN** the converted object uses unprefixed names: `Faktura`

### Requirement: Opt-in validation before send
Invoice sending methods SHALL accept an optional `validate` flag. When `true`, the validator runs Level 1+2 before encryption. On failure, it MUST throw `KSeFValidationError`.

#### Scenario: Validation passes before send
- **WHEN** `sendInvoice(xml, { validate: true })` is called with valid XML
- **THEN** the invoice is validated, encrypted, and sent normally

#### Scenario: Validation fails before send
- **WHEN** `sendInvoice(xml, { validate: true })` is called with invalid XML
- **THEN** it throws `KSeFValidationError` with the validation errors and does NOT send the request

#### Scenario: Validation disabled by default
- **WHEN** `sendInvoice(xml)` is called without the `validate` option
- **THEN** no validation is performed (backward-compatible)
