# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TypeScript client library for the Polish National e-Invoice System (KSeF) API v2. Targets Node.js 18+ with dual ESM/CJS output.

## Commands

```bash
yarn build          # Build ESM + CJS + DTS via tsup
yarn lint           # Type-check only (tsc --noEmit)
yarn test           # Run all tests (vitest run)
yarn test:watch     # Watch mode
```

Run a single test file: `yarn vitest run tests/unit/foo.test.ts`

Tests live in `tests/**/*.test.ts` (vitest, globals enabled).

**Package manager is yarn 4.x** (Corepack). Do not use npm. The `.yarnrc.yml` sets `nodeLinker: node-modules`.

## Architecture

### Layered design

```
KSeFClient (src/client.ts)
  ├── 13 service properties (auth, invoices, permissions, crypto, …)
  ├── each service wraps RestClient for its API domain
  └── crypto is lazy-initialized (user calls client.crypto.init())

Services (src/services/*.ts)
  └── use RestClient.execute<T>() with RestRequest builders + Routes constants

HTTP layer (src/http/)
  ├── RestClient — wraps native fetch, handles errors, JSON, auth headers
  ├── RestRequest — fluent builder (method, path, body, headers, query)
  ├── RouteBuilder — prepends /v2/ version prefix
  └── Routes — all API endpoint paths as const object

Crypto layer (src/crypto/)
  ├── CertificateFetcher — fetches & caches KSeF public certs
  ├── CryptographyService — AES-256-CBC, RSA-OAEP, ECDH+AES-GCM, CSR gen
  ├── SignatureService — XAdES-B enveloped XML signatures (static)
  └── CertificateService — self-signed cert generation (static)
```

### Key conventions

- **Imports use `.js` extensions** (ESM resolution convention, even for `.ts` source files).
- **Models** are in `src/models/{domain}/types.ts` with barrel `index.ts` re-exports. Types from `src/models/common.ts` are shared across domains.
- **Builders** in `src/builders/` provide fluent APIs for complex request construction.
- **Static vs instance**: `SignatureService` and `CertificateService` are fully static (no state). `CryptographyService` requires a `CertificateFetcher` instance (injected via `KSeFClient` constructor).
- **No auto-init**: `CryptographyService.init()` must be called explicitly to fetch KSeF public certificates. It is NOT called in the `KSeFClient` constructor.

### Naming collisions to be aware of

- `CertificateApiService` (src/services/) — API CRUD for certificate enrollment. Named with "Api" suffix to avoid collision with `CertificateService` (src/crypto/) which handles self-signed cert generation.
- `InvoiceFilterInvoicingMode` (not `InvoicingMode`) — avoids collision with session types.
- `PermissionSubjectIdentifierType` (not `SubjectIdentifierType`) — avoids collision with auth types.

### Reference implementations

`ref/` directory (gitignored) contains Java (`ref/ksef-client-java`), C# (`ref/ksef-client-csharp`), official docs (`ref/ksef-docs`), and translations (`ref/ksef-docs-translated`). Consult these when implementing new features or verifying API behavior.

### WebCrypto typing quirk

`crypto.webcrypto.subtle.generateKey()` returns `CryptoKeyPair | CryptoKey`. Cast to `crypto.webcrypto.CryptoKeyPair` when generating key pairs — TypeScript cannot narrow this union.
