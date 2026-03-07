# API Conformance Report: Implementation vs OpenAPI Specification

Comparison of the current TypeScript client implementation against the official KSeF API v2 OpenAPI specification (`ref/ksef-docs/open-api.json`).

**Date:** 2026-03-07

## Summary

| Metric | Count |
|--------|-------|
| OpenAPI spec paths | 73 |
| OpenAPI spec operations (incl. multi-method paths) | ~82 |
| Implemented operations | ~72 |
| HTTP method mismatches | **8** |
| Missing endpoints | **1** |
| Missing query filters | **1** |

---

## P0 — HTTP Method Mismatches (Breaks Real API Calls)

These endpoints use wrong HTTP methods and will fail against the actual KSeF API.

### 1. `GET /auth/sessions` — Active Sessions List

- **OpenAPI:** `GET` with query params (`pageSize`) and `x-continuation-token` header
- **Implementation:** `POST` with JSON body
- **File:** `src/services/active-sessions.ts:18` (`ActiveSessionsService.getActiveSessions`)
- **Route:** `Routes.ActiveSessions.session` → `auth/sessions`

**Fix:** Change `RestRequest.post()` → `RestRequest.get()`, move `pageSize` to query param, `continuationToken` to `x-continuation-token` header.

### 2. `GET /sessions` — Sessions List (Status & UPO)

- **OpenAPI:** `GET` with query params:
  - `sessionType` (required) — `Online` | `Batch`
  - `pageSize` (10–1000, default 10)
  - `continuationToken` (header: `x-continuation-token`)
  - `referenceNumber`
  - `dateCreatedFrom`, `dateCreatedTo`
  - `dateClosedFrom`, `dateClosedTo`
  - `dateModifiedFrom`, `dateModifiedTo`
  - `sessionStatus` (array)
- **Implementation:** `POST` with JSON body `{ type, pageSize, continuationToken, filter }`
- **File:** `src/services/session-status.ts:14–30` (`SessionStatusService.getSessions`)
- **Route:** `Routes.Sessions.root` → `sessions`

**Fix:** Change to `GET`, move all params to query string / headers. Refactor `SessionsFilter` type to match spec query params. The `continuationToken` goes into `x-continuation-token` header.

### 3. `POST /certificates/{serial}/revoke` — Revoke Certificate

- **OpenAPI:** `POST` (line 790 in open-api.json)
- **Implementation:** `DELETE`
- **File:** `src/services/certificates.ts:61–66` (`CertificateApiService.revoke`)

**Fix:** Change `RestRequest.delete()` → `RestRequest.post()`.

---

## P1 — TestData HTTP Method Mismatches

All "remove/revoke/unblock" testdata endpoints use `POST` in the spec, but `DELETE` in the implementation. These only affect test environments but should still be corrected.

| Endpoint | OpenAPI | Implementation | File | Line |
|----------|---------|----------------|------|------|
| `/testdata/subject/remove` | POST | DELETE | `src/services/test-data.ts` | 37 |
| `/testdata/person/remove` | POST | DELETE | `src/services/test-data.ts` | 50 |
| `/testdata/permissions/revoke` | POST | DELETE | `src/services/test-data.ts` | 64 |
| `/testdata/attachment/revoke` | POST | DELETE | `src/services/test-data.ts` | 79 |
| `/testdata/context/unblock` | POST | DELETE | `src/services/test-data.ts` | 161 |

**Fix for all:** Change `RestRequest.delete()` → `RestRequest.post()`.

Note: The following testdata endpoints correctly use `DELETE` per the spec:
- `DELETE /testdata/limits/context/session` (restore defaults)
- `DELETE /testdata/limits/subject/certificate` (restore defaults)
- `DELETE /testdata/rate-limits` (restore defaults)
- `DELETE /testdata/rate-limits/production` (restore defaults)

---

## P2 — Missing Endpoint

### `POST /permissions/query/entities/grants`

- **OpenAPI:** line 7845 — searches granted permissions for entities
- **Implementation:** Missing from both `Routes` and `PermissionsService`
- **Note:** `POST /permissions/query/entities/roles` (line 7999) IS implemented as `queryEntitiesRoles()`. These are **two different endpoints**.

**Fix:**
1. Add route: `Routes.Permissions.Query.entitiesGrants = 'permissions/query/entities/grants'`
2. Add method: `PermissionsService.queryEntitiesGrants()`
3. Add corresponding request/response types

---

## P2 — Missing Query Filters

### `GET /tokens` — Token List Filtering

- **OpenAPI** supports these query params for filtering:
  - `status` (array) — `Pending` | `Active` | `Revoking` | `Revoked` | `Failed`
  - `description` (string, min 3 chars) — search by description
  - `authorIdentifier` (string, min 3 chars) — search by author
  - `authorIdentifierType` — filter by author identifier type
  - `permissions` (array) — filter by token permissions
  - `pageSize`, `pageOffset` — pagination
- **Implementation:** Only supports `pageOffset` and `pageSize`
- **File:** `src/services/tokens.ts:21–31` (`TokenService.queryTokens`)

**Fix:** Extend the `options` parameter to include all filter fields from the spec.

---

## Confirmed Correct — Full List

All endpoints below match the OpenAPI spec in both path and HTTP method.

### Authentication (6 endpoints)

| Method | Path | Service Method |
|--------|------|----------------|
| POST | `/auth/challenge` | `AuthService.getChallenge()` |
| POST | `/auth/xades-signature` | `AuthService.submitXadesAuthRequest()` |
| POST | `/auth/ksef-token` | `AuthService.submitKsefTokenAuthRequest()` |
| GET | `/auth/{ref}` | `AuthService.getAuthStatus()` |
| POST | `/auth/token/redeem` | `AuthService.getAccessToken()` |
| POST | `/auth/token/refresh` | `AuthService.refreshAccessToken()` |

### Active Sessions (2 of 3 — see P0 #1 above)

| Method | Path | Service Method |
|--------|------|----------------|
| DELETE | `/auth/sessions/current` | `ActiveSessionsService.revokeCurrentSession()` |
| DELETE | `/auth/sessions/{ref}` | `ActiveSessionsService.revokeSession()` |

### Online Session (3 endpoints)

| Method | Path | Service Method |
|--------|------|----------------|
| POST | `/sessions/online` | `OnlineSessionService.openSession()` |
| POST | `/sessions/online/{ref}/invoices` | `OnlineSessionService.sendInvoice()` |
| POST | `/sessions/online/{ref}/close` | `OnlineSessionService.closeSession()` |

### Batch Session (2 endpoints)

| Method | Path | Service Method |
|--------|------|----------------|
| POST | `/sessions/batch` | `BatchSessionService.openSession()` |
| POST | `/sessions/batch/{ref}/close` | `BatchSessionService.closeSession()` |

### Session Status (8 endpoints)

| Method | Path | Service Method |
|--------|------|----------------|
| GET | `/sessions/{ref}` | `SessionStatusService.getSessionStatus()` |
| GET | `/sessions/{ref}/invoices` | `SessionStatusService.getSessionInvoices()` |
| GET | `/sessions/{ref}/invoices/{invoiceRef}` | `SessionStatusService.getSessionInvoice()` |
| GET | `/sessions/{ref}/invoices/failed` | `SessionStatusService.getSessionFailedInvoices()` |
| GET | `/sessions/{ref}/invoices/ksef/{ksefNumber}/upo` | `SessionStatusService.getInvoiceUpoByKsefNumber()` |
| GET | `/sessions/{ref}/invoices/{invoiceRef}/upo` | `SessionStatusService.getInvoiceUpoByReference()` |
| GET | `/sessions/{ref}/upo/{upoRef}` | `SessionStatusService.getSessionUpo()` |

### Invoices (4 endpoints)

| Method | Path | Service Method |
|--------|------|----------------|
| GET | `/invoices/ksef/{ksefNumber}` | `InvoiceDownloadService.getInvoice()` |
| POST | `/invoices/query/metadata` | `InvoiceDownloadService.queryInvoiceMetadata()` |
| POST | `/invoices/exports` | `InvoiceDownloadService.exportInvoices()` |
| GET | `/invoices/exports/{ref}` | `InvoiceDownloadService.getInvoiceExportStatus()` |

### Permissions (16 of 17 — see P2 missing endpoint above)

| Method | Path | Service Method |
|--------|------|----------------|
| POST | `/permissions/persons/grants` | `grantPersonPermissions()` |
| POST | `/permissions/entities/grants` | `grantEntityPermissions()` |
| POST | `/permissions/authorizations/grants` | `grantAuthorizationPermissions()` |
| POST | `/permissions/indirect/grants` | `grantIndirectPermissions()` |
| POST | `/permissions/subunits/grants` | `grantSubunitPermissions()` |
| POST | `/permissions/eu-entities/administration/grants` | `grantEuEntityPermissions()` |
| POST | `/permissions/eu-entities/grants` | `grantEuEntityRepresentativePermissions()` |
| DELETE | `/permissions/common/grants/{id}` | `revokeCommonGrant()` |
| DELETE | `/permissions/authorizations/grants/{id}` | `revokeAuthorizationGrant()` |
| POST | `/permissions/query/personal/grants` | `queryPersonalGrants()` |
| POST | `/permissions/query/persons/grants` | `queryPersonsGrants()` |
| POST | `/permissions/query/subunits/grants` | `querySubunitsGrants()` |
| POST | `/permissions/query/entities/roles` | `queryEntitiesRoles()` |
| POST | `/permissions/query/subordinate-entities/roles` | `querySubordinateEntitiesRoles()` |
| POST | `/permissions/query/authorizations/grants` | `queryAuthorizationsGrants()` |
| POST | `/permissions/query/eu-entities/grants` | `queryEuEntitiesGrants()` |
| GET | `/permissions/operations/{ref}` | `getOperationStatus()` |
| GET | `/permissions/attachments/status` | `getAttachmentStatus()` |

### Certificates (6 of 7 — see P0 #3 above)

| Method | Path | Service Method |
|--------|------|----------------|
| GET | `/certificates/limits` | `getLimits()` |
| GET | `/certificates/enrollments/data` | `getEnrollmentData()` |
| POST | `/certificates/enrollments` | `enroll()` |
| GET | `/certificates/enrollments/{ref}` | `getEnrollmentStatus()` |
| POST | `/certificates/retrieve` | `retrieve()` |
| POST | `/certificates/query` | `query()` |

### Tokens (4 endpoints)

| Method | Path | Service Method |
|--------|------|----------------|
| POST | `/tokens` | `generateToken()` |
| GET | `/tokens` | `queryTokens()` (missing filters — see P2) |
| GET | `/tokens/{ref}` | `getToken()` |
| DELETE | `/tokens/{ref}` | `revokeToken()` |

### Limits (3 endpoints)

| Method | Path | Service Method |
|--------|------|----------------|
| GET | `/limits/context` | `getContextLimits()` |
| GET | `/limits/subject` | `getSubjectLimits()` |
| GET | `/rate-limits` | `getRateLimits()` |

### Peppol (1 endpoint)

| Method | Path | Service Method |
|--------|------|----------------|
| POST | `/peppol/query` | `queryProviders()` |

### Security (1 endpoint)

| Method | Path | Service Method |
|--------|------|----------------|
| GET | `/security/public-key-certificates` | `CryptographyService.init()` |

### TestData — Correct Endpoints (9 of 14)

| Method | Path | Service Method |
|--------|------|----------------|
| POST | `/testdata/subject` | `createSubject()` |
| POST | `/testdata/person` | `createPerson()` |
| POST | `/testdata/permissions` | `grantPermissions()` |
| POST | `/testdata/attachment` | `enableAttachment()` |
| POST | `/testdata/context/block` | `blockContext()` |
| POST | `/testdata/limits/context/session` | `changeSessionLimits()` |
| DELETE | `/testdata/limits/context/session` | `restoreDefaultSessionLimits()` |
| POST | `/testdata/limits/subject/certificate` | `changeCertificatesLimit()` |
| DELETE | `/testdata/limits/subject/certificate` | `restoreDefaultCertificatesLimit()` |
| POST | `/testdata/rate-limits` | `setRateLimits()` |
| DELETE | `/testdata/rate-limits` | `restoreDefaultRateLimits()` |
| POST | `/testdata/rate-limits/production` | `setProductionRateLimits()` |
| DELETE | `/testdata/rate-limits/production` | `restoreDefaultProductionRateLimits()` |

---

## Out-of-Scope (Not in OpenAPI, Correctly Additional)

| Service | Description | Notes |
|---------|-------------|-------|
| `LighthouseService` | `GET /lighthouse/status`, `GET /lighthouse/messages` | Separate system, uses raw `fetch()` to `options.lighthouseUrl` |
| `VerificationLinkService` | QR Code I & II URL generation | Local operation, no HTTP calls |
| `QrCodeService` | PNG/Base64/SVG QR code rendering | Local operation, no HTTP calls |
| `CryptographyService` | AES/RSA/ECDH encryption, CSR generation | Local crypto, except `init()` which calls `/security/public-key-certificates` |
| `SignatureService` | XAdES-B XML signatures | Local operation |
| `CertificateService` | Self-signed certificate generation | Local operation |
