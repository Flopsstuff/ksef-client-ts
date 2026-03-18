# KSeF Client TS — Testing Plan

## Overview

Current state: 19 unit tests (QR) + 2 e2e tests (cert-auth). Target: comprehensive coverage across all modules.

Tests live in `tests/` with vitest (globals enabled). Run with `yarn test`.

```
tests/
├── unit/
│   ├── validation/          # Pure regex/function tests
│   ├── errors/              # Error classes & factories
│   ├── config/              # Environment URLs, option resolver
│   ├── http/                # RestClient, RestRequest, RouteBuilder
│   ├── builders/            # Fluent builder validation
│   ├── crypto/              # AES, RSA, XAdES, certificates
│   ├── services/            # All 13 services (mocked RestClient)
│   └── qr/                  # (already done — 19 tests)
└── e2e/
    └── cert-auth.test.ts    # (already done — 2 tests)
```

---

## Unit Tests

### 1. Validation (`tests/unit/validation/`)

**File:** `patterns.test.ts`
**Complexity:** Simple | **Mocking:** None

| Test | What to verify |
|------|----------------|
| NIP pattern | Valid 10-digit NIPs, invalid lengths, letters, checksums |
| PESEL pattern | Valid 11-digit PESELs, invalid formats |
| VatUe pattern | All EU country prefixes (PL, DE, FR, etc.), invalid prefixes |
| NipVatUe pattern | Combined format validation |
| InternalId pattern | 10+5 digit format |
| PeppolId pattern | P + 2 letters + 6 digits |
| ReferenceNumber | 16-hex KSeF reference format |
| KsefNumber | NIP-date-hex format (v35 and v36 variants) |
| CertificateName | Polish diacritics allowed, special chars rejected |
| CertificateFingerprint | Exactly 64 hex chars |
| Base64String | Valid/invalid base64 |
| IPv4 patterns | Address, range, mask formats |

**File:** `validators.test.ts`
**Complexity:** Simple | **Mocking:** None

All `isValid*()` functions: true for valid input, false for invalid, false for empty/null.

**Estimate:** ~50 tests

---

### 2. Errors (`tests/unit/errors/`)

**File:** `ksef-api-error.test.ts`
**Complexity:** Simple | **Mocking:** None

| Test | What to verify |
|------|----------------|
| Constructor | Sets statusCode, errorResponse, message |
| `fromResponse()` with error body | Extracts exceptionDetailList descriptions |
| `fromResponse()` without body | Falls back to generic message |
| `fromResponse()` with empty details | Handles gracefully |
| instanceof Error | Proper prototype chain |

**File:** `ksef-rate-limit-error.test.ts`
**Complexity:** Simple | **Mocking:** None

| Test | What to verify |
|------|----------------|
| `fromRetryAfterHeader()` numeric | Parses "60" → retryAfterSeconds=60 |
| `fromRetryAfterHeader()` HTTP-date | Parses date string → retryAfterDate |
| `fromRetryAfterHeader()` missing header | No retry info, still valid error |
| `recommendedDelay` getter | Computed from seconds or date |
| extends KSeFApiError | Proper inheritance |

**Estimate:** ~12 tests

---

### 3. Config (`tests/unit/config/`)

**File:** `environments.test.ts`
**Complexity:** Simple | **Mocking:** None

| Test | What to verify |
|------|----------------|
| TEST env URLs | api-test, qr-test, latarnia-test domains |
| DEMO env URLs | api-demo, qr-demo, latarnia-demo domains |
| PRD env URLs | api (no suffix), qr, latarnia domains |
| All use HTTPS | No HTTP URLs |

**File:** `options.test.ts`
**Complexity:** Simple | **Mocking:** None

| Test | What to verify |
|------|----------------|
| `resolveOptions()` no args | Defaults to TEST, v2, 30s timeout |
| `resolveOptions({ environment: 'PRD' })` | Uses PRD URLs |
| Custom baseUrl overrides env | baseUrl takes precedence |
| Custom timeout | Overrides default |
| Custom headers | Merged into result |
| apiVersion override | Changes version prefix |

**Estimate:** ~12 tests

---

### 4. HTTP Layer (`tests/unit/http/`)

**File:** `rest-request.test.ts`
**Complexity:** Simple | **Mocking:** None

| Test | What to verify |
|------|----------------|
| `RestRequest.get(path)` | Method=GET, path set |
| `RestRequest.post(path)` | Method=POST |
| `RestRequest.put(path)` | Method=PUT |
| `RestRequest.delete(path)` | Method=DELETE |
| `.body(data)` | Stores body, returns self |
| `.header(k, v)` | Adds header |
| `.headers(obj)` | Merges headers |
| `.accessToken(token)` | Sets Authorization: Bearer |
| `.query(k, v)` | Adds query param |
| `.query()` skips undefined values | No param added |
| Fluent chaining | All methods return `this` |

**File:** `route-builder.test.ts`
**Complexity:** Simple | **Mocking:** None

| Test | What to verify |
|------|----------------|
| `build("auth/challenge")` | Returns `/v2/auth/challenge` |
| Custom version `v3` | Returns `/v3/...` |
| Version override per-call | Per-call takes precedence |

**File:** `rest-client.test.ts`
**Complexity:** Medium | **Mocking:** `global.fetch`

| Test | What to verify |
|------|----------------|
| `execute()` success | Calls fetch, parses JSON, returns body+headers |
| `execute()` with access token | Authorization header present |
| `execute()` with custom headers | Merged into request |
| `execute()` with query params | Appended to URL |
| `execute()` POST with body | JSON.stringify in fetch body |
| `executeRaw()` | Returns ArrayBuffer, no JSON parsing |
| Error 400 | Throws KSeFApiError with parsed body |
| Error 404 | Throws KSeFApiError |
| Error 429 | Throws KSeFRateLimitError with Retry-After |
| Error 500 | Throws KSeFApiError |
| Timeout | AbortSignal fires, throws error |
| Non-JSON error body | Still throws KSeFApiError |

**File:** `routes.test.ts`
**Complexity:** Simple | **Mocking:** None

| Test | What to verify |
|------|----------------|
| Static routes are strings | `Routes.Auth.challenge === "auth/challenge"` |
| Dynamic routes are functions | `Routes.Auth.status("ref123")` returns `"auth/ref123"` |
| All route groups exist | Auth, Sessions, Invoices, Permissions, etc. |

**Estimate:** ~35 tests

---

### 5. Builders (`tests/unit/builders/`)

**File:** `auth-token-request.test.ts`
**Complexity:** Simple | **Mocking:** None

| Test | What to verify |
|------|----------------|
| Full valid build (NIP) | Returns correct AuthTokenRequest |
| Full valid build (InternalId) | Different context type |
| `.withContextNipVatUe()` | Sets NipVatUe context |
| `.withContextPeppolId()` | Sets Peppol context |
| `.withAuthorizationPolicy()` | Optional IP restrictions |
| `build()` without challenge | Throws |
| `build()` without context | Throws |
| `build()` without subjectType | Throws |

**File:** `auth-ksef-token-request.test.ts`
**Complexity:** Simple | **Mocking:** None

| Test | What to verify |
|------|----------------|
| Full valid build | Returns correct object |
| `build()` without encryptedToken | Throws |
| `build()` without challenge | Throws |

**File:** `invoice-query-filter.test.ts`
**Complexity:** Simple | **Mocking:** None

| Test | What to verify |
|------|----------------|
| Minimal build (subjectType + dateRange) | Valid filter |
| All optional filters | ksef number, amount, seller, buyer, currency, etc. |
| `build()` without subjectType | Throws |
| `build()` without dateRange | Throws |
| Date range types | PermanentStorage, InvoicingDate |

**File:** `permission-builders.test.ts`
**Complexity:** Simple | **Mocking:** None

| Test | What to verify |
|------|----------------|
| PersonPermissionGrantBuilder valid | Full build |
| PersonPermissionGrantBuilder missing identifier | Throws |
| PersonPermissionGrantBuilder no permissions | Throws |
| EntityPermissionGrantBuilder valid | Full build |
| EntityPermissionGrantBuilder missing NIP | Throws |
| AuthorizationPermissionGrantBuilder valid | Full build |
| AuthorizationPermissionGrantBuilder missing fields | Throws |

**Estimate:** ~25 tests

---

### 6. Crypto (`tests/unit/crypto/`)

**File:** `cryptography-service.test.ts`
**Complexity:** Complex | **Mocking:** CertificateFetcher (stub PEM certs)

| Test | What to verify |
|------|----------------|
| AES-256-CBC encrypt → decrypt roundtrip | Original data restored |
| AES-256-CBC with known vectors | Deterministic output with fixed key/IV |
| `getEncryptionData()` | Returns key, iv, encryptedKey (RSA-OAEP wrapped) |
| `getFileMetadata()` | Correct SHA-256 hash and byte size |
| `encryptKsefToken()` RSA cert | RSA-OAEP encrypted output |
| `parsePrivateKey()` RSA PEM | Returns KeyObject |
| `parsePrivateKey()` ECDSA PEM | Returns KeyObject |
| `parsePrivateKey()` invalid PEM | Throws |
| `generateCsrRsa()` | Valid Base64 DER CSR output |
| `generateCsrEcdsa()` | Valid Base64 DER CSR output |

**File:** `signature-service.test.ts`
**Complexity:** Complex | **Mocking:** None (uses real crypto)

| Test | What to verify |
|------|----------------|
| `sign()` RSA produces valid XML | Contains ds:Signature, ds:SignatureValue |
| `sign()` ECDSA produces valid XML | Correct algorithm URI |
| Signed XML contains X509Certificate | Base64 cert embedded |
| Signed XML contains SignedProperties | XAdES qualifying properties |
| Signed XML contains two References | Root document + SignedProperties |
| `sign()` with invalid cert | Throws |
| `sign()` with mismatched key | Throws |

**File:** `certificate-service.test.ts`
**Complexity:** Medium | **Mocking:** None (uses real webcrypto)

| Test | What to verify |
|------|----------------|
| `generatePersonalCertificate()` RSA | Valid PEM cert + key, correct CN/SN |
| `generatePersonalCertificate()` ECDSA | Valid PEM cert + key |
| `generateCompanySeal()` RSA | Valid PEM cert + key, correct O/OID |
| `getSha256Fingerprint()` | Correct 64-char hex hash |
| `getSha256Fingerprint()` uppercase | Consistent case |
| Generated cert validity | 1 year from now |

**File:** `certificate-fetcher.test.ts`
**Complexity:** Medium | **Mocking:** RestClient

| Test | What to verify |
|------|----------------|
| `init()` fetches and caches certs | RestClient called once |
| `init()` idempotent | Second call doesn't re-fetch |
| `refresh()` clears cache and re-fetches | RestClient called again |
| `getSymmetricKeyEncryptionPem()` before init | Throws |
| `getKsefTokenEncryptionPem()` before init | Throws |
| After init, PEMs are valid | Start with BEGIN CERTIFICATE |

**Estimate:** ~30 tests

---

### 7. Services (`tests/unit/services/`)

All services follow the same pattern: construct with RestClient, call methods that delegate to `restClient.execute()`. Mock RestClient to verify correct request construction.

**Strategy:** One test file per service. Mock `RestClient.execute` / `executeRaw` to verify:
- Correct HTTP method (GET/POST/PUT/DELETE)
- Correct route path
- Correct headers (access token, content-type, custom)
- Correct body payload
- Correct query params (pagination, filters)
- Return value mapping

**Files:**

| File | Service | Methods | Key scenarios |
|------|---------|---------|---------------|
| `auth.test.ts` | AuthService | 6 | Challenge GET, XAdES POST, token POST, status GET, redeem POST, refresh POST |
| `active-sessions.test.ts` | ActiveSessionsService | 3 | List with pagination, revoke current (DELETE), revoke by ref |
| `online-session.test.ts` | OnlineSessionService | 3 | Open (POST), send invoice (PUT), close (DELETE) |
| `batch-session.test.ts` | BatchSessionService | 3 | Open, send parts (parallel uploads), close |
| `session-status.test.ts` | SessionStatusService | 7 | Query with filters, status, invoice list, failed invoices, UPO retrieval (raw binary) |
| `invoice-download.test.ts` | InvoiceDownloadService | 4 | Get XML (raw), query with filters, export, export status |
| `permissions.test.ts` | PermissionsService | 14+ | Grant types, revoke, query with pagination |
| `token.test.ts` | TokenService | 4 | Generate, query, get, revoke |
| `certificate-api.test.ts` | CertificateApiService | 7 | Limits, enrollment, status, retrieve, revoke, query |
| `limits.test.ts` | LimitsService | 3 | Context, subject, rate limits |
| `peppol.test.ts` | PeppolService | 1 | Query with pagination |
| `lighthouse.test.ts` | LighthouseService | 2 | Status, messages (uses raw fetch, not RestClient) |
| `test-data.test.ts` | TestDataService | 18 | All CRUD operations |

**Estimate:** ~80 tests

---

### 8. KSeFClient (`tests/unit/client.test.ts`)

**Complexity:** Medium | **Mocking:** AuthService, CryptographyService, SignatureService

Existing tests verify construction and service wiring. Missing: login/logout flows that were added by auth-manager-wiring.

| Test | What to verify |
|------|----------------|
| `loginWithToken` happy path | Calls `auth.getChallenge()`, `crypto.init()`, `crypto.encryptKsefToken()`, `auth.submitKsefTokenAuthRequest()` with correct NIP/challenge/encryptedToken, `auth.getAccessToken()` with operation token. After completion: `authManager.getAccessToken()` and `getRefreshToken()` return stored tokens |
| `loginWithToken` propagates challenge error | `auth.getChallenge()` rejects → `loginWithToken` rejects, authManager stays empty |
| `loginWithCertificate` happy path | Calls `auth.getChallenge()`, dynamically imports `SignatureService`, calls `SignatureService.sign()` with AuthTokenRequest XML (not raw challenge), `auth.submitXadesAuthRequest()` with signed XML, `auth.getAccessToken()`. Tokens stored in authManager |
| `loginWithCertificate` builds correct XML | Signed XML contains `<AuthTokenRequest>` with `<Challenge>`, `<ContextIdentifier><Nip>`, `<SubjectIdentifierType>certificateSubject</SubjectIdentifierType>` |
| `logout` clears tokens | Set tokens via authManager, call `logout()`, verify both `getAccessToken()` and `getRefreshToken()` return `undefined` |
| `authManager` wired on construction | `client.authManager` is defined, `getAccessToken()` returns `undefined` initially |
| Custom `authManager` via options | Pass custom AuthManager in options, verify `client.authManager` is the provided instance |

**Estimate:** ~7 tests

---

## E2E Tests

**Existing:** `tests/e2e/cert-auth.test.ts` (2 tests)

E2e tests run against KSeF TEST environment. They require network access and are slower (up to 60s timeout). Keep them separate from unit tests.

**Future candidates** (not in scope of Phase 6.2):
- Token auth flow (login → query → logout)
- Invoice send + download roundtrip
- Online session lifecycle (open → send → close → UPO)

---

## Summary

| Category | Files | Est. Tests | Priority |
|----------|-------|------------|----------|
| Validation | 2 | ~50 | High (pure, easy) |
| Errors | 2 | ~12 | High (pure, easy) |
| Config | 2 | ~12 | High (pure, easy) |
| HTTP | 4 | ~35 | High (core infra) |
| Builders | 4 | ~25 | Medium |
| Crypto | 4 | ~30 | Medium (complex) |
| Services | 13 | ~80 | Low (boilerplate) |
| KSeFClient | 1 | ~7 | High (login/logout) |
| **Total** | **32** | **~251** | |

### Recommended order

1. **Validation + Errors + Config** — pure functions, no mocking, fast to write
2. **HTTP layer** — core infrastructure, needs fetch mock
3. **Builders** — pure validation logic
4. **Crypto** — complex but critical, real crypto (no mocks except CertificateFetcher)
5. **KSeFClient** — login/logout flows, mocked services
6. **Services** — highest volume, repetitive pattern (mocked RestClient)
