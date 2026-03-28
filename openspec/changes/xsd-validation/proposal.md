## Why

No KSeF client implementation (Java, C#, or TypeScript) performs client-side XSD schema validation of invoice XML before submission. Users discover structural errors only after KSeF rejects the invoice — slow feedback, wasted API calls, and opaque server-side error messages. Build-time XSD→Zod code generation enables pure-TypeScript validation with zero native dependencies, fast runtime, and full TypeScript type inference for invoice structures.

## What Changes

- **XSD→Zod generator script** — build-time tool that parses official KSeF XSD schemas (`ref/ksef-docs/faktury/schemy/`) and generates Zod validation schemas as TypeScript source files. Covers all 6 schema variants (FA2, FA3, PEF3, PEF_KOR3, RR1 v1-0E, RR1 v1-1E) plus shared base types.
- **Generated Zod schemas** — pre-generated `.ts` files shipped in the npm package under `src/validation/schemas/`. Each file corresponds to one XSD schema with full structural, type, and constraint validation.
- **Schema registry** — maps `FormCode`/`SystemCode` to the correct Zod schema. Auto-detects invoice type from XML namespace/root element.
- **InvoiceValidator service** — three validation levels: XML well-formedness (xmldom), schema validation (Zod), business rules (NIP/PESEL checksums, cross-field checks, amount consistency).
- **CLI command** — `ksef invoice validate <file.xml>` with auto-detection and explicit `--schema` override. Outputs human-readable errors with XPath-like locations.
- **Send-time opt-in** — `validateBeforeSend` option on invoice sending methods for pre-flight validation.
- **New dependency** — `zod` (runtime schema validation, ~13KB gzipped).

## Capabilities

### New Capabilities
- `xsd-codegen`: Build-time XSD parser and Zod code generator script. Reads official KSeF XSD files, resolves imports (base types, country codes), and outputs TypeScript files with Zod schemas.
- `invoice-validation`: Runtime invoice XML validation service with three levels (well-formedness, schema, business rules), schema registry, auto-detection, and structured error reporting.
- `cli-invoice-validate`: CLI command `ksef invoice validate <file.xml>` with schema auto-detection, `--schema` override, human-readable error output, and `--json` flag.

### Modified Capabilities
- `cli-invoice`: Add `--validate` / `--no-validate` flag to `ksef invoice send` for optional pre-send validation.

## Impact

- **New files**: `scripts/generate-invoice-schemas.ts`, `src/validation/schemas/*.ts` (generated), `src/validation/invoice-validator.ts`, `src/validation/schema-registry.ts`, `src/validation/xml-to-object.ts`, `src/validation/business-rules.ts`, `src/cli/commands/validate.ts`
- **Modified files**: `src/cli/commands/invoice.ts` (add `--validate` flag), `src/validation/index.ts` (re-export new modules)
- **Dependencies**: Add `zod` (production). `@xmldom/xmldom` already in project.
- **Build**: New `yarn generate:schemas` script; generated files checked into git.
- **API surface**: New `InvoiceValidator` class exported from `ksef-client/validation`. New `InvoiceValidationResult` / `InvoiceValidationError` types.
- **XSD source files**: Read from `ref/ksef-docs/faktury/schemy/` (gitignored ref directory, not shipped).
