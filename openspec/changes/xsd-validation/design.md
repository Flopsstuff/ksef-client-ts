## Decisions

### D1: Use fast-xml-parser for XML→object conversion (not @xmldom)

**Choice**: Use `fast-xml-parser` (already a direct dependency, v5.2.0) for both the generator's XSD parsing and the runtime XML→object conversion. Use `@xmldom/xmldom` only for Level 1 well-formedness checks (error reporting with line/column).

**Why**: `fast-xml-parser` is already a direct dependency used by `src/xml/upo-parser.ts`. Adding `@xmldom/xmldom` as a direct dependency would duplicate XML parsing capabilities. fast-xml-parser's `ignoreAttributes: false` + `removeNSPrefix: true` configuration is proven in the UPO parser and produces the exact object shape needed for Zod validation.

**Well-formedness**: fast-xml-parser throws on malformed XML but without line/column info. For Level 1, use `@xmldom/xmldom` DOMParser (transitive dep via xml-crypto) with error handler to capture line/column, then pass the XML string to fast-xml-parser for the object conversion used in Level 2.

### D2: Zod for runtime schema validation

**Choice**: Add `zod` as a production dependency (~13KB gzipped).

**Why**: Zod provides `z.infer<>` for free TypeScript types, composable schemas, and structured error paths (`ZodError.issues[].path`). The alternative (plain TS validation functions) would require 3-5x more generated code and lose type inference. Zod's error format maps cleanly to our `InvoiceValidationError` structure — each `ZodIssue` has `path`, `code`, `message`, and `expected`/`received` fields.

### D3: Generated schemas checked into git

**Choice**: Generated `src/validation/schemas/*.ts` files are committed to git. The generator script (`scripts/generate-invoice-schemas.ts`) is dev-only.

**Why**: npm consumers don't have access to `ref/ksef-docs/` XSD sources. Checking in generated files ensures the package works out of the box. The generator is only needed when KSeF publishes schema updates (rare — quarterly at most).

### D4: Schema-aware array normalization

**Choice**: The `xmlToObject()` function accepts a set of element names that should always be arrays, derived from the schema's `maxOccurs>1` definitions. This eliminates the fast-xml-parser ambiguity where single occurrences become objects instead of arrays.

**Why**: This is the same pattern used by `ensureArray()` in `src/xml/upo-parser.ts`. The generator emits an `ARRAY_ELEMENTS` constant per schema listing all element names with `maxOccurs>1`. The XML converter uses this to force arrays.

### D5: Zod error to InvoiceValidationError mapping

**Choice**: Map Zod's `ZodIssue` types to our error codes:

| ZodIssue code | InvoiceValidationError code |
|---------------|---------------------------|
| `invalid_type` (required but undefined) | `MISSING_REQUIRED_ELEMENT` |
| `invalid_enum_value` | `INVALID_ENUM_VALUE` |
| `invalid_string` (regex) | `PATTERN_MISMATCH` |
| `too_small` / `too_big` (string length) | `STRING_LENGTH_VIOLATION` |
| `too_small` / `too_big` (number) | `NUMERIC_CONSTRAINT` |
| `custom` (digit refinement) | `NUMERIC_CONSTRAINT` |
| `invalid_union` | `INVALID_CHOICE` |

**Path conversion**: Zod paths like `['Faktura', 'Podmiot1', 'DaneIdentyfikacyjne', 'NIP']` are joined with `/` prefix: `/Faktura/Podmiot1/DaneIdentyfikacyjne/NIP`.

### D6: Namespace-to-schema detection

**Choice**: Extract `targetNamespace` from root element's `xmlns` or `xmlns:tns` attribute and map to `SchemaType`.

| Namespace URI | SchemaType |
|---------------|-----------|
| `http://crd.gov.pl/wzor/2023/06/29/12648/` | `FA2` |
| `http://crd.gov.pl/wzor/2025/06/25/13775/` | `FA3` |
| PEF(3) namespace | `PEF3` |
| PEF_KOR(3) namespace | `PEF_KOR3` |
| RR(1) namespace | `RR1_V11E` (default to latest) |

For RR, differentiate v1-0E vs v1-1E by inspecting the `wersjaSchemy` attribute on the `KodFormularza` element.

### D7: SchemaType bridges to existing SystemCode/FORM_CODES

**Choice**: `SchemaType` is a separate type from `SystemCode` because FA_RR has two schema versions mapped to a single SystemCode. The `SchemaRegistry` provides bidirectional mapping:

```
SchemaType 'FA2'       ↔ SystemCode 'FA (2)'      ↔ FORM_CODES.FA_2
SchemaType 'FA3'       ↔ SystemCode 'FA (3)'      ↔ FORM_CODES.FA_3
SchemaType 'PEF3'      ↔ SystemCode 'PEF (3)'     ↔ FORM_CODES.PEF_3
SchemaType 'PEF_KOR3'  ↔ SystemCode 'PEF_KOR (3)' ↔ FORM_CODES.PEF_KOR_3
SchemaType 'RR1_V10E'  ↔ SystemCode 'FA_RR (1)'   ↔ FORM_CODES.FA_RR_1_LEGACY
SchemaType 'RR1_V11E'  ↔ SystemCode 'FA_RR (1)'   ↔ FORM_CODES.FA_RR_1 / FA_RR_1_TRANSITION
```

`getSchemaByFormCode()` uses both `systemCode` and `schemaVersion` to disambiguate FA_RR variants.

### D8: CLI validate as subcommand of invoice

**Choice**: Register `validate` as a subcommand under the existing `ksef invoice` command group (alongside `send`, `get`, `query`, `export`). The command is `ksef invoice validate <file...>`.

**Why**: Validation is invoice-centric. A separate top-level `ksef validate` would be inconsistent with the existing CLI hierarchy. The `invoice` group already has the most subcommands.

### D9: Generator architecture — two-phase approach

**Choice**: The generator has two phases:

1. **Parse phase**: Read XSD files → build a `TypeRegistry` (map from XSD type name to `TypeDefinition`). Resolve imports/includes recursively. Each `TypeDefinition` captures: kind (simple/complex), base type, restrictions, child elements, attributes, choice groups.

2. **Emit phase**: Walk the `TypeRegistry` → generate Zod code as string. Each complex type becomes a `z.object()`, each simple type becomes a constrained `z.string()` or `z.number()`. Emits `.ts` files with proper imports.

**Why**: Separating parsing from emission allows testing each phase independently. The type registry is a clean intermediate representation that can be serialized for debugging.

### D10: Numeric value handling — strings to numbers

**Choice**: For numeric XSD types (`xsd:decimal`, `xsd:integer`), the generated Zod schema accepts both `string` and `number` via `z.preprocess()`. XML always delivers strings, but the validator coerces them to numbers before applying numeric constraints.

**Why**: fast-xml-parser with `parseTagValue: false` keeps all values as strings. The Zod schemas need to validate numeric constraints (totalDigits, fractionDigits, min/max). Using `z.preprocess(Number, z.number().min(...))` handles this cleanly.

## Architecture

### File layout

```
scripts/
  generate-invoice-schemas.ts      # Dev-only generator (not published)

src/validation/
  schemas/                         # Generated Zod schemas (committed to git)
    base-types.ts                  # ElementarneTypyDanych + StrukturyDanych
    country-codes.ts               # KodyKrajow → z.enum()
    fa2.ts                         # FA(2) root schema
    fa3.ts                         # FA(3) root schema
    pef3.ts                        # PEF(3) root schema
    pef-kor3.ts                    # PEF_KOR(3) root schema
    rr1-v10e.ts                    # RR(1) v1-0E root schema
    rr1-v11e.ts                    # RR(1) v1-1E root schema
    index.ts                       # Barrel + SCHEMA_MAP + SchemaType
  invoice-validator.ts             # Main InvoiceValidator class
  schema-registry.ts               # FormCode/SystemCode → Zod schema mapping
  xml-to-object.ts                 # XML string → JS object (fast-xml-parser)
  business-rules.ts                # Level 3: NIP/PESEL checksums, cross-field
  types.ts                         # InvoiceValidationResult, InvoiceValidationError
  index.ts                         # Updated barrel (add new exports)

src/cli/commands/
  invoice.ts                       # Modified: add --validate flag to send
                                   # Modified: add validate subcommand

tests/unit/validation/
  invoice-validator.test.ts        # InvoiceValidator unit tests
  schema-registry.test.ts          # Registry mapping tests
  xml-to-object.test.ts            # XML conversion tests
  business-rules.test.ts           # Business rule tests
  schemas/                         # Per-schema validation tests
    fa3.test.ts                    # FA(3) schema validation
    fa2.test.ts
    pef3.test.ts
    ...
```

### Data flow

```
XML string
  │
  ├─→ Level 1: @xmldom/xmldom DOMParser (well-formedness check)
  │     └─→ errors? → return early with XML_PARSE_ERROR
  │
  ├─→ Detect namespace from root element → SchemaType
  │
  ├─→ xmlToObject(xml, arrayElements) via fast-xml-parser
  │     └─→ plain JS object
  │
  ├─→ Level 2: SCHEMA_MAP[schemaType].safeParse(object)
  │     └─→ ZodError.issues → map to InvoiceValidationError[]
  │
  └─→ Level 3: businessRules(object, schemaType)
        └─→ NIP/PESEL checksums, correction refs → InvoiceValidationError[]

All errors collected → InvoiceValidationResult
```

### Generator data flow

```
ref/ksef-docs/faktury/schemy/**/*.xsd
  │
  ├─→ fast-xml-parser: parse XSD XML → JS objects
  │
  ├─→ Phase 1: Build TypeRegistry
  │     ├─→ resolve xsd:import / xsd:include (recursive)
  │     ├─→ register simple types (restrictions, patterns, enums)
  │     ├─→ register complex types (sequences, choices, extensions)
  │     └─→ TypeRegistry: Map<string, TypeDefinition>
  │
  └─→ Phase 2: Emit Zod code
        ├─→ for each simple type → z.string().regex() / z.enum() / z.number()
        ├─→ for each complex type → z.object({...})
        ├─→ collect ARRAY_ELEMENTS from maxOccurs
        └─→ write .ts files to src/validation/schemas/
```

### Integration points

- **SchemaRegistry** imports `SystemCode` and `FORM_CODES` from `src/models/document-structures/`.
- **InvoiceValidator** uses `isValidNip()` and `isValidPesel()` from `src/validation/patterns.ts`.
- **CLI validate** uses `citty`'s `defineCommand` following the same patterns as `src/cli/commands/invoice.ts`.
- **CLI `--validate` on send** calls `InvoiceValidator.validate()` before the existing encrypt+send logic.

## Dependencies

| Package | Type | Purpose | Size impact |
|---------|------|---------|-------------|
| `zod` | production (new) | Runtime schema validation | ~13KB gzipped |
| `fast-xml-parser` | production (existing) | XML→object conversion | already bundled |
| `@xmldom/xmldom` | transitive (via xml-crypto) | Level 1 well-formedness | already bundled |

No new native/binary dependencies. Pure TypeScript throughout.
