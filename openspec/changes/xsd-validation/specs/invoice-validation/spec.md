## ADDED Requirements

### Requirement: XML well-formedness validation (Level 1)
The `InvoiceValidator` SHALL parse input XML using `@xmldom/xmldom` DOMParser and report parsing errors with line/column information. If the XML is not well-formed, validation SHALL stop and return errors without proceeding to schema or business rule checks.

#### Scenario: Valid XML
- **WHEN** `validator.validate('<Faktura>...</Faktura>')` is called with well-formed XML
- **THEN** it SHALL proceed to Level 2 schema validation

#### Scenario: Malformed XML
- **WHEN** `validator.validate('<Faktura><unclosed>')` is called with malformed XML
- **THEN** it SHALL return `{ valid: false, errors: [{ code: 'XML_PARSE_ERROR', ... }] }` with line/column information and NOT attempt schema validation

#### Scenario: Empty input
- **WHEN** `validator.validate('')` is called with empty string
- **THEN** it SHALL return an error with code `XML_EMPTY_INPUT`

### Requirement: Schema validation via generated Zod schemas (Level 2)
The `InvoiceValidator` SHALL convert the parsed XML DOM into a plain JavaScript object and validate it against the appropriate generated Zod schema. It MUST support both auto-detection and explicit schema selection.

#### Scenario: Auto-detect FA(3) from namespace
- **WHEN** `validator.validate(fa3Xml)` is called and the root element has namespace `http://crd.gov.pl/wzor/2025/06/25/13775/`
- **THEN** it SHALL auto-detect `FA3` as the schema type and validate against the FA(3) Zod schema

#### Scenario: Auto-detect FA(2) from namespace
- **WHEN** `validator.validate(fa2Xml)` is called and the root element has namespace `http://crd.gov.pl/wzor/2023/06/29/12648/`
- **THEN** it SHALL auto-detect `FA2` as the schema type

#### Scenario: Explicit schema selection
- **WHEN** `validator.validate(xml, { schema: 'FA3' })` is called
- **THEN** it SHALL use the FA(3) schema regardless of the XML namespace

#### Scenario: Unknown namespace without explicit schema
- **WHEN** `validator.validate(xml)` is called and the root element namespace does not match any known schema
- **THEN** it SHALL return an error with code `UNKNOWN_SCHEMA` listing the detected namespace

#### Scenario: Missing required element
- **WHEN** an FA(3) invoice XML is missing the required `Podmiot1` element
- **THEN** validation SHALL return an error with code `MISSING_REQUIRED_ELEMENT` and path `/Faktura/Podmiot1`

#### Scenario: Invalid enumeration value
- **WHEN** an invoice has `<KodKraju>XX</KodKraju>` where `XX` is not a valid country code
- **THEN** validation SHALL return an error with code `INVALID_ENUM_VALUE`, the path, expected values, and the actual value

#### Scenario: String pattern mismatch
- **WHEN** an invoice has `<NIP>0000000000</NIP>` that does not match the TNrNIP pattern
- **THEN** validation SHALL return an error with code `PATTERN_MISMATCH` and the expected pattern

#### Scenario: Numeric constraint violation
- **WHEN** an invoice has a currency amount exceeding 16 total digits
- **THEN** validation SHALL return an error with code `NUMERIC_CONSTRAINT` with expected and actual details

### Requirement: Business rule validation (Level 3)
The `InvoiceValidator` SHALL provide optional business rule checks beyond XSD schema validation. Business rules validate semantic correctness that XSD cannot express.

#### Scenario: NIP checksum validation
- **WHEN** an invoice contains NIP values in `Podmiot1`, `Podmiot2`, or `Podmiot3`
- **THEN** the validator SHALL verify each NIP's checksum using the existing `isValidNip()` function from `src/validation/patterns.ts` and report failures with code `INVALID_NIP_CHECKSUM` and the path to the invalid NIP element

#### Scenario: PESEL checksum validation
- **WHEN** an invoice contains PESEL values
- **THEN** the validator SHALL verify each PESEL's checksum using `isValidPesel()` and report failures with code `INVALID_PESEL_CHECKSUM`

#### Scenario: Correction invoice must reference original
- **WHEN** a correction invoice (type `Kor`, `KorZal`, `KorRoz`, `KorPef`, `KorVatRr`) is validated
- **THEN** the validator SHALL check that the correction reference section is present and report `MISSING_CORRECTION_REFERENCE` if absent

#### Scenario: Business rules only mode
- **WHEN** `validator.validateBusinessRules(xml)` is called
- **THEN** it SHALL run only Level 3 checks, skipping XML parsing errors and schema validation

### Requirement: Validation result structure
The `InvoiceValidator` SHALL return an `InvoiceValidationResult` object from all validation methods.

#### Scenario: Successful validation
- **WHEN** a valid invoice passes all three levels
- **THEN** the result SHALL be `{ valid: true, errors: [], warnings: [], detectedSchema: 'FA3' }`

#### Scenario: Multiple errors
- **WHEN** an invoice has both a missing element and an invalid NIP
- **THEN** all errors SHALL be collected and returned together (not fail-fast), each with `code`, `path`, `message`, and optionally `expected`/`actual`

#### Scenario: Warning level issues
- **WHEN** a non-critical issue is detected (e.g., deprecated element used)
- **THEN** it SHALL appear in the `warnings` array with `level: 'warning'`, not in `errors`

### Requirement: XML-to-object conversion
The validator SHALL include an `xmlToObject()` function that converts a DOM document to a plain JavaScript object suitable for Zod validation. It MUST handle XML namespaces, attributes (prefixed with `@`), text content, repeated elements (as arrays), and mixed content.

#### Scenario: Simple element
- **WHEN** `<NIP>1234567890</NIP>` is converted
- **THEN** the result SHALL be `{ NIP: '1234567890' }`

#### Scenario: Element with attributes
- **WHEN** `<KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>` is converted
- **THEN** the result SHALL be `{ KodFormularza: { '#text': 'FA', '@kodSystemowy': 'FA (3)', '@wersjaSchemy': '1-0E' } }`

#### Scenario: Repeated elements become array
- **WHEN** `<Fa><FaWiersz>...</FaWiersz><FaWiersz>...</FaWiersz></Fa>` is converted
- **THEN** `FaWiersz` SHALL be an array of 2 objects

#### Scenario: Single element that can repeat
- **WHEN** a `FaWiersz` appears once but the schema defines `maxOccurs=unbounded`
- **THEN** the converter SHALL still wrap it in an array (schema-aware conversion)

### Requirement: Schema registry maps FormCode/SystemCode to Zod schemas
The `SchemaRegistry` SHALL provide lookup functions to find the correct Zod schema for validation.

#### Scenario: Lookup by SystemCode
- **WHEN** `schemaRegistry.getSchema(SystemCode.FA_3)` is called
- **THEN** it SHALL return the FA(3) root Zod schema

#### Scenario: Lookup by namespace URI
- **WHEN** `schemaRegistry.getSchemaByNamespace('http://crd.gov.pl/wzor/2025/06/25/13775/')` is called
- **THEN** it SHALL return the FA(3) root Zod schema

#### Scenario: Lookup by FormCode
- **WHEN** `schemaRegistry.getSchemaByFormCode(FORM_CODES.FA_3)` is called
- **THEN** it SHALL return the FA(3) root Zod schema

#### Scenario: Lookup FA_RR with schema version disambiguation
- **WHEN** `schemaRegistry.getSchemaByFormCode(FORM_CODES.FA_RR_1)` is called (schemaVersion `1-1E`)
- **THEN** it SHALL return the RR(1) v1-1E schema, not v1-0E

### Requirement: Validation levels are independently selectable
The `InvoiceValidator` SHALL expose three methods for different validation granularities:
- `validate(xml, options?)` — runs all three levels (default)
- `validateSchema(xml, options?)` — Level 1 + Level 2 only
- `validateBusinessRules(xml)` — Level 3 only (assumes valid XML structure)

#### Scenario: Schema-only validation
- **WHEN** `validator.validateSchema(xml)` is called
- **THEN** it SHALL run XML parsing and Zod schema validation but skip business rules

#### Scenario: Full validation
- **WHEN** `validator.validate(xml)` is called
- **THEN** it SHALL run all three levels in order, collecting all errors
