# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TypeScript client library for the Polish National e-Invoice System (KSeF) API v2. Targets Node.js 18+ with dual ESM/CJS output. Current version and release history are in `CHANGELOG.md`.

## Commands

```bash
yarn build            # Build ESM + CJS + DTS via tsup
yarn lint             # Type-check only (tsc --noEmit)
yarn test             # Run unit tests (vitest run tests/unit)
yarn test:e2e         # Run E2E tests (vitest run tests/e2e)
yarn test:watch       # Watch mode (all tests)
yarn docs:dev         # VitePress dev server
yarn docs:build       # Build docs site
yarn check-api        # Check OpenAPI coverage
yarn split-openapi    # Split open-api.json into per-domain chunks
```

Run a single test file: `yarn vitest run tests/unit/foo.test.ts`

Tests: 889 tests across 61 files (48 unit + 13 E2E). Tests live in `tests/**/*.test.ts` (vitest, globals enabled).

**Package manager is yarn 4.x** (Corepack). Do not use npm. The `.yarnrc.yml` sets `nodeLinker: node-modules`.

## Architecture

### Layered design

```
KSeFClient (src/client.ts)
  ├── 13 API services + crypto + qr (15 properties total)
  ├── each service wraps RestClient for its API domain
  └── crypto is lazy-initialized (user calls client.crypto.init())

Services (src/services/*.ts) — 13 services
  └── use RestClient.execute<T>() with RestRequest builders + Routes constants

HTTP layer (src/http/)
  ├── RestClient — wraps native fetch, handles errors (429/401/403), JSON, auth headers
  ├── RestRequest — fluent builder (method, path, body, headers, query)
  ├── RouteBuilder — prepends /v2/ version prefix
  ├── Routes — all API endpoint paths as const object
  ├── RetryPolicy — exponential backoff with jitter, configurable retryable status codes
  ├── RateLimitPolicy — token bucket rate limiter (global + per-endpoint)
  ├── PresignedUrlPolicy — validates presigned download URLs (HTTPS, host allowlist)
  └── AuthManager — manages access/refresh tokens, auto-refresh on 401 with dedup

Crypto layer (src/crypto/)
  ├── CertificateFetcher — fetches & caches KSeF public certs
  ├── CryptographyService — AES-256-CBC, RSA-OAEP, ECDH+AES-GCM, CSR gen
  ├── SignatureService — XAdES-B enveloped XML signatures (static)
  └── CertificateService — self-signed cert generation (static)

QR layer (src/qr/)
  ├── VerificationLinkService — builds invoice/certificate verification URLs
  └── QrCodeService — generates QR codes (PNG, SVG, SVG+label)

CLI (src/cli/) — 14 command groups via commander.js
  └── auth, session, invoice, permission, token, cert, lighthouse, limits,
      peppol, test-data, qr, config, doctor, completion
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
- `PermissionSubjectIdentifierType` (not `SubjectIdentifierType`) — avoids collision with auth types. Note: both now use `'Nip' | 'Pesel' | 'Fingerprint'` values (aligned with OpenAPI spec).

### Environment variables

`KSEF_TOKEN` and `KSEF_NIP` are set in the current shell environment. Use them for CLI login: `ksef auth login --token "$KSEF_TOKEN" --nip "$KSEF_NIP" --env prod`.

### OpenAPI spec

`docs/open-api.json` is the KSeF API OpenAPI specification (source of truth, v2.3.0-te). Per-domain chunks in `docs/openapi-chunks/` (16 files). Regenerate with `yarn split-openapi`. Validate coverage with `yarn check-api`.

### Error hierarchy

`KSeFError` (base) → `KSeFApiError` (generic HTTP), `KSeFUnauthorizedError` (401), `KSeFForbiddenError` (403), `KSeFRateLimitError` (429), `KSeFAuthStatusError`, `KSeFSessionExpiredError`, `KSeFValidationError` (builder validation).

`RestClient.ensureSuccess` reads body text once, then parses per status code (429→401→403→generic).

### CI/CD

4 GitHub Actions workflows in `.github/workflows/`:
- `test.yml` — unit tests on Node 18/20/22 matrix, coverage badge via gist
- `e2e.yml` — E2E tests against KSeF TEST environment (push to main + manual)
- `release.yml` — GitHub Release from tag `v*`, extracts notes from CHANGELOG.md
- `deploy-docs.yml` — VitePress → GitHub Pages

### Documentation

VitePress site in `docs/` with Scalar API reference. Config: `docs/.vitepress/config.ts`.

### Plans

`plans/` directory (gitignored) contains development plans and roadmaps. Not tracked in git.

### Reference implementations

`ref/` directory (gitignored) contains Java (`ref/ksef-client-java`), C# (`ref/ksef-client-csharp`), TS refs (`ref/ksef-client-typescript`, `ref/ksef-client-ts`), official docs (`ref/ksef-docs`), and translations (`ref/ksef-docs-translated`). See `ref/ref-index.md` for full index.

### WebCrypto typing quirk

`crypto.webcrypto.subtle.generateKey()` returns `CryptoKeyPair | CryptoKey`. Cast to `crypto.webcrypto.CryptoKeyPair` when generating key pairs — TypeScript cannot narrow this union.
