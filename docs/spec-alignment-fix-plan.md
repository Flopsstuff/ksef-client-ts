# Spec Alignment Fix Plan v2

Full audit of all 9 OpenAPI spec domains (78 routes, 343 schemas) completed 2026-03-22.

## Summary

- All 78 routes implemented (100%)
- 11 discrepancy categories found (7 original + 4 from upstream 2.3.0-te update)
- P4 items (8-9) require code changes: `FormType` enum + `InvoiceExportRequest.onlyMetadata`

---

## P0 — Functional Issues

### 1. `TestDataStatusResponse` not defined in spec

**Problem:** The spec declares `"200": {}` (empty/unspecified response body) for all testdata endpoints. The implementation invents a `TestDataStatusResponse { code: number; description: string }` type not present in the spec. If the intent was to model `StatusInfo`, the `details` field is also missing.

**Files:**
- `src/models/test-data/types.ts:96-99`
- `src/services/test-data.ts` (all methods return `TestDataStatusResponse`)

**Fix options:**
- A) Change return type to `void` (match spec literally)
- B) Change return type to `OperationStatusInfo` from `src/models/common.ts` (reuse existing type that already models `StatusInfo`)
- C) Keep as-is but add `details?: string[]` to match `StatusInfo` shape

**Recommendation:** Option B — reuse `OperationStatusInfo` and delete `TestDataStatusResponse`.

---

### 2. `InvoiceStatusInfo.extensions` does not allow `null` values

**Problem:** Spec says `additionalProperties: { type: "string", nullable: true }`, meaning values can be `string | null`. Implementation uses `Record<string, string>`.

**File:** `src/models/sessions/status-types.ts:58`

**Fix:**
```typescript
// Before
extensions?: Record<string, string>;

// After
extensions?: Record<string, string | null>;
```

**Note:** The project already uses the correct pattern for `PartUploadRequest.headers` in `src/models/sessions/batch-types.ts:26`.

---

## P1 — Nullable vs Optional (systematic)

### 3. Fields use `?` (optional) instead of `| null` where spec says `nullable: true`

**Problem:** The spec's `nullable: true` means the JSON value can be explicitly `null`. TypeScript `?` means the property can be absent (undefined). These are semantically different. The implementation consistently maps `nullable` to `optional` without `| null`.

**Affected files and fields:**

#### `src/models/auth/types.ts`
| Line | Field | Should be |
|------|-------|-----------|
| 51 | `ip4Addresses?: string[]` | `ip4Addresses?: string[] \| null` |
| 52 | `ip4Ranges?: string[]` | `ip4Ranges?: string[] \| null` |
| 53 | `ip4Masks?: string[]` | `ip4Masks?: string[] \| null` |
| 57 | `allowedIps?: AllowedIps` | `allowedIps?: AllowedIps \| null` |
| 38 | `isTokenRedeemed?: boolean` | `isTokenRedeemed?: boolean \| null` |
| 39 | `lastTokenRefreshDate?: string` | `lastTokenRefreshDate?: string \| null` |
| 40 | `refreshTokenValidUntil?: string` | `refreshTokenValidUntil?: string \| null` |

#### `src/models/auth/active-sessions-types.ts`
| Line | Field | Should be |
|------|-------|-----------|
| 10 | `isTokenRedeemed?: boolean` | `isTokenRedeemed?: boolean \| null` |
| 11 | `lastTokenRefreshDate?: string` | `lastTokenRefreshDate?: string \| null` |
| 12 | `refreshTokenValidUntil?: string` | `refreshTokenValidUntil?: string \| null` |
| 18 | `continuationToken?: string` | `continuationToken?: string \| null` |

#### `src/models/common.ts`
| Line | Field | Should be |
|------|-------|-----------|
| 8 | `details?: string[]` | `details?: string[] \| null` |

**Fix:** Add `| null` to each field. Keep `?` as well since nullable fields are typically also optional.

---

## P2 — Required vs Optional Mismatch

### 4. `authenticationMethod` marked optional but spec says required

**Problem:** Spec lists `authenticationMethod` in the `required` array (even though the field is deprecated). Implementation marks it as optional with `?`.

**Files:**
- `src/models/auth/active-sessions-types.ts:8` — `authenticationMethod?: string`
- `src/models/auth/types.ts:36` — `authenticationMethod?: string`

**Fix:** Remove `?` to make required:
```typescript
// Before
authenticationMethod?: string;

// After
authenticationMethod: string;
```

---

### 5. `TooManyRequestsStatus.description` and `details` marked optional but spec says required

**Problem:** Spec has `required: ["code", "description", "details"]`. Implementation has both as optional.

**File:** `src/errors/types.ts:20-21`

**Fix:**
```typescript
// Before
description?: string;
details?: string[];

// After
description: string;
details: string[];
```

**Note:** `description` is in `required` but absent from `properties` in the spec — this is a spec bug (see P3-6). However `details` IS in both `required` and `properties`, so it should definitely be required.

---

## P3 — Spec Bugs (no code fix needed)

### 6. `StatusInfo.description` in `required` but missing from `properties`

**Problem:** Across all domains, the `StatusInfo` schema lists `description` in the `required` array but does not define it in the `properties` block. Only `code` and `details` are defined as properties.

**Impact:** None — the implementation pragmatically includes `description: string` which is correct behavior (the API does return this field). This is a documentation-only issue in the OpenAPI spec itself.

**Affected spec schemas:** `StatusInfo`, `InvoiceStatusInfo`, `TooManyRequestsResponse.status`, and similar patterns in grant request types (where `description` is required but not in properties).

**Action:** No code change. File upstream bug report if possible.

---

### 7. `int64` fields mapped to `number`

**Problem:** Several spec fields use `format: "int64"` (e.g., `InvoicePackage.invoiceCount`, `size`, `partSize`, `encryptedPartSize`). TypeScript has no native int64 type; `number` is the standard mapping.

**Risk:** Theoretical overflow past `Number.MAX_SAFE_INTEGER` for very large export packages. Extremely unlikely in practice.

**Action:** No code change. This is standard TypeScript practice. Could use `bigint` if needed in the future.

---

## P4 — Upstream Spec Changes (2.3.0-te)

Detected by `check-openapi-coverage.mjs` on 2026-03-22. Upstream build bumped from `2.2.1-te` to `2.3.0-te`.

### 8. Missing `FA_RR` value in `FormType` enum

**Problem:** Upstream added `"FA_RR"` to `InvoiceQueryFormType.enum`. Old `"RR"` is deprecated. Our `FormType` only has `'FA' | 'PEF' | 'RR'`.

**File:** `src/models/invoices/types.ts:26`

**Fix:**
```typescript
// Before
export type FormType = 'FA' | 'PEF' | 'RR';

// After
export type FormType = 'FA' | 'PEF' | 'RR' | 'FA_RR';
```

---

### 9. Missing `onlyMetadata` field in `InvoiceExportRequest`

**Problem:** Upstream added `onlyMetadata: boolean` (default: `false`) to `InvoiceExportRequest`. Allows requesting only metadata without invoice bodies.

**File:** `src/models/invoices/types.ts:150-153`

**Fix:**
```typescript
// Before
export interface InvoiceExportRequest {
  encryption: EncryptionInfo;
  filters: InvoiceQueryFilters;
}

// After
export interface InvoiceExportRequest {
  encryption: EncryptionInfo;
  filters: InvoiceQueryFilters;
  onlyMetadata?: boolean;
}
```

---

### 10. `clientIp` in `AuthChallengeResponse` example

**Problem:** Upstream added `clientIp: "127.0.0.1"` to the response example for `POST /auth/challenge`. This is only an example value change, not a schema change — the `AuthChallengeResponse` schema itself was not modified. Likely an informational/audit field the API now returns.

**Action:** No code change needed. Monitor if this field appears in the schema in future spec versions.

---

### 11. Description-only changes (no code impact)

The following are documentation/description updates with no impact on types or behavior:

- `InvoiceMetadata.vatAmount` — description clarified: "expressed in PLN"
- `InvoiceQueryFormType` description — `RR` marked as deprecated with badge
- `InvoiceQueryFilters.formType` / `invoiceTypes` — description tables updated
- `ForbiddenProblemDetails.reasonCode` / `security` — whitespace/formatting in descriptions
- `OpenBatchSessionRequest.formCode` / `OpenOnlineSessionRequest.formCode` — schema table updated
- `securitySchemes.Bearer.scheme` — `"Bearer"` → `"bearer"` (case normalization, no functional impact)
- `limits/subject` example values — `maxCertificates` 2→6, `maxEnrollments` 6→12

**Action:** No code change.

---

## Implementation Order

1. **P0-1** `TestDataStatusResponse` cleanup — delete type, reuse `OperationStatusInfo`
2. **P0-2** `InvoiceStatusInfo.extensions` — add `| null`
3. **P1-3** Nullable fields — add `| null` across auth, common, sessions types
4. **P2-4** `authenticationMethod` — make required
5. **P2-5** `TooManyRequestsStatus` — make `details` required
6. **P4-8** `FormType` — add `'FA_RR'`
7. **P4-9** `InvoiceExportRequest` — add `onlyMetadata?: boolean`
8. Update tests to reflect any type changes
