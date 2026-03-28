## Context

UPO (Urzedowe Poswiadczenie Odbioru — Official Receipt Confirmation) is an XML document returned by KSeF that confirms successful invoice submission. Currently, `SessionStatusService` fetches UPO as raw XML strings (`UpoResult.upo: string`). Users must parse XML manually to extract KSeF numbers, hashes, and session metadata.

The UPO XML schema (`upo-v4-3.xsd`) defines a `Potwierdzenie` root element containing authentication context (4 variants), auth proof (2 variants), optional pagination, and up to 10,000 document records per page.

`fast-xml-parser` v5.2.0 is already a project dependency (used by `xml-crypto`). No new dependencies needed.

## Goals / Non-Goals

**Goals:**
- Parse UPO XML (v4-2 and v4-3) into fully typed TypeScript objects
- Validate all required fields, throw `KSeFValidationError` with field-path context on malformed input
- Use discriminated unions for mutually exclusive XML choice elements (context ID, auth proof)
- Integrate with existing workflows and CLI without breaking changes
- Support both `string` and `Buffer` input

**Non-Goals:**
- XSD schema validation (that's P3.9)
- UPO digital signature verification (XAdES signature on UPO itself)
- UPO XML generation/serialization (read-only parser)
- Offline mode / KOD II QR signing (that's P3.1)
- Automatic UPO download + parse in `SessionStatusService` (keep service layer raw, parse in consumer code)

## Decisions

### D1: File location — new `src/xml/` module

**Decision**: Create `src/xml/upo-parser.ts` with types and parser co-located in one file.

**Why not `src/models/upo/types.ts` + `src/services/upo-parser.ts`**:
- `src/models/` contains API request/response types (JSON). UPO types are XML-derived, not API types.
- `src/services/` contains REST API wrappers. A pure XML parser is not an API service.
- Co-location keeps the ~6 interfaces + parser function in one self-contained ~200-line file.

**Why `src/xml/`**: Creates a clear module for XML parsing, positioned for future additions (P3.4 invoice XML serialization, P3.2 UPO parsing). Re-export types from `src/xml/index.ts` → `src/index.ts`.

**Alternatives considered**:
- `src/utils/upo-parser.ts` — too generic, XML parsing is a distinct capability
- `src/crypto/upo-parser.ts` — wrong domain, this is parsing not cryptography

### D2: Polish field names from XSD, English wrapper names

**Decision**: Keep XSD-native Polish field names for parsed UPO fields. Use English for module-level names (`parseUpoXml`, `UpoParser`).

**Rationale**:
- UPO XSD uses Polish: `NipSprzedawcy`, `NumerKSeFDokumentu`, `DataWystawieniaFaktury`
- Translating would create a mapping layer users must mentally reverse when debugging against raw XML
- All 4 reference implementations keep Polish names
- English names for the public API surface: function `parseUpoXml()`, type `UpoPotwierdzenie`

Field name convention: camelCase Polish (`nipSprzedawcy`, `numerKSeFDokumentu`) matching smekcio reference.

### D3: Discriminated unions with `kind` field

**Decision**: Model XSD `<xs:choice>` elements as TypeScript discriminated unions with explicit `kind` discriminator.

```typescript
type UpoContextId =
  | { kind: 'Nip'; nip: string }
  | { kind: 'IdWewnetrzny'; idWewnetrzny: string }
  | { kind: 'IdZlozonyVatUE'; idZlozonyVatUE: string }
  | { kind: 'IdDostawcyUslugPeppol'; idDostawcyUslugPeppol: string };
```

**Why not plain optional fields** (`{ nip?: string; idWewnetrzny?: string; ... }`):
- Optional fields lose the XSD guarantee that exactly one is present
- Discriminated unions enable exhaustive `switch` matching and type narrowing
- Aligns with smekcio reference approach

### D4: Defensive parsing with validation helpers

**Decision**: Use helper functions (`requireString`, `requireRecord`, `requireNumberFromString`, `ensureArray`) for defensive XML parsing. Throw `KSeFValidationError` with field path on any validation failure.

**Rationale**:
- `fast-xml-parser` output is untyped (`unknown`). Every field must be validated.
- Helper functions standardize error messages: `"UPO parsing failed: Dokument.NipSprzedawcy is required"`
- `ensureArray()` handles XML ambiguity where single elements are objects vs arrays
- `KSeFValidationError.fromField(field, message)` matches existing error pattern

### D5: XMLParser configuration

**Decision**: Configure `fast-xml-parser` with:
```typescript
{
  ignoreAttributes: false,       // preserve attributes (wersjaSchemy)
  attributeNamePrefix: '@_',     // standard prefix
  parseTagValue: false,          // keep all values as strings (dates, numbers)
  parseAttributeValue: false,    // keep attribute values as strings
  removeNSPrefix: true,          // strip namespace prefixes for simpler access
  trimValues: false,             // preserve whitespace
}
```

**Why `parseTagValue: false`**: UPO contains dates and numbers as strings. Letting the parser auto-convert risks losing precision or format. We parse numbers explicitly via `requireNumberFromString()`.

**Why `removeNSPrefix: true`**: UPO uses namespace `http://upo.schematy.mf.gov.pl/KSeF/v4-3`. Stripping lets us access `Potwierdzenie.Dokument` instead of `ns1:Potwierdzenie.ns1:Dokument`.

### D6: Workflow integration — `waitForUpoParsed()` method

**Decision**: Add a new `waitForUpoParsed()` method to `OnlineSessionHandle` and `BatchUploadResult` that returns parsed UPO. Keep existing `waitForUpo()` unchanged.

```typescript
// New type extending UpoInfo
export interface ParsedUpoInfo extends UpoInfo {
  parsed: UpoPotwierdzenie[];  // one per UPO page
}

// New method on OnlineSessionHandle
waitForUpoParsed(options?: PollOptions): Promise<ParsedUpoInfo>;
```

**Why not modify `waitForUpo()`**: Adding `parsed` to `UpoInfo` would be a breaking change for consumers who destructure the result. A separate method is opt-in and zero-cost for existing users.

**Implementation**: `waitForUpoParsed()` calls `waitForUpo()`, then downloads each UPO page XML via `getSessionUpo()`, parses each with `parseUpoXml()`, and assembles `ParsedUpoInfo`.

### D7: CLI `--parsed` flag

**Decision**: Add `--parsed` flag to `ksef session upo` that outputs `UpoPotwierdzenie` as JSON instead of raw XML.

**Behavior**:
- Without `--parsed`: current behavior (raw XML to stdout or file)
- With `--parsed`: parse XML, output JSON to stdout (or file with `-o`)
- `--parsed` implies `--json` output format
- Combine: `ksef session upo <ref> --ksef-number <num> --parsed` → JSON object

### D8: Test fixtures — copy from ref/ksef-docs

**Decision**: Copy 6 UPO XML example files from `ref/ksef-docs/faktury/upo/przyklady/v4-3/` into `tests/fixtures/upo/` for unit tests. This avoids test dependency on gitignored ref directory.

**Test coverage**:
- All 4 context ID variants (Nip, IdWewnetrzny, IdZlozonyVatUE, IdDostawcyUslugPeppol)
- Both auth proof variants
- Single-document and multi-document UPOs
- Optional OpisPotwierdzenia presence/absence
- Malformed XML error cases
- Buffer input handling

## Risks / Trade-offs

**[fast-xml-parser v5 API changes]** → The project depends on v5.2.0. The smekcio reference uses v4 API. Verify v5 constructor and options. Mitigation: check v5 migration guide, test parser initialization early.

**[XSD version drift]** → UPO schema may add fields in future versions (v4-4+). Mitigation: parser ignores unknown fields by default (fast-xml-parser doesn't fail on extra elements). New fields can be added to types as optional.

**[Single-element vs array ambiguity]** → XML with one `<Dokument>` parses as object, multiple as array. Mitigation: `ensureArray()` helper normalizes both cases. This is a well-known fast-xml-parser pattern.

**[ParsedUpoInfo workflow coupling]** → `waitForUpoParsed()` needs both `SessionStatusService` (for polling) and `SessionStatusService` (for UPO download). Both are already available in the workflow context via `client`. No new service injection needed.
