# Invoice XML Validation Plan

## Goal

Implement client-side invoice XML validation using official KSeF XSD schemas — in pure TypeScript, with no external system dependencies (no xmllint, no Java, no native C++ bindings).

**This would be the only KSeF client (across all 4 reference implementations — Java, C#, TS×2) that performs client-side XSD-level validation.**

---

## Reference Materials

### Official XSD Schemas (source of truth)

All schemas are already downloaded locally in `ref/ksef-docs/faktury/schemy/`.

#### FA (Faktury) — standard invoices

| File | Local Path | Size | Namespace |
|------|-----------|------|-----------|
| **FA(2)** | `ref/ksef-docs/faktury/schemy/FA/schemat_FA(2)_v1-0E.xsd` | 170 KB, ~3661 lines | `http://crd.gov.pl/wzor/2023/06/29/12648/` |
| **FA(3)** | `ref/ksef-docs/faktury/schemy/FA/schemat_FA(3)_v1-0E.xsd` | 184 KB, ~3950 lines | `http://crd.gov.pl/wzor/2025/06/25/13775/` |

#### FA Base Types

| File | Local Path | Size |
|------|-----------|------|
| ElementarneTypyDanych | `ref/ksef-docs/faktury/schemy/FA/bazowe/ElementarneTypyDanych_v10-0E.xsd` | 12 KB |
| KodyKrajow | `ref/ksef-docs/faktury/schemy/FA/bazowe/KodyKrajow_v10-0E.xsd` | 39 KB |
| StrukturyDanych | `ref/ksef-docs/faktury/schemy/FA/bazowe/StrukturyDanych_v10-0E.xsd` | 31 KB |

Import chain: FA(2/3) → StrukturyDanych → ElementarneTypyDanych → KodyKrajow

> Note: The main FA schemas are **self-contained** — they inline most types rather than importing base schemas at runtime. The base schemas define reusable types (addresses, identifiers, etc.) that are referenced via the `etd:` namespace prefix.

#### PEF (Peppol e-Faktura)

| File | Local Path | Size |
|------|-----------|------|
| **PEF(3)** | `ref/ksef-docs/faktury/schemy/PEF/Schemat_PEF(3)_v2-1.xsd` | 49 KB |
| **PEF_KOR(3)** | `ref/ksef-docs/faktury/schemy/PEF/Schemat_PEF_KOR(3)_v2-1.xsd` | 47 KB |

PEF also has `bazowe/` with its own base types.

#### RR (Faktura RR — farmer invoices)

| File | Local Path | Size |
|------|-----------|------|
| **RR(1) v1-0E** | `ref/ksef-docs/faktury/schemy/RR/schemat_RR(1)_v1-0E.xsd` | 83 KB | Expires 2026-03-23 |
| **RR(1) v1-1E** | `ref/ksef-docs/faktury/schemy/RR/schemat_RR(1)_v1-1E.xsd` | 83 KB |

#### Schema ↔ API FormCode mapping (from OpenAPI spec)

| SystemCode | SchemaVersion | Value | XSD File |
|-----------|---------------|-------|----------|
| FA (2) | 1-0E | FA | `schemat_FA(2)_v1-0E.xsd` |
| FA (3) | 1-0E | FA | `schemat_FA(3)_v1-0E.xsd` |
| PEF (3) | 2-1 | PEF | `Schemat_PEF(3)_v2-1.xsd` |
| PEF_KOR (3) | 2-1 | PEF | `Schemat_PEF_KOR(3)_v2-1.xsd` |
| FA_RR (1) | 1-0E | RR | `schemat_RR(1)_v1-0E.xsd` |
| FA_RR (1) | 1-1E | RR | `schemat_RR(1)_v1-1E.xsd` |

Source: `docs/open-api.json` lines 12073-12083 (FormCode description in SendInvoiceRequest and OpenOnlineSessionRequest).

### Reference Implementations — Existing Validation

| Project | What exists | Location |
|---------|-------------|----------|
| **C# (ksef-client-csharp)** | XML parsing + NIP/InternalId validation for Podmiot1/2/3 | `ref/ksef-client-csharp/KSeF.Client/Helpers/ValidationHelper.cs` |
| **C# tests** | Unit tests for validation | `ref/ksef-client-csharp/KSeF.Client.Tests.Core/UnitTests/ValidationHelperTests.cs` |
| **TS (ksef-client-ts, lkow)** | NIP/PESEL/PeppolId regex + basic XML element presence check | `ref/ksef-client-ts/src/utils/validation.ts` |
| **TS (ksef-client-typescript)** | No validation | — |
| **Java (ksef-client-java)** | No validation | — |

**None of them perform XSD schema validation.**

### Our Project — Current Validation

| What | Location |
|------|----------|
| Regex patterns (NIP, PESEL, KsefNumber, etc.) | `src/validation/patterns.ts` |
| Builder validation (KSeFValidationError) | `src/builders/*.ts` |
| Error hierarchy | `src/errors/` |

---

## Approach: Build-time XSD → Zod Code Generation

### Why This Approach

1. **Pure TypeScript** — no system dependencies, works everywhere Node.js runs
2. **Zero runtime XSD parsing** — generated code is just Zod schemas + TS types
3. **Type-safe** — `z.infer<typeof FA3Schema>` gives full TypeScript types for invoice structure
4. **Updatable** — when KSeF publishes new schemas, re-run the generator
5. **Testable** — generated schemas can be unit-tested against sample invoices

### XSD Feature Analysis

Features used in KSeF XSD schemas and their Zod mapping:

| XSD Feature | Used in KSeF? | Zod Equivalent | Complexity |
|-------------|:---:|----------------|------------|
| `xsd:sequence` | ✅ Heavy | `z.object({...})` | Low |
| `xsd:choice` | ✅ Medium | `z.union([...])` / `z.discriminatedUnion()` | Medium |
| `xsd:enumeration` | ✅ Heavy | `z.enum([...])` | Low |
| `xsd:pattern` | ✅ Heavy | `z.string().regex(...)` | Low |
| `xsd:minLength/maxLength` | ✅ Heavy | `z.string().min().max()` | Low |
| `xsd:minOccurs/maxOccurs` | ✅ Heavy | `z.array().min().max()`, `.optional()` | Low |
| `xsd:totalDigits/fractionDigits` | ✅ Medium | `z.number()` + custom refinement | Medium |
| `xsd:minInclusive/maxInclusive` | ✅ Medium | `z.number().min().max()` | Low |
| `xsd:restriction` (simple) | ✅ Heavy | Base type + constraints | Low |
| `xsd:extension` (complex) | ✅ Medium | `z.object().merge()` / spread | Medium |
| `xsd:attribute` | ✅ Light | Property in `z.object` | Low |
| `xsd:import/include` | ✅ (base types) | Import TS module | Low |
| `xsd:union` | ✅ Light (REGON) | `z.union([...])` | Low |
| `xsd:unique/key/keyref` | ❌ Not used | — | — |
| `xsd:substitutionGroup` | ❌ Not used | — | — |
| `xsd:abstract` | ❌ Not used | — | — |

**Conclusion:** KSeF schemas use a manageable subset of XSD. No exotic features. ~90% coverage is achievable.

---

## Architecture

### Build-time Pipeline

```
ref/ksef-docs/faktury/schemy/**/*.xsd
        │
        ▼
scripts/generate-invoice-schemas.ts    (one-time generator script)
        │
        │  Parses XSD → extracts types, elements, restrictions
        │  Resolves imports (base types)
        │  Generates Zod schemas
        │
        ▼
src/validation/schemas/
  ├── base-types.ts          (ElementarneTypyDanych, StrukturyDanych)
  ├── country-codes.ts       (KodyKrajow → z.enum)
  ├── fa2.ts                 (FA(2) full schema)
  ├── fa3.ts                 (FA(3) full schema)
  ├── pef3.ts                (PEF(3))
  ├── pef-kor3.ts            (PEF_KOR(3))
  ├── rr1-v10e.ts            (RR(1) v1-0E)
  ├── rr1-v11e.ts            (RR(1) v1-1E)
  └── index.ts               (barrel + schema registry)
```

### Runtime API

```
src/validation/
  ├── invoice-validator.ts    (main validator service)
  ├── schema-registry.ts      (maps FormCode → Zod schema)
  ├── xml-to-object.ts        (XML → JS object converter using @xmldom)
  ├── business-rules.ts       (NIP checksums, cross-field checks)
  ├── schemas/                (generated Zod schemas — see above)
  └── index.ts
```

### Public API

```typescript
import { InvoiceValidator } from 'ksef-client/validation';

const validator = new InvoiceValidator();

// Full validation (XSD + business rules)
const result = validator.validate(invoiceXml);
// result: { valid: boolean, errors: ValidationError[] }

// Schema-only validation
const result = validator.validateSchema(invoiceXml);

// Business rules only (NIP checksums, etc.)
const result = validator.validateBusinessRules(invoiceXml);

// Auto-detect schema from XML namespace/root element
// Or specify explicitly:
const result = validator.validate(invoiceXml, { schema: 'FA3' });
```

### ValidationResult

```typescript
interface InvoiceValidationResult {
  valid: boolean;
  errors: InvoiceValidationError[];
  warnings: InvoiceValidationWarning[];
  detectedSchema?: SchemaType; // 'FA2' | 'FA3' | 'PEF3' | ...
}

interface InvoiceValidationError {
  level: 'error' | 'warning';
  code: string;           // e.g. 'MISSING_REQUIRED_ELEMENT', 'INVALID_NIP_CHECKSUM'
  path: string;           // XPath-like: '/Faktura/Podmiot1/DaneIdentyfikacyjne/NIP'
  message: string;
  expected?: string;
  actual?: string;
}
```

---

## Validation Levels

### Level 1: XML Well-formedness
- Parse XML with `@xmldom/xmldom` (already a dependency for XAdES signatures)
- Report parsing errors with line/column numbers

### Level 2: Schema Validation (generated from XSD)
- Required elements presence
- Element ordering (sequence)
- Choice validation (exactly one branch)
- String type constraints: pattern, minLength, maxLength
- Numeric type constraints: totalDigits, fractionDigits, minInclusive, maxInclusive
- Enumeration values (country codes, invoice types, payment methods, etc.)
- Occurrence constraints: minOccurs, maxOccurs
- Attribute validation

### Level 3: Business Rules (manual, code-only)
- NIP checksum validation (Podmiot1, Podmiot2, Podmiot3)
- PESEL checksum validation
- Cross-field consistency (e.g. correction invoice must reference original)
- Date range validity
- Amount totals consistency (sum of line items vs declared totals)

---

## Implementation Phases

### Phase 1: Generator Script + FA(3) Schema (MVP)
1. Write XSD parser (reads XSD, builds type registry)
2. Write Zod code generator (type registry → .ts files)
3. Generate FA(3) schema (the most common invoice type)
4. Write `InvoiceValidator` with Level 1 + Level 2
5. Tests against sample invoices from `ref/ksef-client-java/demo-web-app/src/integrationTest/resources/xml/invoices/sample/`

### Phase 2: All Schemas + Business Rules
1. Generate FA(2), PEF(3), PEF_KOR(3), RR(1) schemas
2. Implement schema auto-detection from XML namespace
3. Add Level 3 business rules (NIP checksums, amounts, dates)
4. Integration with existing `KSeFValidationError` hierarchy

### Phase 3: Integration + DX
1. Add `validateBeforeSend` option to invoice sending methods
2. CLI command: `ksef invoice validate <file.xml>`
3. Detailed error messages with XPath locations
4. Optional: validation report export (JSON/text)

---

## Dependencies

| Dependency | Status | Purpose |
|-----------|--------|---------|
| `@xmldom/xmldom` | Already in project (XAdES) | XML parsing |
| `zod` | **New dependency** | Runtime schema validation |

**Alternative to Zod:** If adding Zod is undesirable, the generator can produce plain TS validation functions instead. This increases generator complexity but eliminates the runtime dependency. Decision point for Phase 1.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| XSD features we can't map to Zod | Some constraints missed | Log warnings during generation; manual fallback for edge cases |
| Schema updates by MF | Generated code stale | Re-run generator; version schemas in git |
| Large generated code size | Bundle bloat | Tree-shaking (each schema separate); lazy loading |
| XML → JS object fidelity | Validation misses | Test against real KSeF invoices; compare with xmllint results |
| `xsd:choice` ambiguity | Wrong branch matched | Use namespace-aware parsing; element name discrimination |

---

## Open Questions

1. **Zod vs plain TS functions?** — Zod adds ~13KB gzipped but gives `z.infer` types and better DX. Plain TS functions are zero-dep but more code.
2. **Ship generated schemas in npm package?** — Yes (they're just .ts files). The generator script is dev-only.
3. **Validate at send time by default?** — Opt-in (validation adds latency). But could default to `true` in dev/test environments.
4. **Support for custom/extended schemas?** — Not in MVP. KSeF only accepts the 6 official schemas.

---

## Estimated Effort

| Phase | Effort | Output |
|-------|--------|--------|
| Phase 1 (Generator + FA3) | 3-5 days | Working XSD→Zod generator, FA3 validation |
| Phase 2 (All schemas + biz rules) | 2-3 days | Complete validation for all 6 schemas |
| Phase 3 (Integration + CLI) | 1-2 days | End-to-end DX |
| **Total** | **6-10 days** | |
