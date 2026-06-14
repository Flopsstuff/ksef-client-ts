# ADR-005: XML Parsing Conventions

- **Date:** 2026-03-26
- **Status:** Accepted

## Context

UPO (Official Receipt Confirmation) parsing was the first XML-to-TypeScript parsing task in the project. `fast-xml-parser` v5 is already a dependency (used by `xml-crypto`). The decisions here establish conventions for all future XML parsing (invoice XML serialization, XSD validation, etc.).

## Decisions

### File location: `src/xml/` module

XML parsing lives in `src/xml/`, not `src/models/` or `src/services/`.

- `src/models/` contains API request/response types (JSON). XML-derived types are a different domain.
- `src/services/` contains REST API wrappers. A pure XML parser is not an API service.
- `src/xml/` creates a clear module for XML parsing, positioned for future additions.

**Rejected:** `src/utils/` — too generic, XML parsing is a distinct capability. `src/crypto/` — wrong domain.

### Polish field names from XSD

Keep XSD-native Polish field names for parsed XML fields (`nipSprzedawcy`, `numerKSeFDokumentu`, `dataWystawieniaFaktury`). Use English only for module-level names (`parseUpoXml`, `UpoPotwierdzenie`).

All four reference implementations keep Polish names. Translating would create a mapping layer users must mentally reverse when debugging against raw XML or XSD documentation.

### Discriminated unions with `kind` field for `xs:choice`

Model XSD `<xs:choice>` elements as TypeScript discriminated unions with an explicit `kind` discriminator:

```typescript
type UpoContextId =
  | { kind: 'Nip'; nip: string }
  | { kind: 'IdWewnetrzny'; idWewnetrzny: string }
  | { kind: 'IdZlozonyVatUE'; idZlozonyVatUE: string }
  | { kind: 'IdDostawcyUslugPeppol'; idDostawcyUslugPeppol: string };
```

**Rejected:** Plain optional fields (`{ nip?: string; idWewnetrzny?: string }`) — loses the XSD guarantee that exactly one is present. Discriminated unions enable exhaustive `switch` matching and type narrowing.

### fast-xml-parser configuration

```typescript
{
  ignoreAttributes: false,       // preserve attributes (wersjaSchemy)
  attributeNamePrefix: '@_',     // standard prefix
  parseTagValue: false,          // keep all values as strings
  parseAttributeValue: false,    // keep attribute values as strings
  removeNSPrefix: true,          // strip namespace prefixes
  trimValues: false,             // preserve whitespace
}
```

**`parseTagValue: false`** — UPO contains dates and numbers as strings. Auto-conversion risks losing precision or format. Numbers are parsed explicitly via `requireNumberFromString()`.

**`removeNSPrefix: true`** — UPO uses `http://upo.schematy.mf.gov.pl/KSeF/v4-3` namespace. Stripping lets us access `Potwierdzenie.Dokument` instead of `ns1:Potwierdzenie.ns1:Dokument`.

### Defensive parsing with validation helpers

`fast-xml-parser` output is untyped (`unknown`). Every field is validated via helpers:

- `requireString(obj, field)` — extract required string field
- `requireRecord(obj, field)` — extract required object field
- `requireNumberFromString(obj, field)` — parse number from string field
- `ensureArray(value)` — normalize single element vs array (XML ambiguity)

All throw `KSeFValidationError` with field path: `"UPO parsing failed: Dokument.NipSprzedawcy is required"`.

### `ensureArray()` for single/array ambiguity

`fast-xml-parser` returns a single XML element as an object but multiple elements as an array. Any XML element that can occur 1..N times must be wrapped with `ensureArray()`. This is a well-known parser quirk, not a bug.

## Risks

- **XSD version drift** — Parser ignores unknown fields by default. New fields can be added to types as optional.
- **fast-xml-parser v5 API changes** — Project depends on v5.2.0. v5 constructor and options verified during implementation.
