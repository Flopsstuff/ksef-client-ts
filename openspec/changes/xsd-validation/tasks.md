## Tasks

### Phase 1: Foundation — types, dependencies, generator core

- [ ] Add `zod` production dependency and `@xmldom/xmldom` direct dev dependency (`yarn add zod && yarn add -D @xmldom/xmldom`)
- [ ] Create `src/validation/types.ts` — `InvoiceValidationResult`, `InvoiceValidationError`, `InvoiceValidationWarning`, `SchemaType` union, `ValidationErrorCode` union, `ValidateOptions` interface
- [ ] Create generator XSD parser (`scripts/generate-invoice-schemas.ts` — parse phase only): read XSD files with fast-xml-parser, resolve `xsd:import`/`xsd:include` recursively, build `TypeRegistry` (Map<string, TypeDefinition>) with simple types (restrictions, patterns, enums) and complex types (sequences, choices, extensions, attributes)
- [ ] Create generator Zod emitter (emit phase in same script): walk TypeRegistry → emit Zod code strings per D2/D9/D10 mapping table, produce ARRAY_ELEMENTS constants, write .ts files with metadata header comments
- [ ] Run generator: produce `src/validation/schemas/` — `base-types.ts`, `country-codes.ts`, `fa2.ts`, `fa3.ts`, `pef3.ts`, `pef-kor3.ts`, `rr1-v10e.ts`, `rr1-v11e.ts`, `index.ts` (barrel + SCHEMA_MAP + SchemaType export)
- [ ] Add `"generate:schemas"` script to `package.json` pointing to `tsx scripts/generate-invoice-schemas.ts`
- [ ] Verify generated schemas compile: `yarn build` must pass with new files

### Phase 2: Runtime validation service

- [ ] Create `src/validation/xml-to-object.ts` — `xmlToObject(xml: string, arrayElements?: Set<string>)` using fast-xml-parser (ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false), namespace detection from root element attributes, schema-aware array normalization per D4
- [ ] Create `src/validation/schema-registry.ts` — `SchemaRegistry` with `getSchema(schemaType)`, `getSchemaByNamespace(uri)`, `getSchemaByFormCode(formCode)`, `detectSchema(xml)`. Namespace→SchemaType map per D6, FormCode disambiguation for FA_RR per D7
- [ ] Create `src/validation/business-rules.ts` — Level 3 validators: NIP checksum (walk Podmiot1/2/3), PESEL checksum, correction invoice reference check. Uses existing `isValidNip()`/`isValidPesel()` from `patterns.ts`
- [ ] Create `src/validation/invoice-validator.ts` — `InvoiceValidator` class with `validate(xml, options?)`, `validateSchema(xml, options?)`, `validateBusinessRules(xml)`. Level 1 uses @xmldom DOMParser with error handler. Level 2 uses xmlToObject + SchemaRegistry + Zod safeParse with error mapping per D5. Level 3 uses business-rules. Collects all errors (non-fail-fast)
- [ ] Update `src/validation/index.ts` — re-export `InvoiceValidator`, `InvoiceValidationResult`, `InvoiceValidationError`, `SchemaType`, `SchemaRegistry`

### Phase 3: CLI integration

- [ ] Add `validate` subcommand to `src/cli/commands/invoice.ts` — `ksef invoice validate <file...>`, accept `--schema`, `--schema-only`, `--business-only`, `--json` flags. Support multiple files and directory input (*.xml glob). Display per-file results with error code, path, message. Non-zero exit on errors. Summary for multiple files.
- [ ] Add `--validate` / `--no-validate` flags to `ksef invoice send` command — when `--validate` is present, run `InvoiceValidator.validate()` before encrypt+send. On failure, display errors and abort. For batch (directory), validate all files before opening session.

### Phase 4: Tests

- [ ] Unit tests for `xml-to-object.ts` — simple element, attributes (@-prefix), repeated elements as arrays, single-to-array normalization, namespace detection, malformed XML, empty input
- [ ] Unit tests for `schema-registry.ts` — lookup by SchemaType, by namespace URI, by FormCode, FA_RR version disambiguation, unknown namespace
- [ ] Unit tests for `business-rules.ts` — valid/invalid NIP checksums at various paths, valid/invalid PESEL, correction invoice with/without reference
- [ ] Unit tests for `invoice-validator.ts` — Level 1 (malformed XML, empty input), Level 2 (missing required element, invalid enum, pattern mismatch, numeric constraint), Level 3 (NIP checksum), full validate (all levels combined), schema-only mode, business-only mode, explicit schema override, auto-detection
- [ ] Schema validation tests — at minimum for FA(3): valid minimal invoice passes, missing Podmiot1 fails, invalid KodKraju fails, invalid NIP pattern fails. One smoke test per remaining schema (FA2, PEF3, PEF_KOR3, RR1)
- [ ] CLI tests for `validate` subcommand — valid file output, invalid file shows errors + non-zero exit, --schema override, --json output, multiple files summary, directory mode, file not found error
- [ ] CLI tests for `--validate` flag on `send` — validation pass proceeds to send, validation fail aborts without sending
