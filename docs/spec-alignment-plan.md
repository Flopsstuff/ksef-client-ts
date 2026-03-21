# Spec Alignment Fix Plan — KSeF v2

Date: 2026-03-21
Source of truth: `docs/openapi-chunks/*.json` (OpenAPI specification)
Total issues found: **52** across 9 domains

---

## Summary

| # | Domain | Issues | Severity | Status |
|---|--------|--------|----------|--------|
| 1 | Limits & Restrictions | 11 | P0 Critical | [ ] |
| 2 | Permissions | 7 | P0 Critical | [ ] |
| 3 | KSeF Tokens | 7 | P1 High | [ ] |
| 4 | Peppol Services | 5 | P1 High | [ ] |
| 5 | Certificates | 1 | P1 High | [ ] |
| 6 | Test Data | 6 | P2 Medium | [ ] |
| 7 | Invoices | 4 | P2 Medium | [ ] |
| 8 | Authentication | 3 | P2 Medium | [ ] |
| 9 | Encryption | 8 | P3 Low | [ ] |

---

## P0 — Limits & Restrictions (11 issues)

API will reject requests — all request types are completely wrong.

### Fix 1: Rewrite all request types for limits endpoints

**Files to change:**
- `src/models/test-data/types.ts` (lines 73-85) — delete wrong types
- `src/models/limits/types.ts` — add new request types here

**Actions:**

1. **Delete** `ChangeSessionLimitsInCurrentContextRequest` (lines 73-76)
2. **Delete** `ChangeCertificatesLimitInCurrentSubjectRequest` (lines 78-80)
3. **Delete** `EffectiveApiRateLimitsRequest` (lines 82-85)
4. **Create** the following types per spec:

```typescript
// Rate limit override for a single category
export interface ApiRateLimitValuesOverride {
  perSecond: number;  // int32
  perMinute: number;  // int32
  perHour: number;    // int32
}

// All 12 rate limit categories
export interface ApiRateLimitsOverride {
  onlineSession: ApiRateLimitValuesOverride;
  batchSession: ApiRateLimitValuesOverride;
  invoiceSend: ApiRateLimitValuesOverride;
  invoiceStatus: ApiRateLimitValuesOverride;
  sessionList: ApiRateLimitValuesOverride;
  sessionInvoiceList: ApiRateLimitValuesOverride;
  sessionMisc: ApiRateLimitValuesOverride;
  invoiceMetadata: ApiRateLimitValuesOverride;
  invoiceExport: ApiRateLimitValuesOverride;
  invoiceExportStatus: ApiRateLimitValuesOverride;
  invoiceDownload: ApiRateLimitValuesOverride;
  other: ApiRateLimitValuesOverride;
}

export interface OnlineSessionContextLimitsOverride {
  maxInvoiceSizeInMB: number;              // int32, 0-5
  maxInvoiceWithAttachmentSizeInMB: number; // int32, 0-10
  maxInvoices: number;                      // int32, 0-100000
}

export interface BatchSessionContextLimitsOverride {
  maxInvoiceSizeInMB: number;              // int32, 0-5
  maxInvoiceWithAttachmentSizeInMB: number; // int32, 0-10
  maxInvoices: number;                      // int32, 0-100000
}

export interface EnrollmentSubjectLimitsOverride {
  maxEnrollments?: number | null;
}

export interface CertificateSubjectLimitsOverride {
  maxCertificates?: number | null;
}

export interface SetSessionLimitsRequest {
  onlineSession: OnlineSessionContextLimitsOverride;
  batchSession: BatchSessionContextLimitsOverride;
}

export interface SetSubjectLimitsRequest {
  subjectIdentifierType?: SubjectIdentifierType;
  enrollment?: EnrollmentSubjectLimitsOverride | null;
  certificate?: CertificateSubjectLimitsOverride | null;
}

export interface SetRateLimitsRequest {
  rateLimits: ApiRateLimitsOverride;
}
```

### Fix 2: Split EffectiveContextLimits into two types

**File:** `src/models/limits/types.ts` (lines 22-26)

**Action:** Replace single `SessionEffectiveContextLimits` with:
```typescript
export interface OnlineSessionEffectiveContextLimits {
  maxInvoiceSizeInMB: number;
  maxInvoiceWithAttachmentSizeInMB: number;
  maxInvoices: number;
}

export interface BatchSessionEffectiveContextLimits {
  maxInvoiceSizeInMB: number;
  maxInvoiceWithAttachmentSizeInMB: number;
  maxInvoices: number;
}
```

Update `EffectiveContextLimitsResponse` to use these two types instead of one shared type.

### Fix 3: Update service methods

**File:** `src/services/test-data.ts` (lines 86-134)

**Actions:**
1. `changeSessionLimits()` — change param type to `SetSessionLimitsRequest`
2. `changeCertificatesLimit()` — change param type to `SetSubjectLimitsRequest`
3. `setRateLimits()` — change param type to `SetRateLimitsRequest`
4. `setProductionRateLimits()` — **remove body parameter entirely** (spec says no requestBody)

### Fix 4: Update CLI command

**File:** `src/cli/commands/test-data.ts`

**Action:** Fix `setProductionRateLimits` command to not send a body.

---

## P0 — Permissions (7 issues)

All 7 query response types have wrong field names — deserialization from API will be broken.

### Fix 5: Rewrite all permission query response types

**File:** `src/models/permissions/types.ts` (lines 342-390)

**Systematic renames across all types:**
- `permissionId` -> `id`
- `grantDate` -> `startDate`
- `permission` -> `permissionScope`
- `subjectIdentifier` -> `authorizedIdentifier`
- `subunitCode` -> `subunitIdentifier`

**Actions per type:**

1. **PersonalPermission** (lines 342-346) — rename 3 fields, add 7 missing fields:
```typescript
export interface PersonalPermission {
  id: string;
  contextIdentifier?: string | null;
  authorizedIdentifier?: string | null;
  targetIdentifier?: string | null;
  permissionScope: PersonPermissionType;
  permissionState: string;
  startDate: string;
  canDelegate: boolean;
  subjectPersonDetails?: object | null;
  subjectEntityDetails?: object | null;
}
```

2. **PersonPermission** (lines 348-353) — rename 4 fields, add 7 missing fields:
```typescript
export interface PersonPermission {
  id: string;
  authorizedIdentifier: string;
  contextIdentifier?: string | null;
  targetIdentifier?: string | null;
  authorIdentifier: string;
  permissionScope: PersonPermissionType;
  permissionState: string;
  startDate: string;
  canDelegate: boolean;
  subjectPersonDetails?: object | null;
  subjectEntityDetails?: object | null;
}
```

3. **SubunitPermission** (lines 355-360) — rename 3 fields, add 4 missing:
```typescript
export interface SubunitPermission {
  id: string;
  authorizedIdentifier: SubunitPermissionsAuthorizedIdentifier;
  subunitIdentifier: string;
  authorIdentifier: string;
  permissionScope: SubunitPermissionScope;
  subjectPersonDetails?: object | null;
  subunitName?: string | null;
  startDate: string;
}
```

4. **EntityRole** (lines 362-368) — remove 3 extra fields, rename 1, add 1:
```typescript
export interface EntityRole {
  parentEntityIdentifier?: string | null;
  role: EntityRoleType;
  startDate: string;
}
```

5. **SubordinateEntityRole** (lines 370-376) — remove 3 extra fields, rename 1, add 1:
```typescript
export interface SubordinateEntityRole {
  subordinateEntityIdentifier: string;
  role: SubordinateEntityRoleType;
  startDate: string;
}
```

6. **AuthorizationGrant** (lines 378-382) — rename 2 fields, add 4 missing:
```typescript
export interface AuthorizationGrant {
  id: string;
  authorIdentifier?: string | null;
  authorizedEntityIdentifier: string;
  authorizingEntityIdentifier: string;
  authorizationScope: InvoicePermissionType;
  subjectEntityDetails?: object | null;
  startDate: string;
}
```

7. **EuEntityPermission** (lines 384-390) — rename 3 fields, remove 1 extra, add 7 missing:
```typescript
export interface EuEntityPermission {
  id: string;
  authorIdentifier: string;
  vatUeIdentifier: string;
  euEntityName: string;
  authorizedFingerprintIdentifier: string;
  permissionScope: EuEntityPermissionsQueryPermissionType;
  subjectPersonDetails?: object | null;
  subjectEntityDetails?: object | null;
  euEntityDetails?: object | null;
  startDate: string;
}
```

### Fix 6: Update service and tests

**Files:**
- `src/services/permissions.ts` — update any field references
- `tests/unit/services/permissions.test.ts` — update test fixtures to use new field names

---

## P1 — KSeF Tokens (7 issues)

### Fix 7: Make GenerateTokenRequest.description required

**File:** `src/models/tokens/types.ts` (line 13)

**Action:** Change `description?: string` to `description: string`

### Fix 8: Replace pageOffset with x-continuation-token header

**Files:**
- `src/models/tokens/types.ts` (line 52) — replace `pageOffset?: number` with `continuationToken?: string`
- `src/services/tokens.ts` (line 24) — send as header instead of query param

**Action in service:**
```typescript
// Before (wrong):
if (options.pageOffset !== undefined) req.query('pageOffset', String(options.pageOffset));

// After (correct):
if (options.continuationToken) req.header('x-continuation-token', options.continuationToken);
```

### Fix 9: Add QueryTokensResponseItem type

**File:** `src/models/tokens/types.ts`

**Action:** Create separate type for list items with `description` field per spec. Update `QueryKsefTokensResponse` to use it.

---

## P1 — Peppol Services (5 issues)

### Fix 10: Fix PeppolProvider field names

**File:** `src/models/peppol/types.ts` (lines 1-11)

**Actions:**
1. Rename `identifier` -> `id`
2. Make `dateCreated` required (remove `?`)
3. Remove `description` field (not in spec)
4. Rename `providers` -> `peppolProviders` in `QueryPeppolProvidersResponse`

```typescript
export interface PeppolProvider {
  id: string;
  name: string;
  dateCreated: string;
}

export interface QueryPeppolProvidersResponse {
  peppolProviders: PeppolProvider[];
  hasMore: boolean;
}
```

### Fix 11: Update service and tests

**Files:**
- `src/services/peppol.ts` — verify no field references need updating
- `tests/unit/services/peppol.test.ts` — update test fixtures

---

## P1 — Certificates (1 issue)

### Fix 12: Fix certificate revoke request

**File:** `src/models/certificates/types.ts` (lines 111-113)

**Action:** Rename type and fix field:
```typescript
// Before:
export interface CertificateRevokeRequest {
  reason?: string;
}

// After:
export interface RevokeCertificateRequest {
  revocationReason?: CertificateRevocationReason | null;
}
```

**Also update:**
- `src/services/certificates.ts` — update type reference in `revoke()` method
- `tests/unit/services/certificates.test.ts` — update test fixtures

---

## P2 — Test Data (6 issues)

### Fix 13: Remove extra field from TestDataPermissionsRevokeRequest

**File:** `src/models/test-data/types.ts` (lines 58-62)

**Action:** Remove `permissions: TestDataPermission[]` field — spec only has `contextIdentifier` and `authorizedIdentifier`.

### Fix 14: Add TestDataAuthenticationContextIdentifier type

**File:** `src/models/test-data/types.ts`

**Action:** Create new identifier type for block/unblock:

```typescript
export type TestDataAuthenticationContextIdentifierType =
  | 'Nip' | 'InternalId' | 'NipVatUe' | 'PeppolId';

export interface TestDataAuthenticationContextIdentifier {
  type: TestDataAuthenticationContextIdentifierType;
  value: string;
}

export interface BlockContextAuthenticationRequest {
  contextIdentifier: TestDataAuthenticationContextIdentifier;
}

export interface UnblockContextAuthenticationRequest {
  contextIdentifier: TestDataAuthenticationContextIdentifier;
}
```

Delete old `ContextBlockRequest` and `ContextUnblockRequest`.

### Fix 15: Change TestDataPermission from string enum to interface

**File:** `src/models/test-data/types.ts` (lines 13-20)

**Action:**
```typescript
// Before:
export type TestDataPermission = 'InvoiceRead' | 'InvoiceWrite' | ...;

// After:
export type TestDataPermissionType =
  | 'InvoiceRead' | 'InvoiceWrite' | 'Introspection'
  | 'CredentialsRead' | 'CredentialsManage'
  | 'EnforcementOperations' | 'SubunitManage';

export interface TestDataPermission {
  permissionType: TestDataPermissionType;
  description: string;
}
```

Update all usages in services and tests.

### Fix 16: Add missing enum types

**File:** `src/models/test-data/types.ts`

**Action:** Add:
- `TestDataContextIdentifierType` = `'Nip'`
- `TestDataAuthorizedIdentifierType` = `'Nip' | 'Pesel' | 'Fingerprint'`

---

## P2 — Invoices (4 issues)

### Fix 17: Add InternalId to ThirdSubjectIdentifierType

**File:** `src/models/invoices/types.ts` (line 22)

**Action:** Create a separate `ThirdSubjectIdentifierType` with `InternalId`:
```typescript
export type ThirdSubjectIdentifierType = 'Nip' | 'InternalId' | 'VatUe' | 'Other' | 'None';
```

Update `InvoiceMetadataThirdSubject` to use this type.

### Fix 18: Make SessionInvoiceStatusResponse.invoicingMode required

**File:** `src/models/sessions/status-types.ts` (line 73)

**Action:** Change `invoicingMode?: InvoicingMode` to `invoicingMode: InvoicingMode`

### Fix 19: Rename types to match spec (optional, low impact)

- `PagedInvoiceResponse` -> `QueryInvoicesMetadataResponse` (`src/models/invoices/types.ts:132`)
- `PackagePartSignatureInitResponse` -> `PartUploadRequest` (`src/models/sessions/batch-types.ts:22`)

Update all references in services, tests, and CLI.

---

## P2 — Authentication (3 issues)

### Fix 20: Investigate SubjectIdentifierType values

**File:** `src/models/auth/types.ts` (line 48)

**Action:** Research the full set of valid values. The spec example shows `certificateSubject`, code uses it as default, tests use `'Person'`. Either:
- Add missing values to the enum if they are valid, or
- Treat this as an XML-specific value not part of the REST enum (needs clarification from spec)

Also check `src/client.ts` buildAuthTokenRequestXml and tests.

### Fix 21: authenticationMethod optionality (NO ACTION)

Intentional deviation — field is deprecated in spec (x-removal-date: 2026-11-16). Current implementation is a pragmatic choice. Keep as-is.

### Fix 22: Type naming (optional, low impact)

**File:** `src/models/auth/types.ts` (line 25)

**Action:** Optionally rename `RefreshTokenResponse` -> `AuthenticationTokenRefreshResponse`. Low priority.

---

## P3 — Encryption (8 issues)

These are mostly about missing shared error types and a missing public service. Lower priority since the functionality works internally.

### Fix 23: Rename PublicKeyCertificateInfo -> PublicKeyCertificate

**File:** `src/models/crypto/types.ts` (line 5)

**Action:** Remove "Info" suffix. Update all references in `src/crypto/certificate-fetcher.ts`.

### Fix 24: Add shared error/exception types (optional)

These types are shared across all domains in the spec but handled generically by RestClient:
- `ExceptionInfo`
- `ExceptionResponse`
- `ReferenceNumber` (branded string type)
- `RetryAfter` (int32)
- `TooManyRequestsResponse`

**File:** `src/errors/types.ts`

**Action:** Add proper types if strict spec compliance is desired. Low priority since error handling works via RestClient.

### Fix 25: Consider adding public SecurityService (optional)

**Action:** Create `src/services/security.ts` exposing `GET /security/public-key-certificates` publicly, rather than only using it internally in CertificateFetcher. Low priority — current internal usage works fine.

---

## Execution Order

Recommended implementation order to minimize breakage:

1. **P0: Limits & Restrictions** (Fixes 1-4) — request types are completely wrong
2. **P0: Permissions** (Fixes 5-6) — response types are completely wrong
3. **P1: KSeF Tokens** (Fixes 7-9) — pagination mechanism is wrong
4. **P1: Peppol** (Fixes 10-11) — field names are wrong
5. **P1: Certificates** (Fix 12) — single type fix
6. **P2: Test Data** (Fixes 13-16) — multiple type fixes
7. **P2: Invoices** (Fixes 17-19) — enum + optionality fixes
8. **P2: Authentication** (Fixes 20-22) — needs spec clarification
9. **P3: Encryption** (Fixes 23-25) — cosmetic/optional

After each domain fix: run `yarn lint` and `yarn test`, update tests as needed.
