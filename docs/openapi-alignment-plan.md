# OpenAPI Alignment Plan

Fixes for discrepancies found between `ref/open-api.json` (KSeF API v2) and our TypeScript implementation.

OpenAPI spec is split into chunks at `ref/openapi-chunks/` — see `ref/openapi-chunks/_manifest.txt` for the index.

---

## Priority 1 — Critical enum value mismatches

These will cause API calls to fail or return unexpected results.

### Task 1.1: Fix `PersonPermissionType`

**File:** `src/models/permissions/types.ts:4`
**Spec:** `ref/openapi-chunks/granting-permissions.json:1772` (schema `PersonPermissionType`)
**Also:** `ref/openapi-chunks/permission-search.json:2311`

| Current (wrong) | OpenAPI (correct) |
|---|---|
| `CredentialRead` | `CredentialsRead` |
| `CredentialManage` | `CredentialsManage` |
| `SelfInvoicing` | `Introspection` |

Action: rename values to match OpenAPI. Ripple through all usages (builders, services, tests).

### Task 1.2: Fix `InvoicePermissionType`

**File:** `src/models/permissions/types.ts:82`
**Spec:** `ref/openapi-chunks/permission-search.json:1937` (schema `InvoicePermissionType`)

| Current (wrong) | OpenAPI (correct) |
|---|---|
| `InvoiceRead`, `InvoiceWrite` | `SelfInvoicing`, `TaxRepresentative`, `RRInvoicing`, `PefInvoicing` |

This type is completely wrong — our values describe read/write scope, but OpenAPI defines authorization modes. The current values duplicate `EntityPermissionItemType`. Replace entirely.

Check where `InvoicePermissionType` is used (e.g. `QueryAuthorizationsGrantsRequest.permissionTypes`) and verify the semantic match.

### Task 1.3: Fix `EuEntityPermissionType`

**File:** `src/models/permissions/types.ts:46`
**Spec:** `ref/openapi-chunks/granting-permissions.json:1230` (schema `EuEntityPermissionType`)

| Current | OpenAPI |
|---|---|
| `InvoiceRead`, `InvoiceWrite`, `CredentialRead`, `CredentialManage` | `InvoiceWrite`, `InvoiceRead` |

Action: remove `CredentialRead` and `CredentialManage`.

### Task 1.4: Fix `SubjectIdentifierType` (auth)

**File:** `src/models/auth/types.ts:48`
**Spec:** `ref/openapi-chunks/limits-restrictions.json:1628` (schema `SubjectIdentifierType`)
**Also:** `ref/open-api.json:15303`

| Current (wrong) | OpenAPI (correct) |
|---|---|
| `certificateSubject`, `certificateFingerprint` | `Nip`, `Pesel`, `Fingerprint` |

This is used in `AuthTokenRequest.subjectIdentifierType`. The current values look like they were taken from a reference implementation's internal naming, not the API contract.

### Task 1.5: Fix `KsefTokenPermissionType`

**File:** `src/models/tokens/types.ts:1`
**Spec:** `ref/openapi-chunks/ksef-tokens.json:788` (schema `TokenPermissionType`)

| Current | OpenAPI `TokenPermissionType` |
|---|---|
| `CredentialRead` | `CredentialsRead` |
| `CredentialManage` | `CredentialsManage` |
| `SelfInvoicing` | `Introspection` |

Same pattern as `PersonPermissionType` — plural `Credentials*` and `Introspection` instead of `SelfInvoicing`.

### Task 1.6: Fix `TestDataPermission`

**File:** `src/models/test-data/types.ts:13`
**Spec:** `ref/openapi-chunks/test-data.json:991` (schema `TestDataPermissionType`)

| Current | OpenAPI `TestDataPermissionType` |
|---|---|
| `CredentialRead` | `CredentialsRead` |
| `CredentialManage` | `CredentialsManage` |
| `SelfInvoicing` | `Introspection` |

Same pattern.

### Task 1.7: Cascade `Credential*` -> `Credentials*` everywhere

After fixing the above, grep for `CredentialRead` and `CredentialManage` across all models to catch remaining types that use the wrong spelling:

- `EntityStandardPermissionType` (`permissions/types.ts:13`) — `CredentialRead/Manage` -> `CredentialsRead/Manage`, add `Introspection`, remove `SelfInvoicing`
  - **Spec:** `ref/openapi-chunks/granting-permissions.json:964` (schema `EntityPermissionType`)
- `AuthorizationPermissionType` (`permissions/types.ts:22`) — `CredentialRead/Manage` -> `CredentialsRead/Manage`
- `IndirectEntityStandardPermissionType` (`permissions/types.ts:28`) — same fix
  - **Spec:** `ref/openapi-chunks/granting-permissions.json:1466` (schema `IndirectPermissionType`)
- `SubunitPermissionType` (`permissions/types.ts:37`) — same fix
  - **Spec:** `ref/openapi-chunks/permission-search.json:3122` (schema `SubunitPermissionScope`)
- `EuEntityRepresentativePermissionType` (`permissions/types.ts:52`) — same fix

**Note:** `PersonalPermissionScopeType` already uses `CredentialsRead/Manage` — no change needed.
**Spec ref:** `ref/openapi-chunks/permission-search.json:2638` (schema `PersonalPermissionScope`)

---

## Priority 2 — Error handling gaps

### Task 2.1: Add `details` field to `ExceptionDetail`

**File:** `src/errors/types.ts:1`
**Spec:** `ref/openapi-chunks/operations.json:247` (schema `ExceptionResponse` / `ExceptionDetail`)
**Also:** every chunk file contains `ExceptionResponse` — it's the standard 400 error format.

```typescript
export interface ExceptionDetail {
  exceptionDetailCode: number;
  exceptionDescription: string;
  details?: string[];  // <-- add
}
```

### Task 2.2: Add `UnauthorizedProblemDetails` type

**File:** `src/errors/types.ts` (new interface)
**Spec:** `ref/openapi-chunks/operations.json:412` (schema `UnauthorizedProblemDetails`)
**Also:** duplicated in all chunk files — standard 401 error format.

```typescript
export interface UnauthorizedProblemDetails {
  title: string;    // "Unauthorized"
  status: number;   // 401
  detail: string;
  instance?: string;
  traceId?: string;
}
```

### Task 2.3: Add `ForbiddenProblemDetails` type

**File:** `src/errors/types.ts` (new interface)
**Spec:** `ref/openapi-chunks/operations.json:278` (schema `ForbiddenProblemDetails`)
**Also:** duplicated in all chunk files — standard 403 error format.

OpenAPI defines 5 `reasonCode` values: `missing-permissions`, `ip-not-allowed`, `insufficient-resource-access`, `auth-method-not-allowed`, `security-service-blocked`.

```typescript
export type ForbiddenReasonCode =
  | 'missing-permissions'
  | 'ip-not-allowed'
  | 'insufficient-resource-access'
  | 'auth-method-not-allowed'
  | 'security-service-blocked';

export interface ForbiddenProblemDetails {
  title: string;    // "Forbidden"
  status: number;   // 403
  detail: string;
  instance?: string;
  reasonCode: ForbiddenReasonCode;
  security?: Record<string, unknown>;
}
```

### Task 2.4: Add `KSeFUnauthorizedError` class

**File:** new `src/errors/ksef-unauthorized-error.ts`

Extends `KSeFError`. Properties: `statusCode: 401`, `detail`, `traceId?`, `instance?`.

### Task 2.5: Add `KSeFForbiddenError` class

**File:** new `src/errors/ksef-forbidden-error.ts`

Extends `KSeFError`. Properties: `statusCode: 403`, `detail`, `reasonCode`, `security?`.

### Task 2.6: Update `RestClient` error handling

**File:** `src/http/rest-client.ts` (around line 76-95)

Current flow: 429 -> `KSeFRateLimitError`, else -> `KSeFApiError`.

New flow:
1. 429 -> `KSeFRateLimitError` (unchanged)
2. 401 -> parse as `UnauthorizedProblemDetails` -> `KSeFUnauthorizedError`
3. 403 -> parse as `ForbiddenProblemDetails` -> `KSeFForbiddenError`
4. else -> `KSeFApiError` (unchanged)

### Task 2.7: Update barrel exports and CLI error handler

- `src/errors/index.ts` — export new classes
- `src/cli/error-handler.ts` — add hints for 401 (expired token?) and 403 (show `reasonCode`)

---

## Priority 3 — Missing enum types (no runtime impact, improves type safety)

### Task 3.1: Add `AuthenticationMethod` enum

**File:** `src/models/auth/types.ts`
**Spec:** `ref/openapi-chunks/authentication.json:663` (schema `AuthenticationMethod`)

OpenAPI values: `Token`, `TrustedProfile`, `InternalCertificate`, `QualifiedSignature`, `QualifiedSeal`, `PersonalSignature`, `PeppolSignature`.

### Task 3.2: Add `CertificateRevocationReason` enum

**File:** `src/models/certificates/types.ts`
**Spec:** `ref/openapi-chunks/certificates.json:887` (schema `CertificateRevocationReason`)

OpenAPI values: `Unspecified`, `Superseded`, `KeyCompromise`.

### Task 3.3: Add `EntityRoleType` enum

**File:** `src/models/permissions/types.ts`
**Spec:** `ref/openapi-chunks/permission-search.json:1563` (schema `EntityRoleType`)

OpenAPI values: `CourtBailiff`, `EnforcementAuthority`, `LocalGovernmentUnit`, `LocalGovernmentSubUnit`, `VatGroupUnit`, `VatGroupSubUnit`.

### Task 3.4: Add `SubordinateEntityRoleType` enum

**File:** `src/models/permissions/types.ts`
**Spec:** `ref/openapi-chunks/permission-search.json:2987` (schema `SubordinateEntityRoleType`)

OpenAPI values: `LocalGovernmentSubUnit`, `VatGroupSubUnit`.

---

## Priority 4 — Naming alignment (optional, non-breaking)

These types work correctly but have different names than the OpenAPI spec. Renaming is optional — documenting the mapping is sufficient.

| Our name | OpenAPI name | Spec location | Decision |
|---|---|---|---|
| `AuthChallengeResponse` | `AuthenticationChallengeResponse` | `authentication.json` | Keep (shorter) |
| `AuthSessionInfo` | `AuthenticationListItem` | `active-sessions.json` | Keep (descriptive) |
| `GrantPermissionsPersonRequest` | `PersonPermissionsGrantRequest` | `granting-permissions.json` | Keep (builder) |
| `GrantPermissionsEntityRequest` | `EntityPermissionsGrantRequest` | `granting-permissions.json` | Keep |
| `PagedInvoiceResponse` | `QueryInvoicesMetadataResponse` | `invoice-download.json` | Keep (shorter) |
| `CertificateType` | `KsefCertificateType` | `certificates.json` | Keep |
| `CertificateStatus` | `CertificateListItemStatus` | `certificates.json` | Keep |
| `FormType` | `InvoiceQueryFormType` | `invoice-download.json` | Keep |
| `InvoiceSubjectType` | `InvoiceQuerySubjectType` | `invoice-download.json` | Keep |
| `SessionStatus` | `CommonSessionStatus` | `send-status-upo.json` | Keep |
| `EntityAuthorizationsQueryType` | `QueryType` | `permission-search.json` | Keep (specific) |
| `TokenStatus`/`KsefTokenStatus` | `AuthenticationTokenStatus` | `ksef-tokens.json` | Keep |

---

## Priority 5 — Missing response/request types (can add incrementally)

Low priority — these don't block functionality since services use generic types or `unknown`. Add as needed when consuming specific endpoints.

### Permissions query responses (10 types)

**Spec:** `ref/openapi-chunks/permission-search.json` (all response schemas)

- `QueryPersonPermissionsResponse`
- `QueryPersonalPermissionsResponse`
- `QueryEntityPermissionsResponse`
- `QueryEntityAuthorizationPermissionsResponse`
- `QueryEntityRolesResponse`
- `QuerySubunitPermissionsResponse`
- `QuerySubordinateEntityRolesResponse`
- `QueryEuEntityPermissionsResponse`
- `PermissionsOperationResponse`
- `PermissionsOperationStatusResponse` (already exists)

### Permissions identifier types (26+ types)

**Spec:** `ref/openapi-chunks/permission-search.json` and `granting-permissions.json`

Context-specific identifier/type wrappers (e.g. `PersonPermissionsAuthorIdentifierType`, `EntityPermissionsSubjectIdentifierType`). Most map to the same `Nip | Pesel | Fingerprint` union — our generic `PermissionSubjectIdentifierType` covers them.

### Rate/session limits requests

**Spec:** `ref/openapi-chunks/limits-restrictions.json`

- `SetRateLimitsRequest`
- `SetSessionLimitsRequest`
- `SetSubjectLimitsRequest`
- `BatchSessionEffectiveContextLimits`
- `OnlineSessionEffectiveContextLimits`

### TestData request types

**Spec:** `ref/openapi-chunks/test-data.json`

- `BlockContextAuthenticationRequest`
- `UnblockContextAuthenticationRequest`

---

## Routes

Routes are 100% aligned. The only notes:

- `TestData.productionRateLimits` — service uses DELETE+POST, but OpenAPI only defines POST. Verify whether DELETE is actually supported by the API before removing.
  - **Spec:** `ref/openapi-chunks/limits-restrictions.json` (route `/api/online/TestData/EffectiveApiRateLimits/Production`)
- Lighthouse routes (`lighthouse/status`, `lighthouse/messages`) are not in OpenAPI — expected, these use a separate base URL.
