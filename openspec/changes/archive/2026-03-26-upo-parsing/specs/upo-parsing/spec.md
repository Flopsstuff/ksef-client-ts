## ADDED Requirements

### Requirement: Parse UPO XML into typed object
The system SHALL provide a `parseUpoXml(xml: string | Buffer)` function that parses KSeF UPO XML (v4-2 and v4-3) into a typed `UpoPotwierdzenie` object. The function MUST accept both `string` and `Buffer` input. Buffer input MUST be decoded as UTF-8.

#### Scenario: Parse single-invoice UPO with NIP context
- **WHEN** `parseUpoXml()` is called with valid UPO XML containing one `Dokument` element and `Nip` context identifier
- **THEN** it returns a `UpoPotwierdzenie` with `uwierzytelnienie.idKontekstu` of kind `Nip`, and `dokumenty` array containing exactly one `UpoDokument`

#### Scenario: Parse multi-document session UPO
- **WHEN** `parseUpoXml()` is called with valid UPO XML containing multiple `Dokument` elements
- **THEN** it returns a `UpoPotwierdzenie` with `dokumenty` array containing all documents in order, and `opisPotwierdzenia` populated with page/count metadata

#### Scenario: Parse UPO with Buffer input
- **WHEN** `parseUpoXml()` is called with a `Buffer` containing valid UPO XML
- **THEN** it decodes the buffer as UTF-8 and returns the same result as string input

#### Scenario: Parse UPO with XML namespace prefixes
- **WHEN** `parseUpoXml()` is called with UPO XML that has namespace prefixes (e.g., `<ns1:Potwierdzenie>`)
- **THEN** namespace prefixes MUST be stripped and parsing succeeds identically to non-prefixed XML

### Requirement: Support all context identifier variants
The parser MUST handle all 4 XSD `IdKontekstu` choice elements as a discriminated union `UpoContextId` with a `kind` field.

#### Scenario: NIP context identifier
- **WHEN** UPO XML contains `<Nip>` inside `<IdKontekstu>`
- **THEN** `idKontekstu` is `{ kind: 'Nip', nip: '<value>' }`

#### Scenario: Internal ID context identifier
- **WHEN** UPO XML contains `<IdWewnetrzny>` inside `<IdKontekstu>`
- **THEN** `idKontekstu` is `{ kind: 'IdWewnetrzny', idWewnetrzny: '<value>' }`

#### Scenario: Composite VAT EU context identifier
- **WHEN** UPO XML contains `<IdZlozonyVatUE>` inside `<IdKontekstu>`
- **THEN** `idKontekstu` is `{ kind: 'IdZlozonyVatUE', idZlozonyVatUE: '<value>' }`

#### Scenario: Peppol service provider context identifier
- **WHEN** UPO XML contains `<IdDostawcyUslugPeppol>` inside `<IdKontekstu>`
- **THEN** `idKontekstu` is `{ kind: 'IdDostawcyUslugPeppol', idDostawcyUslugPeppol: '<value>' }`

### Requirement: Support all auth proof variants
The parser MUST handle both XSD authentication proof choice elements as a discriminated union `UpoAuthProof` with a `kind` field.

#### Scenario: KSeF token reference auth proof
- **WHEN** UPO XML contains `<NumerReferencyjnyTokenaKSeF>` inside `<Uwierzytelnienie>`
- **THEN** `uwierzytelnienie.proof` is `{ kind: 'NumerReferencyjnyTokenaKSeF', numerReferencyjnyTokenaKSeF: '<value>' }`

#### Scenario: Document hash auth proof
- **WHEN** UPO XML contains `<SkrotDokumentuUwierzytelniajacego>` inside `<Uwierzytelnienie>`
- **THEN** `uwierzytelnienie.proof` is `{ kind: 'SkrotDokumentuUwierzytelniajacego', skrotDokumentuUwierzytelniajacego: '<value>' }`

### Requirement: Handle optional pagination descriptor
The parser MUST handle the optional `OpisPotwierdzenia` element. When present, its numeric fields MUST be parsed from string to number.

#### Scenario: UPO with pagination descriptor
- **WHEN** UPO XML contains `<OpisPotwierdzenia>` with `<Strona>`, `<LiczbaStron>`, `<ZakresDokumentowOd>`, `<ZakresDokumentowDo>`, `<CalkowitaLiczbaDokumentow>`
- **THEN** `opisPotwierdzenia` is populated with all fields as numbers (e.g., `strona: 1`, `liczbaStron: 3`)

#### Scenario: UPO without pagination descriptor
- **WHEN** UPO XML does not contain `<OpisPotwierdzenia>`
- **THEN** `opisPotwierdzenia` is `undefined`

### Requirement: Validate required fields
The parser MUST validate that all required fields are present and non-empty. Missing or empty required fields MUST throw `KSeFValidationError` with field path context.

#### Scenario: Missing root Potwierdzenie element
- **WHEN** `parseUpoXml()` is called with XML that lacks a `Potwierdzenie` root element
- **THEN** it throws `KSeFValidationError` with message indicating missing root element

#### Scenario: Missing required document field
- **WHEN** UPO XML has a `Dokument` element missing `NumerKSeFDokumentu`
- **THEN** it throws `KSeFValidationError` with field path `Dokument.NumerKSeFDokumentu`

#### Scenario: Empty required string field
- **WHEN** UPO XML has a `Dokument` element with empty `<NipSprzedawcy></NipSprzedawcy>`
- **THEN** it throws `KSeFValidationError` indicating the field is empty

#### Scenario: No Dokument elements
- **WHEN** UPO XML has zero `Dokument` elements
- **THEN** it throws `KSeFValidationError` indicating at least one document is required

#### Scenario: Unsupported context identifier type
- **WHEN** UPO XML has an `<IdKontekstu>` element with none of the 4 known child elements
- **THEN** it throws `KSeFValidationError` indicating unsupported context identifier

#### Scenario: Invalid numeric field in OpisPotwierdzenia
- **WHEN** UPO XML has `<Strona>abc</Strona>` in `OpisPotwierdzenia`
- **THEN** it throws `KSeFValidationError` indicating invalid number for field `OpisPotwierdzenia.Strona`

### Requirement: Normalize single-element XML arrays
The parser MUST handle the XML ambiguity where a single `<Dokument>` element is parsed as an object (not array) by `fast-xml-parser`. Both single-element and multi-element cases MUST result in a `UpoDokument[]` array.

#### Scenario: Single Dokument element
- **WHEN** UPO XML contains exactly one `<Dokument>` element
- **THEN** `dokumenty` is an array with one element

#### Scenario: Multiple Dokument elements
- **WHEN** UPO XML contains 3 `<Dokument>` elements
- **THEN** `dokumenty` is an array with 3 elements in document order

### Requirement: Export UPO types from package barrel
All UPO types (`UpoPotwierdzenie`, `UpoContextId`, `UpoAuthProof`, `UpoUwierzytelnienie`, `UpoOpisPotwierdzenia`, `UpoDokument`) and the `parseUpoXml` function MUST be exported from the package's public API via `src/index.ts`.

#### Scenario: Import parseUpoXml from package
- **WHEN** a consumer imports `{ parseUpoXml }` from the package
- **THEN** the function is available and callable

#### Scenario: Import UPO types from package
- **WHEN** a consumer imports `{ UpoPotwierdzenie, UpoContextId, UpoDokument }` from the package
- **THEN** the types are available for type annotations

### Requirement: Workflow integration via waitForUpoParsed
The `OnlineSessionHandle` interface MUST provide a `waitForUpoParsed(options?)` method that polls for session completion, downloads UPO XML for each page, parses each with `parseUpoXml()`, and returns a `ParsedUpoInfo` object. The existing `waitForUpo()` MUST remain unchanged.

#### Scenario: Wait for parsed UPO in online session
- **WHEN** `handle.waitForUpoParsed()` is called on a completed online session with 1 UPO page
- **THEN** it returns `ParsedUpoInfo` with `pages` array (URLs), invoice counts, and `parsed` array containing one `UpoPotwierdzenie`

#### Scenario: Wait for parsed UPO with multiple pages
- **WHEN** `handle.waitForUpoParsed()` is called and the session has 2 UPO pages
- **THEN** `parsed` array contains 2 `UpoPotwierdzenie` objects, one per page

#### Scenario: Existing waitForUpo unchanged
- **WHEN** `handle.waitForUpo()` is called
- **THEN** it returns `UpoInfo` (without `parsed` field), identical to pre-change behavior

### Requirement: Batch workflow parsed UPO support
The `BatchSessionWorkflow` MUST support returning parsed UPO via a new `ParsedBatchUploadResult` type. The existing `BatchUploadResult` MUST remain unchanged.

#### Scenario: Batch upload with parsed UPO
- **WHEN** batch workflow completes and consumer calls `uploadBatchParsed()` or equivalent
- **THEN** the result includes both `UpoInfo` and `parsed: UpoPotwierdzenie[]`
