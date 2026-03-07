# KSeF TypeScript Client — Implementation Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Application Code                   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Public API (KSeFClient)                 │
│  Fluent builders, typed methods, async/await         │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│            Domain Services Layer                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐│
│  │  Crypto   │ │Signature │ │  QR / Verification   ││
│  │  Service  │ │ Service  │ │  Services            ││
│  └──────────┘ └──────────┘ └──────────────────────┘│
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│          HTTP / REST Infrastructure                  │
│  RestClient, RouteBuilder, Error Handling            │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│           Models & Validation                        │
│  Request/Response types, Regex validators            │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 18+ | Native `fetch`, `crypto`, `SubtleCrypto` |
| Language | TypeScript 5.x, strict mode | Type safety, DX |
| Build | tsup (ESM + CJS dual output) | Simple, fast, dual-format |
| HTTP | Native `fetch` (global) | Zero deps, works in Node 18+ and Bun |
| JSON | Built-in `JSON.parse/stringify` | No external lib needed |
| XML parsing | `fast-xml-parser` | Lightweight, fast, well maintained |
| XML signing (XAdES) | `xml-crypto` + custom XAdES wrapper | Most mature XML-dsig lib for Node |
| Crypto (AES/RSA) | Node `crypto` module | Built-in, no deps |
| Certificate/Key parsing | `@peculiar/x509` + `node-forge` | X.509 parsing, PEM/DER, CSR generation |
| QR codes | `qrcode` | Mature, PNG output |
| Validation | Zod | Lightweight runtime validation |
| Testing | Vitest | Fast, TS-native |
| Package manager | npm | Standard |

## Project Structure

```
ksef-client-ts/
├── src/
│   ├── index.ts                    # Public API re-exports
│   ├── client.ts                   # KSeFClient main class
│   │
│   ├── http/
│   │   ├── rest-client.ts          # HTTP client wrapper (fetch-based)
│   │   ├── rest-request.ts         # RestRequest builder
│   │   ├── rest-response.ts        # RestResponse type
│   │   ├── routes.ts               # All API endpoint definitions
│   │   └── route-builder.ts        # Path construction with version prefix
│   │
│   ├── errors/
│   │   ├── ksef-api-error.ts       # Base API error
│   │   ├── ksef-rate-limit-error.ts# Rate limit error with Retry-After
│   │   └── types.ts                # ApiErrorResponse types
│   │
│   ├── models/
│   │   ├── auth/                   # Auth request/response types
│   │   ├── sessions/               # Session types (online, batch, status)
│   │   ├── invoices/               # Invoice types (send, query, export)
│   │   ├── permissions/            # Permission grant/revoke/search types
│   │   ├── certificates/           # Certificate enrollment/management types
│   │   ├── tokens/                 # KSeF token types
│   │   ├── limits/                 # Rate limit and context limit types
│   │   ├── lighthouse/             # System status types
│   │   ├── peppol/                 # Peppol types
│   │   ├── qrcode/                 # QR code types
│   │   ├── test-data/              # Test data management types
│   │   └── common.ts               # Shared types (OperationResponse, pagination, etc.)
│   │
│   ├── services/
│   │   ├── auth.ts                 # AuthorizationClient methods
│   │   ├── online-session.ts       # OnlineSessionClient methods
│   │   ├── batch-session.ts        # BatchSessionClient methods
│   │   ├── session-status.ts       # SessionStatusClient methods
│   │   ├── invoice-download.ts     # InvoiceDownloadClient methods
│   │   ├── permissions.ts          # Grant/Revoke/Search permissions
│   │   ├── certificates.ts         # Certificate management
│   │   ├── tokens.ts               # KSeF token management
│   │   ├── active-sessions.ts      # Active session management
│   │   ├── lighthouse.ts           # System status
│   │   ├── limits.ts               # Rate/context limits
│   │   ├── peppol.ts               # Peppol providers
│   │   └── test-data.ts            # Test data operations
│   │
│   ├── crypto/
│   │   ├── cryptography-service.ts # AES/RSA encryption, key management
│   │   ├── signature-service.ts    # XAdES-B signature generation
│   │   ├── certificate-service.ts  # Certificate generation, CSR, parsing
│   │   └── certificate-fetcher.ts  # Fetch public certs from KSeF
│   │
│   ├── builders/
│   │   ├── auth-token-request.ts   # Auth token request builder
│   │   ├── auth-ksef-token.ts      # KSeF token auth builder
│   │   ├── open-session.ts         # Session opening builders
│   │   ├── invoice-query.ts        # Invoice query filter builder
│   │   ├── permissions/            # Permission grant builders (entity, person, etc.)
│   │   └── certificate.ts          # Certificate enrollment builder
│   │
│   ├── qr/
│   │   ├── qr-code-service.ts      # QR code image generation
│   │   └── verification-link.ts    # Invoice/certificate verification URLs
│   │
│   ├── validation/
│   │   ├── patterns.ts             # Regex patterns (NIP, PESEL, KSeF number, etc.)
│   │   └── constraints.ts          # Length limits, valid values
│   │
│   └── config/
│       ├── environments.ts         # Environment URLs (TEST, DEMO, PRD)
│       └── options.ts              # Client configuration options
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── docs/
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

## Implementation Phases

---

### Phase 1: Foundation ✅

Project setup, HTTP layer, error handling, configuration.

**1.1 Project Init**
- `package.json` with metadata, scripts, dependencies
- `tsconfig.json` (strict, ESM, declaration output)
- `tsup.config.ts` (dual ESM/CJS build)
- Vitest config

**1.2 Configuration & Environments**
- `src/config/environments.ts` — environment URL constants:
  - TEST: `https://api-test.ksef.mf.gov.pl`
  - DEMO: `https://api-demo.ksef.mf.gov.pl`
  - PRD: `https://api.ksef.mf.gov.pl`
  - QR URLs per environment
  - Lighthouse URLs per environment
- `src/config/options.ts` — `KSeFClientOptions` type:
  - `baseUrl: string`
  - `baseQrUrl: string`
  - `apiVersion?: string` (default `"v2"`)
  - `timeout?: number` (default 100_000ms)
  - `customHeaders?: Record<string, string>`

**1.3 Error Types**
- `KSeFApiError` extends `Error` — properties: `statusCode`, `errorResponse`, `message`
- `KSeFRateLimitError` extends `KSeFApiError` — properties: `retryAfterSeconds`, `retryAfterDate`, `recommendedDelay`; parses `Retry-After` header
- `ApiErrorResponse` type — `{ exception: { exceptionDetailList: ExceptionDetail[] } }`

**1.4 HTTP Layer**
- `RouteBuilder` — constructs `/v2/{endpoint}` paths
- `RestRequest` — fluent builder for HTTP requests:
  - `.setMethod(method)`, `.setPath(path)`, `.setBody(body)`
  - `.addAccessToken(token)`, `.addHeader(key, value)`, `.addQueryParam(key, value)`
  - `.withTimeout(ms)`, `.withApiVersion(version)`, `.withContentType(type)`
- `RestResponse<T>` — `{ body: T, headers: Headers }`
- `RestClient` — wraps `fetch`:
  - `execute<T>(request: RestRequest): Promise<RestResponse<T>>`
  - Auto Bearer token injection
  - JSON serialization/deserialization
  - Error handling: 404 → `KSeFApiError`, 429 → `KSeFRateLimitError`, other 4xx/5xx → `KSeFApiError` with parsed body
  - Timeout via `AbortController`

**1.5 Routes**
- `src/http/routes.ts` — all endpoint path constants organized by domain:
  ```ts
  export const Routes = {
    Auth: {
      challenge: "auth/challenge",
      xadesSignature: "auth/xades-signature",
      ksefToken: "auth/ksef-token",
      status: (ref: string) => `auth/${ref}`,
      redeemToken: "auth/token/redeem",
      refreshToken: "auth/token/refresh",
      sessions: "auth/sessions",
      currentSession: "auth/sessions/current",
      revokeSession: (ref: string) => `auth/sessions/${ref}`,
    },
    Sessions: { ... },
    Invoices: { ... },
    Permissions: { ... },
    Certificates: { ... },
    Tokens: { ... },
    Limits: { ... },
    Security: { ... },
    TestData: { ... },
    Lighthouse: { ... },
    Peppol: { ... },
  } as const;
  ```

**1.6 Validation Patterns**
- Regex patterns: NIP, PESEL, NipVatUe, VatUe, InternalId, ReferenceNumber, KsefNumber, PeppolId, IPv4, SHA256, CertificateName, Fingerprint
- Constraint constants: challenge length (36), cert name limits, description limits, etc.

**Deliverable:** Working HTTP client that can make authenticated requests to KSeF API with proper error handling. ✅ Done

---

### Phase 2: Authentication & Sessions ✅

Core auth flows, session management, main client class.

**2.1 Common Model Types**
- `OperationResponse`, `ContextIdentifier`, pagination types, enums (EncryptionMethod, SessionType, InvoiceFormCode, etc.)

**2.2 Auth Models & Service**
- Types: `AuthChallengeResponse`, `AuthTokenRequest`, `SignatureResponse`, `AuthOperationStatusResponse`, `AccessTokenResponse`, `RefreshTokenResponse`
- Service methods:
  - `getAuthChallenge(): Promise<AuthChallengeResponse>`
  - `submitXadesAuthRequest(signedXml, verifyCertChain?, enforceXades?): Promise<SignatureResponse>`
  - `submitKsefTokenAuthRequest(payload): Promise<SignatureResponse>`
  - `getAuthStatus(ref, authToken): Promise<AuthOperationStatusResponse>`
  - `getAccessToken(authToken): Promise<AccessTokenResponse>`
  - `refreshAccessToken(refreshToken): Promise<RefreshTokenResponse>`

**2.3 Auth Token Request Builder**
- Fluent chain: `.withChallenge()` → `.withContextNip()` / `.withContextInternalId()` / `.withContextNipVatUe()` → `.withSubjectType()` → `.withAuthorizationPolicy()` (optional) → `.build()`
- Validation at each step

**2.4 Active Sessions Service**
- `getActiveSessions(accessToken, pageSize?, continuationToken?)`
- `revokeCurrentSession(token)`
- `revokeSession(sessionRef, accessToken)`

**2.5 Online Session Service**
- Types: `OpenOnlineSessionRequest/Response`, `SendInvoiceRequest/Response`
- Methods:
  - `openOnlineSession(request, accessToken, upoVersion?)`
  - `sendInvoice(sessionRef, request, accessToken)`
  - `closeOnlineSession(sessionRef, accessToken)`

**2.6 Batch Session Service**
- Types: `OpenBatchSessionRequest/Response`, `BatchPartSendingInfo`
- Methods:
  - `openBatchSession(request, accessToken, upoVersion?)`
  - `sendBatchParts(openResponse, parts)`
  - `closeBatchSession(sessionRef, accessToken)`

**2.7 Session Status Service**
- `getSessions(type, accessToken, filters?)`
- `getSessionStatus(sessionRef, accessToken)`
- `getSessionInvoices(sessionRef, accessToken, pageSize?, continuationToken?)`
- `getSessionFailedInvoices(...)`
- `getSessionInvoiceUpo(sessionRef, invoiceRef, accessToken)`
- `getSessionUpo(sessionRef, upoRef, accessToken)`

**2.8 KSeFClient Main Class**
- Constructor: `new KSeFClient(options: KSeFClientOptions)`
- Composes all service modules
- Exposes grouped API: `client.auth.getChallenge()`, `client.sessions.openOnline()`, etc.

**Deliverable:** Can authenticate (with pre-signed XML or KSeF token), open/close sessions, send invoices, check status. ✅ Done

---

### Phase 3: Invoices, Permissions, Tokens ✅

Full CRUD operations for all resource types.

**3.1 Invoice Download Service**
- `getInvoice(ksefNumber, accessToken): Promise<Buffer>`
- `queryInvoiceMetadata(filters, accessToken, pageOffset?, pageSize?, sortOrder?)`
- `exportInvoices(request, accessToken)`
- `getInvoiceExportStatus(opRef, accessToken)`

**3.2 Invoice Query Filter Builder**
- Fluent builder for complex filter construction: date ranges, amount ranges, seller/buyer NIP, currencies, form types, attachment status

**3.3 Permission Services**
- Grant: person, entity, authorization, indirect, subunit, EU entity, EU representative
- Revoke: common, authorization
- Search: personal, person, subunit, entity roles, subordinate entity roles, authorization grants, EU entity
- Operation status check

**3.4 Permission Builders**
- Separate builders per permission type with validation

**3.5 KSeF Token Service**
- `generateKsefToken(request, accessToken)`
- `queryKsefTokens(accessToken, filters?)`
- `getKsefToken(tokenRef, accessToken)`
- `revokeKsefToken(tokenRef, accessToken)`

**3.6 Certificate Service (API)**
- `getCertificateLimits(accessToken)`
- `getCertificateEnrollmentData(accessToken)`
- `sendCertificateEnrollment(request, accessToken)`
- `getCertificateEnrollmentStatus(certRef, accessToken)`
- `getCertificateList(request, accessToken)`
- `revokeCertificate(serialNumber, request, accessToken)`
- `getCertificateMetadataList(accessToken, request?, pageSize?, pageOffset?)`

**3.7 Remaining Services**
- Lighthouse: `getStatus()`, `getMessages()`
- Limits: `getContextLimits()`, `getSubjectLimits()`, `getRateLimits()`
- Peppol: `queryPeppolProviders()`
- Test data: full CRUD for subjects, persons, permissions, limits, rate limits, context blocking

**Deliverable:** Feature-complete API surface matching Java/C# clients. ✅ Done

---

### Phase 4: Cryptography & Signing

Encryption, decryption, signatures, certificate management.

**4.1 Certificate Fetcher**
- Fetch public key certificates from `GET /security/public-key-certificates`
- Cache certificates (singleton pattern)
- Parse PEM → public key objects

**4.2 Cryptography Service**
- AES-256-CBC encrypt/decrypt (with PKCS7 padding)
- RSA-OAEP encrypt (SHA-256, MGF1) for symmetric key wrapping
- `getEncryptionData()` → generates random AES key + IV, encrypts key with KSeF public cert, returns `{ key, iv, encryptedKey, encryptionInfo }`
- File metadata: SHA-256 hash + size calculation
- Private key parsing from PEM (RSA, ECDSA)
- CSR generation (PKCS#10, DER, Base64)

**4.3 Signature Service**
- XAdES-B enveloped signature generation
- Support RSA-SHA256 and ECDSA-SHA256
- Input: XML bytes + X509 certificate + private key
- Output: signed XML with XAdES signature

**4.4 Certificate Generation Service**
- Self-signed certificate generation (for test environments)
- SHA-256 fingerprint calculation
- Support RSA and ECDSA key types

**Deliverable:** Full crypto pipeline — can encrypt invoices, sign auth requests, generate CSRs.

---

### Phase 5: QR Codes & Utilities

**5.1 Verification Link Service**
- Build invoice verification URLs (QR Code I): `https://qr-{env}.ksef.mf.gov.pl/invoice/{NIP}/{date}/{SHA256}`
- Build certificate verification URLs (QR Code II): `https://qr-{env}.ksef.mf.gov.pl/certificate/{contextType}/{contextId}/{sellerNIP}/{certSerial}/{SHA256}/{signature}`

**5.2 QR Code Service**
- Generate QR code PNG from verification URL
- Configurable size
- Optional label (KSeF number or "OFFLINE" / "CERTYFIKAT")

**Deliverable:** Complete feature parity with reference implementations.

---

### Phase 6: Polish & Release

**6.1 Documentation**
- README with quickstart, examples
- API reference (generated from TSDoc)
- Usage examples for common flows

**6.2 Testing**
- Unit tests for builders, validators, crypto, URL construction
- Integration test scaffolding (against TEST environment)
- Mock-based tests for HTTP layer

**6.3 CI/CD**
- GitHub Actions: lint, test, build
- npm publish workflow

**6.4 Package**
- Dual ESM/CJS output
- TypeScript declarations
- Proper `exports` field in package.json
- Tree-shakeable

---

## API Design (Public Surface)

```ts
import { KSeFClient, Environment } from "ksef-client-ts";

// Create client
const client = new KSeFClient({
  environment: Environment.TEST,
  // or custom:
  // baseUrl: "https://api-test.ksef.mf.gov.pl",
  // baseQrUrl: "https://qr-test.ksef.mf.gov.pl",
});

// Authenticate with KSeF token
const challenge = await client.auth.getChallenge();
const authResult = await client.auth.submitKsefToken({
  challenge: challenge.challenge,
  ksefToken: "my-token",
  contextNip: "1234567890",
});
// Poll for completion
const status = await client.auth.getStatus(authResult.referenceNumber, authResult.authenticationToken);
const tokens = await client.auth.redeemToken(authResult.authenticationToken);

// Open interactive session
const crypto = client.crypto;
const encryptionData = await crypto.getEncryptionData();
const session = await client.sessions.openOnline({
  formCode: { systemCode: "FA (2)", schemaVersion: "1-0E", targetNamespace: "..." },
  encryptionInfo: encryptionData.encryptionInfo,
}, tokens.accessToken);

// Send invoice
const encryptedInvoice = crypto.encryptInvoice(invoiceXml, encryptionData);
const sent = await client.sessions.sendInvoice(session.referenceNumber, {
  encryptedBody: encryptedInvoice,
  fileMetadata: crypto.getFileMetadata(invoiceXml),
}, tokens.accessToken);

// Close session
await client.sessions.closeOnline(session.referenceNumber, tokens.accessToken);

// Generate QR code
const qrUrl = client.qr.buildInvoiceVerificationUrl(nip, issueDate, invoiceSha256);
const qrPng = await client.qr.generatePng(qrUrl);
```

## Dependency Summary

**Runtime dependencies (minimal):**
- `fast-xml-parser` — XML parsing/building
- `xml-crypto` — XML digital signatures (XAdES base)
- `@peculiar/x509` — X.509 certificate operations
- `node-forge` — PEM/DER/CSR utilities
- `qrcode` — QR code PNG generation

**Dev dependencies:**
- `typescript`, `tsup`, `vitest`
- `@types/node`

## Key Design Decisions

1. **Namespace-grouped API** (`client.auth.*`, `client.sessions.*`, etc.) instead of flat 100+ methods on one class — better discoverability and tree-shaking.

2. **Native fetch** instead of axios/got — zero HTTP deps, works across Node 18+/Bun/Deno.

3. **Builders are optional** — accept plain objects for simple cases, provide builders for complex requests (permissions, filters).

4. **Crypto service is lazy-initialized** — public certificates fetched on first use, cached afterward.

5. **All methods return Promises** — consistent async API.

6. **Errors are typed** — `KSeFApiError` and `KSeFRateLimitError` with structured info for programmatic handling.

7. **Environment presets** — `Environment.TEST/DEMO/PRD` for convenience, custom URLs for flexibility.
