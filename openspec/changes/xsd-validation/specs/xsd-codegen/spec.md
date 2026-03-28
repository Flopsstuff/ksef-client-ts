## ADDED Requirements

### Requirement: XSD parser reads official KSeF schemas
The generator script SHALL parse XSD files from `ref/ksef-docs/faktury/schemy/` using `@xmldom/xmldom` DOMParser. It MUST resolve the import chain: main schema → `StrukturyDanych` → `ElementarneTypyDanych` → `KodyKrajow`. It MUST build a type registry mapping XSD type names (e.g., `TNrNIP`, `TZnakowy`, `TKwota2`) to their constraints (pattern, minLength, maxLength, totalDigits, fractionDigits, enumeration values, minInclusive, maxInclusive).

#### Scenario: Parse FA(3) schema with imports
- **WHEN** the generator processes `schemat_FA(3)_v1-0E.xsd`
- **THEN** it SHALL resolve the `etd:` namespace import to `StrukturyDanych_v10-0E.xsd`, transitively include `ElementarneTypyDanych_v10-0E.xsd` and `KodyKrajow_v10-0E.xsd`, and register all referenced types

#### Scenario: Parse PEF(3) schema with UBL base types
- **WHEN** the generator processes `Schemat_PEF(3)_v2-1.xsd`
- **THEN** it SHALL resolve PEF-specific base type imports from `PEF/bazowe/`

#### Scenario: Handle missing import file
- **WHEN** an `xsd:import` or `xsd:include` references a file not found on disk
- **THEN** the generator SHALL throw an error with the missing file path and the referencing schema

### Requirement: XSD-to-Zod type mapping
The generator SHALL map XSD type features to Zod schema calls. The following mappings MUST be supported:

| XSD Feature | Zod Output |
|-------------|------------|
| `xsd:string` with `pattern` | `z.string().regex(...)` |
| `xsd:string` with `minLength`/`maxLength` | `z.string().min().max()` |
| `xsd:string` with `enumeration` | `z.enum([...])` |
| `xsd:decimal`/`xsd:integer` with `totalDigits`/`fractionDigits` | `z.number()` with `.refine()` for digit constraints |
| `xsd:decimal` with `minInclusive`/`maxInclusive` | `z.number().min().max()` |
| `xsd:sequence` | `z.object({...})` with property order preserved |
| `xsd:choice` | `z.union([...])` |
| `xsd:element` with `minOccurs=0` | `.optional()` |
| `xsd:element` with `maxOccurs=unbounded` | `z.array(...)` |
| `xsd:element` with `minOccurs`/`maxOccurs` range | `z.array(...).min().max()` |
| `xsd:complexType` with `xsd:extension` | `z.object().merge()` or spread of base type |
| `xsd:attribute` | Property in containing `z.object()` with `@`-prefixed key |
| `xsd:union` (e.g., REGON 9 or 14 digits) | `z.union([...])` |

#### Scenario: Generate string type with pattern
- **WHEN** the XSD defines `<xsd:restriction base="xsd:string"><xsd:pattern value="[1-9]((\d[1-9])|([1-9]\d))\d{7}"/></xsd:restriction>` (TNrNIP)
- **THEN** the output SHALL be `z.string().regex(/^[1-9]((\d[1-9])|([1-9]\d))\d{7}$/)`

#### Scenario: Generate decimal type with digit constraints
- **WHEN** the XSD defines `totalDigits=16` and `fractionDigits=2` (TKwota2)
- **THEN** the output SHALL use `z.number()` with a refinement validating digit counts

#### Scenario: Generate choice type
- **WHEN** the XSD defines `<xsd:choice>` with multiple element branches
- **THEN** the output SHALL be `z.union([...])` with one schema per branch

#### Scenario: Generate sequence with optional elements
- **WHEN** a `xsd:sequence` contains elements with `minOccurs=0`
- **THEN** those properties SHALL be `.optional()` in the generated `z.object()`

### Requirement: Generate schemas for all 6 KSeF schema variants
The generator SHALL produce one TypeScript file per schema variant plus shared base type files. The output files MUST be:

| Output File | Source XSD | Target Namespace |
|-------------|-----------|-----------------|
| `base-types.ts` | `ElementarneTypyDanych_v10-0E.xsd` + `StrukturyDanych_v10-0E.xsd` | (shared types) |
| `country-codes.ts` | `KodyKrajow_v10-0E.xsd` | (country code enum) |
| `fa2.ts` | `schemat_FA(2)_v1-0E.xsd` | `http://crd.gov.pl/wzor/2023/06/29/12648/` |
| `fa3.ts` | `schemat_FA(3)_v1-0E.xsd` | `http://crd.gov.pl/wzor/2025/06/25/13775/` |
| `pef3.ts` | `Schemat_PEF(3)_v2-1.xsd` | PEF namespace |
| `pef-kor3.ts` | `Schemat_PEF_KOR(3)_v2-1.xsd` | PEF_KOR namespace |
| `rr1-v10e.ts` | `schemat_RR(1)_v1-0E.xsd` | RR namespace |
| `rr1-v11e.ts` | `schemat_RR(1)_v1-1E.xsd` | RR namespace |

#### Scenario: Generate all schema files
- **WHEN** the generator script is run with `yarn generate:schemas`
- **THEN** it SHALL produce all 8 files listed above in `src/validation/schemas/`

#### Scenario: Generated files are self-contained
- **WHEN** a schema file (e.g., `fa3.ts`) is generated
- **THEN** it SHALL import only from `./base-types.js`, `./country-codes.js`, and `zod`, with no runtime dependency on XSD files

#### Scenario: Generated files include metadata comments
- **WHEN** any schema file is generated
- **THEN** it SHALL include a header comment with: source XSD filename, target namespace, generation timestamp, and a warning not to edit manually

### Requirement: Generator script is a dev-only build tool
The generator script SHALL live at `scripts/generate-invoice-schemas.ts` and be invocable via `yarn generate:schemas`. It MUST NOT be included in the published npm package. Generated output files (`src/validation/schemas/*.ts`) MUST be checked into git so consumers don't need the ref/ XSD sources.

#### Scenario: Run generator
- **WHEN** developer runs `yarn generate:schemas`
- **THEN** it SHALL read XSDs from `ref/ksef-docs/faktury/schemy/`, generate TypeScript files to `src/validation/schemas/`, and report the number of types and schemas generated

#### Scenario: Generator fails gracefully on missing ref directory
- **WHEN** `ref/ksef-docs/faktury/schemy/` does not exist
- **THEN** the script SHALL display an error explaining that XSD source files are needed and how to obtain them

### Requirement: Barrel export with schema index
The generator SHALL produce `src/validation/schemas/index.ts` exporting all generated schemas and a `SCHEMA_MAP` constant mapping `SchemaType` identifiers to their root Zod schemas.

#### Scenario: Schema map contains all variants
- **WHEN** `SCHEMA_MAP` is imported
- **THEN** it SHALL have entries for `FA2`, `FA3`, `PEF3`, `PEF_KOR3`, `RR1_V10E`, `RR1_V11E` mapping to the corresponding root `z.ZodObject` schema

#### Scenario: Schema type enum
- **WHEN** the `SchemaType` type is used
- **THEN** it SHALL be a string union of `'FA2' | 'FA3' | 'PEF3' | 'PEF_KOR3' | 'RR1_V10E' | 'RR1_V11E'`
