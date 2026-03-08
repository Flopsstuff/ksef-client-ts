# OpenAPI Conformance Report

**Date:** 2026-03-08
**OpenAPI spec:** `ref/ksef-docs-translated/translations/en/open-api.json` (KSeF API v2.2.1)
**Compared against:** TypeScript implementation in `src/`

---

## Summary

| Group | Endpoints | MATCH | PARTIAL | MISMATCH |
|-------|-----------|-------|---------|----------|
| Auth (Access management) | 6 | 2 | 1 | 3 |
| Active Sessions | 3 | 1 | 0 | 2 |
| Sessions (status+online+batch) | 13 | 7 | 3 | 3 |
| Invoices | 4 | 2 | 0 | 2 |
| Permissions | 19 | 4 | 0 | 15 |
| Certificates | 7 | 0 | 2 | 5 |
| Tokens | 4 | 2 | 0 | 2 |
| Limits | 3 | 1 | 0 | 2 |
| Peppol | 1 | 0 | 0 | 1 |
| Security | 1 | 1 | 0 | 0 |
| TestData | 17 | ~12 | 0 | ~5 |
| **TOTAL** | **78** | **~32** | **~6** | **~40** |

All endpoints are implemented (none missing), but ~40 have mismatches with the spec.

---

## CRITICAL — fix first

### 1. Active Sessions: `DELETE /auth/sessions/{referenceNumber}` — wrong path handling

- **File:** `src/services/active-sessions.ts`, `src/http/routes.ts`
- Route `auth/sessions` is not parameterized; `referenceNumber` is sent in request body instead of path.
- **Fix:** Add parameterized route `(ref: string) => \`auth/sessions/${ref}\`` in `Routes.ActiveSessions` and use path parameter in service.

### 2. Peppol: `GET /peppol/query` — wrong HTTP method

- **File:** `src/services/peppol.ts`, `src/models/peppol/types.ts`
- Implementation uses **POST** with empty body `{}`, spec requires **GET** with query parameters.
- `PeppolProvider` type is missing `dateCreated` field.

### 3. Auth: `POST /auth/xades-signature` — parameter passing

- **File:** `src/services/auth.ts`
- `verifyCertificateChain` must be a **query parameter**, not a header (`X-KSeF-CertificateChainVerification`).
- `enforceXadesCompliance` header (`X-KSeF-Feature`) is not in the OpenAPI spec at all.

---

## HIGH — wrong type structures

### 4. Certificates — 5 of 7 endpoints MISMATCH

**File:** `src/models/certificates/types.ts`, `src/services/certificates.ts`

| Endpoint | Problem |
|---|---|
| `GET /certificates/limits` | Flat `{limit, used, available}` instead of `{canRequest, enrollment: {limit, remaining}, certificate: {limit, remaining}}` |
| `GET /certificates/enrollments/data` | `enrollmentData: string` instead of structured object with X.500 fields (`commonName`, `countryName`, `givenName`, `surname`, `serialNumber`, `uniqueIdentifier`, `organizationName`, `organizationIdentifier`) |
| `POST /certificates/enrollments` | Field `csr` named `certificateData`; missing `certificateName`, `validFrom`; response missing `timestamp` |
| `POST /certificates/retrieve` | Request type is a query/filter model instead of `{certificateSerialNumbers: string[]}` (1-10 items) |
| `POST /certificates/query` | Missing all query filters (`certificateSerialNumber`, `name`, `type`, `status`, `expiresAfter`); response field `metadata` should be `certificates` |

### 5. Invoices: `GET /invoices/exports/{ref}` — completely wrong response

**File:** `src/models/invoices/types.ts`

- Current: `{processingCode, processingDescription, packages[]}`
- Spec: `{status: StatusInfo, completedDate?, packageExpirationDate?, package: InvoicePackage}`
- `InvoicePackage` is an object (not array) with fields: `invoiceCount`, `size`, `parts[]` (each with `ordinalNumber`, `partName`, `method`, `url`, `partSize`, `partHash`, `encryptedPartSize`, `encryptedPartHash`, `expirationDate`), `isTruncated`, `lastIssueDate?`, `lastInvoicingDate?`, `lastPermanentStorageDate?`, `permanentStorageHwmDate?`

### 6. Invoices: `POST /invoices/exports` — request field name

**File:** `src/models/invoices/types.ts`

- TypeScript: `encryptionInfo`
- Spec: `encryption`

### 7. Limits — wrong response structures

**File:** `src/models/limits/types.ts`

| Endpoint | Problem |
|---|---|
| `GET /limits/context` | `{maxInvoicesPerSession, maxSessionDurationMinutes}` instead of `{onlineSession: {maxInvoiceSizeInMB, maxInvoiceWithAttachmentSizeInMB, maxInvoices}, batchSession: {...}}` |
| `GET /limits/subject` | Flat `{limit, used, available}` instead of `{enrollment: {maxEnrollments}, certificate: {maxCertificates}}` |
| `GET /rate-limits` | Values use `{maxCallsPerInterval, intervalMs}` instead of `{perSecond, perMinute, perHour}` |

### 8. Tokens — incomplete types

**File:** `src/models/tokens/types.ts`

- `QueryKsefTokensResponse` missing `continuationToken` field.
- `KsefTokenStatus` enum: has `Active|Revoked|Expired`, spec requires `Pending|Active|Revoking|Revoked|Failed`.
- `AuthenticationKsefToken` missing `authorIdentifier`, `contextIdentifier` complex objects; uses `permissions` instead of `requestedPermissions`.

### 9. Permissions — 15 of 19 endpoints MISMATCH

**File:** `src/models/permissions/types.ts`, `src/services/permissions.ts`

**Grant endpoints (all 7):**
- All missing required fields `description` and `subjectDetails`.
- `POST /permissions/eu-entities/administration/grants`: completely wrong type — reuses regular EU entity type instead of separate admin type with `Fingerprint` identifier, `contextIdentifier` (NipVatUe), `euEntityName`, `euEntityDetails`.

**Query endpoints:**
- `GET /permissions/query/entities/roles`: implemented as **POST**, spec requires **GET**.
- `POST /permissions/query/persons/grants`: missing required `queryType` field.
- `POST /permissions/query/authorizations/grants`: missing required `queryType` field.
- `POST /permissions/query/personal/grants`: missing filter fields (`contextIdentifier`, `permissionTypes`, `permissionState`).
- `POST /permissions/query/subunits/grants`: uses `subunitCode: string` instead of `subunitIdentifier: {type, value}`.
- `POST /permissions/query/eu-entities/grants`: uses `identifier` instead of `vatUeIdentifier`, `authorizedFingerprintIdentifier`, `permissionTypes`.

---

## MEDIUM — minor mismatches

### 10. Auth: `POST /auth/challenge` — missing response field

**File:** `src/models/auth/types.ts`

- `AuthChallengeResponse` missing `clientIp` field (required by spec).

### 11. Auth: `GET /auth/{ref}` — missing deprecated field

**File:** `src/models/auth/types.ts`

- `AuthStatus` missing `authenticationMethod` field (deprecated but required in spec).

### 12. Active Sessions: `GET /auth/sessions` — missing deprecated field

**File:** `src/models/auth/types.ts` (or `active-sessions-types.ts`)

- `AuthSessionInfo` missing `authenticationMethod` field (deprecated but required in spec).

### 13. Sessions: `SessionInvoice` — required fields marked optional

**File:** `src/models/sessions/status-types.ts`

- `referenceNumber` and `invoiceHash` marked as optional (`?`), but spec marks them required.

### 14. Sessions: UPO endpoints — missing response header

**File:** `src/services/session-status.ts`

- `getInvoiceUpoByKsefNumber()`, `getInvoiceUpoByReference()`, `getSessionUpo()` do not extract `x-ms-meta-hash` response header (SHA-256 hash of UPO).

### 15. TestData: request types use wrapper objects

**File:** `src/models/test-data/types.ts`

- `SubjectCreateRequest` uses `contextIdentifier` wrapper instead of flat fields (`subjectNip`, `subjectType`, `description`).
- `PersonCreateRequest` uses `contextIdentifier` + `personIdentifier` instead of flat fields (`nip`, `pesel`, `isBailiff`, `description`, `isDeceased`).

### 16. Sessions: type naming inconsistencies

**File:** `src/models/sessions/status-types.ts`

- `SessionsListResponse` should be `SessionsQueryResponse`.
- `Session` item type should be `SessionsQueryResponseItem`.
- `SessionInvoice` should be `SessionInvoiceStatusResponse`.

### 17. Auth: type naming inconsistencies

**File:** `src/models/auth/types.ts`

- `AuthOperationStatusResponse` (for token redeem) should be `AuthenticationTokensResponse`.
- `AuthStatus` should be `AuthenticationOperationStatusResponse`.
- `SignatureResponse` should be `AuthenticationInitResponse`.

---

## Files to fix (by priority)

| File | Priority | Issues |
|---|---|---|
| `src/http/routes.ts` | CRITICAL | Add parameterized ActiveSessions route |
| `src/services/peppol.ts` | CRITICAL | POST -> GET |
| `src/services/active-sessions.ts` | CRITICAL | Use path param instead of body |
| `src/services/auth.ts` | HIGH | Query param for verifyCertificateChain |
| `src/models/certificates/types.ts` | HIGH | 5 type rebuilds |
| `src/services/certificates.ts` | HIGH | Method signatures |
| `src/models/invoices/types.ts` | HIGH | Export status type rebuild, field rename |
| `src/models/limits/types.ts` | HIGH | 3 type rebuilds |
| `src/models/tokens/types.ts` | HIGH | Enum + missing fields |
| `src/models/permissions/types.ts` | HIGH | Grant request fields, query filters |
| `src/services/permissions.ts` | HIGH | GET vs POST for entities/roles |
| `src/models/auth/types.ts` | MEDIUM | clientIp, authMethod fields |
| `src/models/test-data/types.ts` | MEDIUM | Flat fields instead of wrappers |
| `src/models/peppol/types.ts` | MEDIUM | Add dateCreated |
| `src/models/sessions/status-types.ts` | MEDIUM | Required field optionality, naming |
| `src/services/session-status.ts` | MEDIUM | Extract x-ms-meta-hash header |
