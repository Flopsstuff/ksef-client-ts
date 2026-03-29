## ADDED Requirements

### Requirement: XSD parser extracts type definitions
The generator script SHALL parse XSD files from `docs/schemas/` and extract all `xsd:complexType`, `xsd:simpleType`, and `xsd:element` definitions into an in-memory type registry. It MUST resolve `xsd:import`/`xsd:include` references to base type schemas (e.g., `bazowe/ElementarneTypyDanych_v10-0E.xsd`).

#### Scenario: Parse FA(3) schema
- **WHEN** the generator processes `docs/schemas/FA/schemat_FA(3)_v1-0E.xsd`
- **THEN** it extracts all named types and root elements into the type registry, including types imported from `bazowe/` base schemas

#### Scenario: Resolve cross-file imports
- **WHEN** an XSD file imports types from `bazowe/ElementarneTypyDanych_v10-0E.xsd` via namespace prefix `etd:`
- **THEN** the generator resolves the import path relative to the XSD file and loads the referenced types into the registry

#### Scenario: Unknown XSD feature encountered
- **WHEN** the parser encounters an unsupported XSD feature (e.g., `xsd:substitutionGroup`)
- **THEN** it logs a warning to stderr with the feature name and location, and produces `z.any()` as a fallback for that type

### Requirement: Zod code generation from type registry
The generator SHALL transform the type registry into valid TypeScript files containing Zod schema definitions. Each output file MUST be self-contained with its imports.

#### Scenario: Generate xsd:sequence as z.object
- **WHEN** the type registry contains a `xsd:complexType` with `xsd:sequence` children
- **THEN** the generator produces a `z.object({...})` with one property per child element, preserving required/optional based on `minOccurs`

#### Scenario: Generate xsd:choice as z.union
- **WHEN** the type registry contains a `xsd:choice` element
- **THEN** the generator produces `z.union([...])` with one branch per choice option

#### Scenario: Generate xsd:enumeration as z.enum
- **WHEN** the type registry contains a `xsd:simpleType` with `xsd:restriction`/`xsd:enumeration` facets
- **THEN** the generator produces `z.enum([...])` with all enumeration values

#### Scenario: Generate string constraints
- **WHEN** the type registry contains `xsd:pattern`, `xsd:minLength`, `xsd:maxLength` restrictions
- **THEN** the generator produces `z.string().regex(pattern).min(minLength).max(maxLength)`

#### Scenario: Generate numeric constraints
- **WHEN** the type registry contains `xsd:totalDigits`, `xsd:fractionDigits`, `xsd:minInclusive`, `xsd:maxInclusive`
- **THEN** the generator produces `z.number()` with `.min()`, `.max()`, and a custom refinement for digit constraints

#### Scenario: Generate array from maxOccurs > 1
- **WHEN** an element has `maxOccurs="unbounded"` or `maxOccurs` > 1
- **THEN** the generator produces `z.array(elementSchema).min(minOccurs).max(maxOccurs)`, omitting `.max()` for unbounded

#### Scenario: Generate optional from minOccurs=0
- **WHEN** an element has `minOccurs="0"` and `maxOccurs="1"` (or absent)
- **THEN** the generator wraps the element schema in `.optional()`

#### Scenario: Generate xsd:extension as merged object
- **WHEN** the type registry contains a `xsd:complexType` with `xsd:complexContent`/`xsd:extension`
- **THEN** the generator produces a spread/merge of the base type's properties with the extension's additional properties

#### Scenario: Generate xsd:attribute as object property
- **WHEN** a `xsd:complexType` has `xsd:attribute` declarations
- **THEN** the generator produces properties prefixed with `@` (e.g., `'@kodFormularza'`) in the `z.object`

### Requirement: Schema file output structure
The generator MUST produce one TypeScript file per schema type in `src/validation/schemas/`, plus a barrel index. Base types and country codes are inlined into each schema file (no separate shared files).

#### Scenario: Generate all 6 invoice schemas
- **WHEN** the generator runs against `docs/schemas/`
- **THEN** it produces files: `fa2.ts`, `fa3.ts`, `pef3.ts`, `pef-kor3.ts`, `rr1-v10e.ts`, `rr1-v11e.ts`, `index.ts`

#### Scenario: Generated files are valid TypeScript
- **WHEN** generated schema files are compiled with `tsc --noEmit`
- **THEN** compilation succeeds with no type errors

#### Scenario: Generated files export inferred types
- **WHEN** a generated schema file defines `const FA3Schema = z.object({...})`
- **THEN** it also exports `type FA3 = z.infer<typeof FA3Schema>`

### Requirement: Generator CLI invocation
The generator MUST be runnable via `yarn generate-schemas` and accept no required arguments (uses `docs/schemas/` as default input, `src/validation/schemas/` as default output).

#### Scenario: Run generator
- **WHEN** user runs `yarn generate-schemas`
- **THEN** the script reads XSD files from `docs/schemas/`, generates Zod schema files to `src/validation/schemas/`, and reports the count of generated files

#### Scenario: CI freshness check
- **WHEN** CI runs `yarn generate-schemas && git diff --exit-code src/validation/schemas/`
- **THEN** the command exits 0 if generated files match committed files, non-zero if they differ
