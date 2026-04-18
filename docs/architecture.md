# Architecture

Internal architecture of `ksef-client-ts`. Intended for contributors and anyone who wants to understand how the library is structured.

---

## Layered Design

```
KSeFClient (src/client.ts)
  │
  ├── 13 service properties ──→ Services (src/services/*.ts)
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

Workflows (src/workflows/)
  ├── authenticateWithToken/Certificate/Pkcs12 ──→ auth + crypto + polling
  ├── openOnlineSession / openSendAndClose ──→ session + invoice + UPO polling
  ├── uploadBatch ──→ batch session + parts upload + UPO polling
  ├── exportInvoices / exportAndDownload ──→ export + polling + decrypt
  └── pollUntil() ──→ shared polling utility

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

```text
src/
├── client.ts              # KSeFClient — main entry point, wires everything
├── index.ts               # Barrel re-exports for the public API
├── config/                # Environment configs (TEST/DEMO/PROD), options resolver
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
├── offline/               # Offline invoice mode (types, deadlines, storage)
├── xml/                   # Invoice XML layer (UPO parser, field extractor, serialization)
├── errors/                # Error hierarchy (see below)
├── validation/            # Regex patterns, checksum validators, constraints
├── workflows/             # High-level orchestration (auth, sessions, export, polling)
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
410 → KSeFGoneError (operation status retention expired, KSeF v2.4.0+)
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

## XML Layer (`src/xml/`)

Invoice XML read/write utilities. Separate from services because these helpers operate on local XML rather than calling the KSeF API.

| File | Purpose |
|------|---------|
| `xml-engine.ts` | `fast-xml-parser` wrapper. Exposes `parseXml`, `buildXml`, `buildXmlFromObject`, `stripBom`. Manually prepends the XML declaration (the parser's `declaration` option is a no-op) |
| `order-map.ts` | `ORDER_MAP` per XSD parent + `comparePKey` natural sort (so `P_13_10` follows `P_13_9`). Also interleaves per-VAT-rate `P_13_N / P_14_N / P_14_NW` for FA3 |
| `faktura-builder.ts` | FA2/FA3 builder. Normalizes `KodFormularza` (typed `FormCode` → attribute-shaped children), orders children via `orderXmlObject`, injects `xmlns` + `xmlns:etd` on `<Faktura>` |
| `pef-builder.ts` | PEF (`Invoice`) and PEF_KOR (`CreditNote`) UBL 2.1 builder. Injects the UBL namespace set (`xmlns`, `xmlns:ext`, `xmlns:cbc`, `xmlns:cac`, `xmlns:cbc-pl`, `xmlns:cac-pl`) on the root |
| `invoice-serializer.ts` | Polymorphic `serializeInvoiceXml(input, options?)` → `Buffer`. Dispatches on `Buffer` / `string` / `XmlDocument` / `FakturaInput` / `PefUblDocumentInput`. Also exports `buildRawXmlString` for pre-shaped `XmlObject` inputs |
| `upo-parser.ts` | Parses the official KSeF UPO receipt XML into a typed `UpoPotwierdzenie` tree |
| `invoice-field-extractor.ts` | Extracts `P_1` / `P_2` / `P_4B` / `P_4C` from an invoice XML string |
| `types.ts` | Public types: `FakturaInput`, `PefUblInvoiceInput`, `PefUblCreditNoteInput`, `SerializeInvoiceOptions`, `XmlDocument`, etc. |

**Default schema:** `buildFakturaXml` defaults to FA3 (required on DEMO and PROD since February 2026). Pass `{ schema: 'FA2' }` to target the legacy schema. `buildPefXml` infers the schema from the root key; an explicit `{ schema: 'PEF' | 'PEF_KOR' }` that contradicts the root throws `KSeFValidationError`.

**Pass-through:** `serializeInvoiceXml` is deliberately polymorphic — `Buffer` inputs are returned byte-for-byte (as the same reference), `string` inputs are BOM-stripped and wrapped in a `Buffer`. Neither path is validated or reordered. Combine with the [invoice XML validator](./validation.md) for a client-side safety net.

See [XML Serialization](./xml-serialization.md) for the full usage guide.

---

## Offline Layer (`src/offline/`)

Full lifecycle for the four KSeF offline modes (`offline24`, `offline`, `awaryjny`, `awaria_calkowita`). Separate from services because the library owns local state — invoices signed offline sit in a local store until the API is reachable again.

| File | Purpose |
|------|---------|
| `types.ts` | `OfflineMode`, `OfflineInvoiceStatus`, `OfflineInvoiceMetadata`, `OfflineCertificate` |
| `deadline.ts` | `calculateOfflineDeadline()`, business-day helpers, maintenance-window cascading |
| `storage.ts` | `OfflineInvoiceStorage` interface + `InMemoryOfflineInvoiceStorage` |
| `file-storage.ts` | `FileOfflineInvoiceStorage` rooted at `~/.ksef/offline/` |

See [Offline Mode](./offline-mode.md) for usage.

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
        ├── KSeFGoneError             # 410 (operation status retention expired, KSeF v2.4.0+)
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

## Workflows (`src/workflows/`)

High-level orchestration functions that compose multiple service calls into common multi-step operations. Unlike services (which map 1:1 to API endpoints), workflows handle the full lifecycle: auth → action → polling → result.

| File | Functions | Purpose |
|------|-----------|---------|
| `auth-workflow.ts` | `authenticateWithToken()`, `authenticateWithCertificate()`, `authenticateWithPkcs12()` | Full auth ceremony: challenge → encrypt/sign → submit → poll → redeem tokens |
| `online-session-workflow.ts` | `openOnlineSession()`, `openSendAndClose()` | Online session: open → send invoices → close → poll UPO |
| `batch-session-workflow.ts` | `uploadBatch()` | Batch session: open → upload parts → close → poll UPO |
| `invoice-export-workflow.ts` | `exportInvoices()`, `exportAndDownload()` | Export: initiate → poll status → download + decrypt parts |
| `polling.ts` | `pollUntil()` | Shared polling utility with configurable interval and max attempts |
| `types.ts` | `PollOptions`, `OnlineSessionHandle`, `UpoInfo`, etc. | Workflow type definitions |

Workflows accept a `KSeFClient` instance and options, returning typed results. They are exported from the package root via `src/workflows/index.ts`.

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

---

## Design Decisions

Key architectural decisions and their rationale.

### Why POST Requests Are Retried

**Context:** Most HTTP clients only retry idempotent methods (GET, PUT, DELETE).

**Decision:** Retry all methods including POST.

**Rationale:** KSeF API operations are idempotent by design — invoice submission returns the same KSeF number on re-submit. Transient failures (503, network errors) shouldn't require manual intervention in batch workflows.

### Reactive Auth Refresh vs Proactive

**Context:** Two approaches to handle token expiry — proactively check TTL before each request, or reactively refresh on 401.

**Decision:** Reactive refresh on 401 with request deduplication.

**Rationale:** Simpler and token-format-agnostic (no JWT parsing needed). Cost is one failed request per expiry (~once per 20+ minute session). N parallel 401s trigger only 1 refresh call via shared Promise deduplication.

### Token Bucket vs Sliding Window Rate Limiting

**Context:** Need proactive rate limiting to avoid 429 responses from KSeF.

**Decision:** Single-tier token bucket with global + per-endpoint quotas.

**Rationale:** Per-second limit is the binding constraint in KSeF. Token bucket is simpler than sliding window, has O(1) memory, and is sufficient for the access pattern. Concurrency safety via sequential promise chain (Node.js single-threaded).

### Separate Policy Objects

**Context:** Could add retry/rate-limit/auth as flat options on RestClient or as separate policy objects.

**Decision:** Typed policy instances (`RetryPolicy`, `RateLimitPolicy`, `AuthManager`, `PresignedUrlPolicy`).

**Rationale:** Enables independent testing, swapping, and documentation of each concern. Each policy is self-contained with its own defaults. `KSeFClientOptions` exposes `Partial<>` versions merged with defaults for ergonomic configuration.

### Presigned URL Validation with Private IP Rejection

**Context:** The library downloads files from presigned URLs returned by the KSeF API.

**Decision:** Validate HTTPS, host whitelist, reject private IPs, block redirect parameters.

**Rationale:** Defense-in-depth against SSRF. Private IP rejection (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `::1`, `fc00::/7`) prevents internal network scanning via crafted URLs. Configurable via `presignedUrlHosts` for corporate environments.

### Active Sessions Under `session` Command Group

**Context:** Could create a separate `active-session` top-level CLI command or nest under `session`.

**Decision:** Nest as `session active` and `session revoke` subcommands.

**Rationale:** All session-related operations stay consolidated. 10 subcommands is acceptable when semantically related. Clear naming distinguishes `close` (API session) from `revoke` (authentication session).

### Transport as Function Type, Not Class

**Context:** Need pluggable HTTP transport for testing and custom backends.

**Decision:** `TransportFn = (url: string, init: RequestInit) => Promise<Response>` — a plain function type.

**Rationale:** Minimal surface area. Test mocks are one-liners. `defaultTransport` wraps native `fetch`. No class ceremony needed for a single-method interface.
