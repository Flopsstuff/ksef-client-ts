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
yarn sync-schemas     # Download XSD schemas from CIRFMF/ksef-docs
```

Run a single test file: `yarn vitest run tests/unit/foo.test.ts`

Tests live in `tests/**/*.test.ts` (vitest, globals enabled). Unit tests in `tests/unit/`, E2E tests in `tests/e2e/`.

**Package manager is yarn 4.x** (Corepack). Do not use npm. The `.yarnrc.yml` sets `nodeLinker: node-modules`.

## Architecture

### Layered design

```
KSeFClient (src/client.ts)
  ├── 13 API services + crypto + qr + offline (16 properties total)
  ├── each service wraps RestClient for its API domain
  ├── crypto is lazy-initialized (user calls client.crypto.init())
  └── offline is lazy-initialized (accessed via client.offline)

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

Offline layer (src/offline/)
  ├── types — OfflineMode, OfflineInvoiceStatus, OfflineInvoiceMetadata, OfflineCertificate
  ├── deadline — calculateOfflineDeadline(), business day helpers, maintenance cascading
  ├── storage — OfflineInvoiceStorage interface + InMemoryOfflineInvoiceStorage
  └── file-storage — FileOfflineInvoiceStorage (~/.ksef/offline/)

CLI (src/cli/) — 15 command groups via citty
  ├── auth, session, invoice, permission, token, cert, lighthouse, limits,
  │   peppol, test-data, qr, config, doctor, completion, offline
  ├── requireSession() — auto-recovers via refresh or re-login from stored credentials
  └── session-recovery — cascade: refresh token → loginWithToken from credentials → error
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

### KSeF environments and portals

| Env | API | Web Portal |
|-----|-----|------------|
| PROD | `https://api.ksef.mf.gov.pl` | `https://ap.ksef.mf.gov.pl/web/` |
| TEST | `https://api-test.ksef.mf.gov.pl` | — |
| DEMO | `https://api-demo.ksef.mf.gov.pl` | — |

The web portal is used for token generation, permission management, and invoice browsing via browser (requires qualified signature or trusted profile).

### Environment variables

`KSEF_TOKEN` and `KSEF_NIP` are set in the current shell environment. Use them for CLI login: `ksef auth login --token "$KSEF_TOKEN" --nip "$KSEF_NIP" --env prod`.

### Invoice upload flow (CLI)

```bash
ksef auth login --token "$KSEF_TOKEN" --nip "$KSEF_NIP"
ksef session open              # 1. Open online session (required before sending)
ksef invoice send file.xml     # 2. Send invoice
ksef session invoices          # 3. Verify invoice status (check for errors/duplicates)
ksef invoice query --from 2026-01-01  # Query invoices by date range
ksef session close             # 4. Close session (optional)
```

Invoice number (`P_2` in XML) must be unique — resubmitting gives error 440 (Duplikat faktury).

### OpenAPI spec

`docs/open-api.json` is the KSeF API OpenAPI specification (source of truth, v2.3.0-te). Per-domain chunks in `docs/openapi-chunks/` (16 files). Regenerate with `yarn split-openapi`. Validate coverage with `yarn check-api`.

### XSD schemas

`docs/schemas/` contains official KSeF invoice XSD schemas from [CIRFMF/ksef-docs](https://github.com/CIRFMF/ksef-docs). Organized by type: `FA/` (standard invoices), `PEF/` (Peppol), `RR/` (farmer invoices), each with `bazowe/` base types. Update with `yarn sync-schemas`.

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
Feature descriptions live in two places that must be kept in sync: `README.md` (bullet list) and `docs/index.md` (VitePress homepage cards).

### Plans

`plans/` directory (gitignored) contains development plans and roadmaps. Not tracked in git.

### Reference implementations

`ref/` directory (gitignored) contains Java (`ref/ksef-client-java`), C# (`ref/ksef-client-csharp`), TS refs (`ref/ksef-client-typescript`, `ref/ksef-client-ts`), official docs (`ref/ksef-docs`), and translations (`ref/ksef-docs-translated`). See `ref/ref-index.md` for full index.

### WebCrypto typing quirk

`crypto.webcrypto.subtle.generateKey()` returns `CryptoKeyPair | CryptoKey`. Cast to `crypto.webcrypto.CryptoKeyPair` when generating key pairs — TypeScript cannot narrow this union.

## Rules

- Do not push commits or create files unless explicitly asked. Do not push to remote unless the user explicitly says "push" — committing and pushing are separate actions. Do not assume the user wants additional actions beyond what was requested.
- When writing CHANGELOG entries, describe the feature's purpose and user-facing impact, NOT implementation details like method names, parameters, or internal references. Keep entries concise.
- Always run the full test suite (unit + e2e) before committing. Ensure all tests pass before creating commits.
- When debugging issues, investigate root causes before suggesting surface-level fixes. Don't suggest simple retries or config changes without first checking if the value is hardcoded or the real problem is deeper.
- Always merge PRs with `--squash`. Merge commits are disabled on this repository.
- When squash-merging, edit the combined commit message to remove duplicate `Co-Authored-By` lines from individual commits — keep only a single `Co-Authored-By` at the very end.
- Name version branches with `version/` prefix (e.g. `version/v0.6.1`) to avoid conflicts with release tags.
