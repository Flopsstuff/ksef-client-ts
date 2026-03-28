## Context

The `FormCode` interface (`src/models/common.ts`) is a plain `{ systemCode: string; schemaVersion: string; value: string }`. All current usage hardcodes the FA (2) form code as inline objects — in workflows (`DEFAULT_FORM_CODE`), in CLI commands (`session.ts:47`, `invoice.ts:114`), and wherever users construct requests. There are 7 valid form code combinations across 5 document types, with session-type constraints (batch does not support PEF/PEF_KOR). The existing `FormType` and `InvoiceType` unions in `src/models/invoices/types.ts` are query-side types, not submission-side.

**Note**: `DEFAULT_FORM_CODE` had incorrect values (`systemCode: 'FA'`, `schemaVersion: '3'`, `value: 'FA (3)'`) but was already fixed in a parallel change. This change replaces inline objects with typed constants.

## Goals / Non-Goals

**Goals:**
- Type-safe form code selection — eliminate magic string construction
- Session-type constraints at the type level (PEF excluded from batch)
- Single source of truth for all 7 form code variants
- CLI `--form-code` option for session open and invoice send
- Backward-compatible — existing code using raw `FormCode` objects continues to work

**Non-Goals:**
- Invoice XML serialization (P3.4 — separate change)
- PEF/UBL XML handling or parsing
- XSD validation per document type
- Changing the `FormCode` interface itself (stays `{ systemCode: string; ... }`)

## Decisions

### D1: New model directory `src/models/document-structures/`

Place all new types in `src/models/document-structures/types.ts` with barrel `index.ts` re-export via `src/models/index.ts`. This follows the existing convention (`src/models/{domain}/types.ts`).

**Alternative**: Add to `src/models/common.ts`. Rejected — common.ts holds shared primitives; document structures are a distinct domain with enough surface area for their own module.

### D2: `SystemCode` as const enum-like object, not TypeScript `enum`

Use a `const` object with `as const` for `SystemCode`:

```typescript
export const SystemCode = {
  FA_2: 'FA (2)',
  FA_3: 'FA (3)',
  PEF_3: 'PEF (3)',
  PEF_KOR_3: 'PEF_KOR (3)',
  FA_RR_1: 'FA_RR (1)',
} as const;
export type SystemCode = (typeof SystemCode)[keyof typeof SystemCode];
```

**Alternative**: TypeScript `enum`. Rejected — const objects are more tree-shakable, work better with `as const` literal types, and align with the project's existing pattern (no enums used anywhere in the codebase; all unions use string literal types).

### D3: `FORM_CODES` as a flat const object with literal-typed entries

```typescript
export const FORM_CODES = {
  FA_2:               { systemCode: 'FA (2)',     schemaVersion: '1-0E', value: 'FA'    },
  FA_3:               { systemCode: 'FA (3)',     schemaVersion: '1-0E', value: 'FA'    },
  PEF_3:              { systemCode: 'PEF (3)',    schemaVersion: '2-1',  value: 'PEF'   },
  PEF_KOR_3:          { systemCode: 'PEF_KOR (3)',schemaVersion: '2-1',  value: 'PEF'   },
  FA_RR_1_LEGACY:     { systemCode: 'FA_RR (1)',  schemaVersion: '1-0E', value: 'RR'    },
  FA_RR_1_TRANSITION: { systemCode: 'FA_RR (1)',  schemaVersion: '1-1E', value: 'RR'    },
  FA_RR_1:            { systemCode: 'FA_RR (1)',  schemaVersion: '1-1E', value: 'FA_RR' },
} as const satisfies Record<string, FormCode>;
```

**Why `as const satisfies`**: Gets literal types for each field while verifying assignability to `FormCode`. Each entry infers as `{ readonly systemCode: "FA (2)"; readonly schemaVersion: "1-0E"; readonly value: "FA" }`.

**Alternative**: Per-entry typed interfaces (smekcio pattern: `Fa2FormCode extends FormCode`). Rejected — adds 7 interfaces for no functional benefit; the `as const` approach achieves the same literal narrowing with less code.

### D4: Session-type unions using `typeof` extraction

```typescript
export type OnlineSessionFormCode = (typeof FORM_CODES)[keyof typeof FORM_CODES];
export type BatchSessionFormCode =
  | typeof FORM_CODES.FA_2
  | typeof FORM_CODES.FA_3
  | typeof FORM_CODES.FA_RR_1_LEGACY
  | typeof FORM_CODES.FA_RR_1_TRANSITION
  | typeof FORM_CODES.FA_RR_1;
```

These are used as parameter types in workflow option interfaces. The existing `FormCode` type on service methods (e.g. `openSession`) stays as-is for backward compatibility — the narrower union types are opt-in at the workflow/builder level.

### D5: Helper functions as standalone exports, not a class

Export `getFormCode()`, `parseFormCode()`, `validateFormCodeForSession()` as standalone functions from the same module. No `FormCodeHelper` class — the project uses functional style throughout (no utility classes).

**Alternative**: Static class like C#'s `SystemCodeHelper`. Rejected — doesn't match project conventions.

### D6: `FORM_CODE_KEYS` for CLI mapping

```typescript
export const FORM_CODE_KEYS: Record<string, FormCode> = {
  FA2: FORM_CODES.FA_2,
  FA3: FORM_CODES.FA_3,
  PEF3: FORM_CODES.PEF_3,
  PEFKOR3: FORM_CODES.PEF_KOR_3,
  FARR1: FORM_CODES.FA_RR_1,
};
```

Keys are short, uppercase, no underscores — optimized for CLI typing. Only 5 keys (not 7) since legacy/transition FA_RR variants are not exposed to CLI users.

### D7: Replace inline `FormCode` objects in CLI and workflows with `FORM_CODES` constants

- `src/workflows/online-session-workflow.ts`: `DEFAULT_FORM_CODE` → `FORM_CODES.FA_2`
- `src/workflows/batch-session-workflow.ts`: `DEFAULT_FORM_CODE` → `FORM_CODES.FA_2`
- `src/cli/commands/session.ts:47`: inline object → `FORM_CODES.FA_2` (or resolved from `--form-code`)
- `src/cli/commands/invoice.ts:114`: inline object → `FORM_CODES.FA_2` (or resolved from `--form-code`)

### D8: `INVOICE_TYPES_BY_SYSTEM_CODE` mapping

```typescript
export const INVOICE_TYPES_BY_SYSTEM_CODE: Record<SystemCode, readonly InvoiceType[]> = {
  [SystemCode.FA_2]:     ['Vat', 'Zal', 'Kor', 'Roz', 'Upr', 'KorZal', 'KorRoz'],
  [SystemCode.FA_3]:     ['Vat', 'Zal', 'Kor', 'Roz', 'Upr', 'KorZal', 'KorRoz'],
  [SystemCode.PEF_3]:    ['VatPef', 'VatPefSp', 'KorPef'],
  [SystemCode.PEF_KOR_3]:['KorPef'],
  [SystemCode.FA_RR_1]:  ['VatRr', 'KorVatRr'],
};
```

Uses `Record<SystemCode, ...>` to ensure exhaustiveness — adding a new `SystemCode` member will cause a type error until the mapping is updated.

## Risks / Trade-offs

**[Risk] FA_RR transition path complexity** → Expose only 5 CLI keys; legacy/transition variants are available programmatically via `FORM_CODES` for advanced users. Document the FA_RR evolution in JSDoc.

**[Risk] Batch + PEF validation gap** → Runtime `validateFormCodeForSession()` catches misuse that the type system doesn't enforce when raw `FormCode` objects are used. CLI validates eagerly before opening session.

**[Trade-off] `satisfies` requires TS 4.9+** → Project already targets TS 5.x, so not a concern. Using `as const satisfies` is the idiomatic modern approach.

**[Trade-off] No breaking changes to service method signatures** → Services continue to accept `FormCode` (not `OnlineSessionFormCode`). Type narrowing is opt-in at the workflow layer. This means a PEF form code passed directly to `batchSession.openSession()` won't be caught at compile time — only via `validateFormCodeForSession()` at runtime.
