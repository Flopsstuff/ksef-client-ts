# Architecture

Internal architecture of `ksef-client-ts`. Intended for contributors and anyone who wants to understand how the library is structured.

---

## Layered Design

```
KSeFClient (src/client.ts)
  │
  ├── 14 service properties ──→ Services (src/services/*.ts)
  │                                 └── RestRequest + Routes → RestClient.execute<T>()
  │
  ├── crypto ──→ CryptographyService (src/crypto/)
  │                  └── CertificateFetcher → RestClient (fetches KSeF public certs)
  │
  ├── qr ──→ VerificationLinkService (src/qr/)
  │
  ├── authManager ──→ AuthManager (src/http/auth-manager.ts)
  │
  └── loginWithToken() / loginWithCertificate() / logout()
        └── orchestrates auth + crypto + token storage

RestClient (src/http/rest-client.ts)
  ├── RouteBuilder ──→ prepends /v2/ version prefix
  ├── TransportFn ──→ native fetch (or custom)
  ├── RetryPolicy ──→ exponential backoff, retryable status codes
  ├── RateLimitPolicy ──→ token bucket (global + per-endpoint)
  ├── PresignedUrlPolicy ──→ validates external URLs for batch uploads
  └── AuthManager ──→ injects Bearer token, handles 401 refresh
```

Data flows **top-down**: `KSeFClient` → `Service` → `RestClient` → `fetch`. Each layer has a single responsibility.

---

## Source Layout

```
src/
├── client.ts              # KSeFClient — main entry point, wires everything
├── index.ts               # Barrel re-exports for the public API
├── config/                # Environment configs (TEST/DEMO/PRD), options resolver
├── http/                  # HTTP transport layer (see below)
├── services/              # One service per API domain (14 total)
├── models/                # TypeScript types, organized by domain
│   ├── common.ts          # Shared types (TokenInfo, ContextIdentifier, etc.)
│   ├── auth/              # Auth challenge, tokens, methods
│   ├── sessions/          # Online, batch, status
│   ├── invoices/          # Invoice metadata, export, queries
│   ├── permissions/       # Grants, roles, queries
│   ├── tokens/            # KSeF token CRUD
│   ├── certificates/      # Enrollment, metadata
│   ├── lighthouse/        # System status
│   ├── limits/            # Rate, session, certificate limits
│   ├── peppol/            # Peppol providers
│   ├── crypto/            # Encryption data, CSR types
│   ├── qrcode/            # QR code options/result
│   └── test-data/         # Test environment management
├── builders/              # Fluent builders for complex request payloads
├── crypto/                # Cryptography layer (see below)
├── qr/                    # QR code + verification link generation
├── errors/                # Error hierarchy (see below)
├── validation/            # Regex patterns and constraints
└── cli/                   # CLI tool (commander-based)
```

---

## HTTP Layer (`src/http/`)

All API communication passes through `RestClient`. Services never call `fetch` directly (exception: `LighthouseService`, which uses its own raw fetch against a separate URL).

### Request Flow

```
Service method
  → RestRequest.post(Routes.Foo.bar).body(payload)
  → restClient.execute<T>(request)
      1. buildUrl(): RouteBuilder prepends /{apiVersion}/, appends query params
      2. presigned URL validation (if applicable)
      3. rate limit acquire (token bucket)
      4. retry loop (up to maxRetries):
         a. doRequest(): merge headers, inject auth token, call transport
         b. on 401 (first attempt): authManager.onUnauthorized() → retry with new token
         c. on retryable status (429/5xx): backoff + retry
         d. on network error: backoff + retry
      5. ensureSuccess(): dispatch errors by status code
  → RestResponse<T> { body, headers, statusCode }
```

### Key Components

| File | Purpose |
|------|---------|
| `rest-client.ts` | Core HTTP client — execute, retry, auth refresh, error dispatch |
| `rest-request.ts` | Fluent request builder (method, path, body, headers, query) |
| `rest-response.ts` | Response type: `{ body: T, headers, statusCode }` |
| `route-builder.ts` | Prepends `/{apiVersion}/` to route paths |
| `routes.ts` | All API endpoint paths as `const` object. Static routes are strings, parameterized routes are arrow functions |
| `transport.ts` | `TransportFn` type alias — `(url, init) => Promise<Response>`. Default is native `fetch` |
| `auth-manager.ts` | `AuthManager` interface + `DefaultAuthManager` impl with token storage and 401 refresh |
| `retry-policy.ts` | Exponential backoff with jitter, retryable status codes and network errors |
| `rate-limit-policy.ts` | Token bucket rate limiter (global + per-endpoint) |
| `presigned-url-policy.ts` | Validates pre-signed URLs for batch part uploads against allowed host patterns |

### Error Dispatch Order

`RestClient.ensureSuccess()` reads the response body once, then dispatches:

```
429 → KSeFRateLimitError (parses Retry-After header)
401 → KSeFUnauthorizedError (if body matches UnauthorizedProblemDetails)
403 → KSeFForbiddenError (if body matches ForbiddenProblemDetails)
 *  → KSeFApiError (generic, any non-2xx)
```

---

## Services (`src/services/`)

All 14 services follow the same pattern:

```typescript
export class FooService {
  private readonly restClient: RestClient;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async doSomething(arg: SomeRequest): Promise<SomeResponse> {
    const request = RestRequest.post(Routes.Foo.bar).body(arg);
    const response = await this.restClient.execute<SomeResponse>(request);
    return response.body;
  }
}
```

**Conventions:**
- Constructor takes `RestClient` (injected by `KSeFClient`)
- Methods build a `RestRequest` using `Routes` constants, call `execute<T>()` or `executeRaw()`, return `response.body`
- No business logic — pure API mapping
- Types imported from `src/models/{domain}/types.ts`

**Services list:** AuthService, ActiveSessionsService, OnlineSessionService, BatchSessionService, SessionStatusService, InvoiceDownloadService, PermissionsService, TokenService, CertificateApiService, LighthouseService, LimitsService, PeppolService, TestDataService (+ CryptographyService in crypto layer).

---

## Crypto Layer (`src/crypto/`)

Separate from services because it does not map 1:1 to API endpoints. Uses `node:crypto` and related libraries.

| File | Static? | Purpose |
|------|---------|---------|
| `cryptography-service.ts` | Instance | AES-256-CBC encrypt/decrypt, RSA-OAEP key wrapping, ECDH+AES-GCM token encryption, file hashing, CSR generation |
| `certificate-fetcher.ts` | Instance | Fetches and caches KSeF public certificates via RestClient |
| `signature-service.ts` | Static | XAdES-B enveloped XML signatures (RSA-SHA256 or ECDSA-SHA256) |
| `certificate-service.ts` | Static | Self-signed certificate generation (RSA-2048 / ECDSA P-256) |

**Initialization:** `CryptographyService` requires `init()` before encryption methods work. This fetches the KSeF public certificates. `init()` is NOT called automatically in the `KSeFClient` constructor — the user must call `client.crypto.init()` explicitly, or use `loginWithToken()` which calls it internally.

**Dynamic import:** `loginWithCertificate()` uses `await import('./crypto/signature-service.js')` so that `xml-crypto` and `@xmldom/xmldom` are only loaded when XAdES signing is actually needed.

---

## Models (`src/models/`)

TypeScript interfaces organized by API domain. No runtime code — types only.

```
models/
├── common.ts           # Shared: TokenInfo, ContextIdentifier, FormCode, etc.
├── auth/types.ts       # AuthChallengeResponse, AuthenticationInitResponse, ...
├── sessions/types.ts   # OpenOnlineSessionRequest, SessionStatusResponse, ...
├── invoices/types.ts   # InvoiceQueryFilters, InvoiceExportRequest, ...
└── ...                 # Each domain has types.ts + barrel index.ts
```

**Conventions:**
- Types derived from the OpenAPI spec (`docs/open-api.json`)
- Shared types live in `common.ts`, domain-specific types in `{domain}/types.ts`
- Barrel `index.ts` in each domain folder re-exports types

### Naming Collisions

Some types have suffixes to avoid ambiguity:

| Type | Why | Collision with |
|------|-----|----------------|
| `CertificateApiService` | "Api" suffix | `CertificateService` (crypto, self-signed certs) |
| `InvoiceFilterInvoicingMode` | Full prefix | `InvoicingMode` (session types) |
| `PermissionSubjectIdentifierType` | Full prefix | `SubjectIdentifierType` (auth types) |

---

## Error Hierarchy (`src/errors/`)

```
Error
  └── KSeFError                       # Base for all library errors
        ├── KSeFApiError              # HTTP API errors (non-2xx)
        │     └── KSeFRateLimitError  # 429 with Retry-After
        ├── KSeFUnauthorizedError     # 401 (ProblemDetails body)
        ├── KSeFForbiddenError        # 403 with reasonCode
        ├── KSeFAuthStatusError       # Auth operation failed/timed out
        ├── KSeFSessionExpiredError   # Stored session expired
        └── KSeFValidationError       # Client-side validation (builders)
```

All errors extend `KSeFError`, so `catch (e) { if (e instanceof KSeFError) ... }` catches everything from the library.

---

## Builders (`src/builders/`)

Fluent builder classes for complex request payloads. Each builder validates required fields in `build()` and throws `KSeFValidationError` on missing data.

- `AuthTokenRequestBuilder` — XAdES auth request
- `AuthKsefTokenRequestBuilder` — token auth request
- `InvoiceQueryFilterBuilder` — invoice metadata queries
- `permissions/` — `PersonPermissionGrantBuilder`, `EntityPermissionGrantBuilder`, `AuthorizationPermissionGrantBuilder`

---

## Auth Flow (Token Storage)

`AuthManager` is the bridge between authentication and all subsequent API calls.

```
loginWithToken()
  1. auth.getChallenge()
  2. crypto.init()                    ← fetch KSeF public certs
  3. crypto.encryptKsefToken()        ← RSA-OAEP or ECDH
  4. auth.submitKsefTokenAuthRequest()
  5. auth.getAccessToken()            ← redeem operation token
  6. authManager.setAccessToken()     ← store for injection
  7. authManager.setRefreshToken()

Every subsequent RestClient request:
  → doRequest() checks authManager.getAccessToken()
  → injects Authorization: Bearer <token>

On 401 (once per request):
  → authManager.onUnauthorized()
  → calls auth.refreshAccessToken(refreshToken)
  → updates stored token
  → retries original request
```

Custom `AuthManager` can be passed via `KSeFClientOptions.authManager` to integrate with external token stores.

---

## Build & Module System

- **TypeScript 5.x** strict mode
- **tsup** produces dual ESM + CJS + DTS output
- **Imports use `.js` extensions** (ESM resolution convention, even in `.ts` source)
- **Node.js 18+** required (native `fetch`, `crypto.webcrypto`)
- **yarn 4.x** (Corepack), `nodeLinker: node-modules`

---

## Adding a New Service

1. **Types:** Create `src/models/{domain}/types.ts` with request/response interfaces. Add barrel `index.ts`. Re-export from `src/models/index.ts`.

2. **Routes:** Add endpoint paths to `Routes` in `src/http/routes.ts`. Use string literals for static routes, arrow functions for parameterized routes.

3. **Service:** Create `src/services/{domain}.ts` following the standard pattern:
   - Constructor takes `RestClient`
   - Methods use `RestRequest` + `Routes` + `restClient.execute<T>()`
   - Re-export from `src/services/index.ts`

4. **Wire:** Add `readonly myService: MyService` property to `KSeFClient` and initialize in constructor with the shared `restClient`.

5. **Tests:** Add `tests/unit/services/{domain}.test.ts` — mock `RestClient.execute` to verify correct request construction.

6. **(Optional) Builder:** If the request payload is complex, add a fluent builder in `src/builders/`.
