# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Yarn 4.x workspace monorepo. The library (`ksef-client-ts`) lives in `packages/ksef-client-ts/`. TypeScript client for the Polish National e-Invoice System (KSeF) API v2. Targets Node.js 18+ with dual ESM/CJS output. Current version and release history are in `packages/ksef-client-ts/CHANGELOG.md`.

## Commands

Run from the **repo root** — all commands delegate to the `ksef-client-ts` workspace:

```bash
yarn build            # Build ESM + CJS + DTS via tsup
yarn lint             # Type-check only (tsc --noEmit)
yarn test             # Run unit tests (vitest run tests/unit)
yarn test:e2e         # Run E2E tests (vitest run tests/e2e)
yarn test:watch       # Watch mode (all tests)
yarn docs:dev         # VitePress dev server
yarn docs:build       # Build docs site
yarn check-api        # Check OpenAPI coverage
yarn sync-openapi     # Download the OpenAPI spec from the live KSeF API
yarn split-openapi    # Split open-api.json into per-domain chunks
yarn sync-schemas     # Download XSD schemas from CIRFMF/ksef-docs
```

Run a single test file: `yarn workspace ksef-client-ts vitest run tests/unit/foo.test.ts`

Tests live in `packages/ksef-client-ts/tests/**/*.test.ts` (vitest, globals enabled). Unit tests in `tests/unit/`, E2E tests in `tests/e2e/` (relative to the package).

**Package manager is yarn 4.x** (Corepack). Do not use npm. The `.yarnrc.yml` sets `nodeLinker: node-modules`.

## Architecture

### Layered design

Source paths below are relative to the library package, `packages/ksef-client-ts/`.

```text
KSeFClient (src/client.ts)
  ├── 14 API services + crypto + qr + offline (17 properties total)
  ├── each service wraps RestClient for its API domain
  ├── crypto is lazy-initialized (user calls client.crypto.init())
  └── offline is lazy-initialized (accessed via client.offline)

Services (src/services/*.ts) — 14 services
  └── use RestClient.execute<T>() with RestRequest builders + Routes constants

HTTP layer (src/http/)
  ├── RestClient — wraps native fetch, handles errors (429/401/403), JSON, auth headers
  ├── RestRequest — fluent builder (method, path, body, headers, query)
  ├── RouteBuilder — prepends /v2/ version prefix
  ├── Routes — all API endpoint paths as const object
  ├── RetryPolicy — exponential backoff with jitter, configurable retryable status codes
  ├── RateLimitPolicy — token bucket rate limiter (global + per-endpoint)
  ├── CircuitBreakerPolicy — opt-in fail-fast above retry: opens after N consecutive network/5xx failures, probes after cooldown (429/401 never trip)
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

XML layer (src/xml/)
  ├── upo-parser — parses official KSeF UPO receipt XML into typed objects
  ├── invoice-field-extractor — extracts P_1/P_2/P_4B/P_4C from invoice XML
  ├── xml-engine — fast-xml-parser wrapper (preserveOrder); parseXml/buildXml/stripBom
  ├── order-map — ORDER_MAP per XSD parent + comparePKey natural sort +
  │   multi-rate P_13/P_14/P_14W interleave per VAT group
  ├── faktura-builder — FA2/FA3 builder; injects xmlns + xmlns:etd on <Faktura>
  ├── pef-builder — PEF (Invoice) / PEF_KOR (CreditNote) UBL builder
  └── invoice-serializer — polymorphic serializeInvoiceXml(input, options) → Buffer
      dispatching on FakturaInput / PefUblDocumentInput / string / Buffer / XmlDocument

CLI (src/cli/) — 17 command groups via citty
  ├── setup, auth, session, invoice, permission, token, cert, lighthouse, limits,
  │   collective-identifier, peppol, test-data, qr, config, doctor, completion,
  │   offline
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
| TEST | `https://api-test.ksef.mf.gov.pl` | `https://ap-test.ksef.mf.gov.pl/web/` |
| DEMO | `https://api-demo.ksef.mf.gov.pl` | `https://ap-demo.ksef.mf.gov.pl/web/` |

The web portal is used for token generation, permission management, and invoice browsing via browser (requires qualified signature or trusted profile). Each environment is fully isolated — accounts, tokens, and certificates created in one env do not exist in others.

### Environment variables

`KSEF_NIP`, `KSEF_TOKEN` (for PROD) and `KSEF_TOKEN_DEMO` (for DEMO) are set in the current shell environment.

- PROD: `ksef auth login --token "$KSEF_TOKEN" --nip "$KSEF_NIP" --env prod`
- DEMO: `ksef auth login --token "$KSEF_TOKEN_DEMO" --nip "$KSEF_NIP" --env demo`

### Invoice upload flow (CLI)

```bash
ksef auth login --token "$KSEF_TOKEN" --nip "$KSEF_NIP"
ksef session open              # 1. Open online session (required before sending)
ksef invoice build data.json   # (optional) Build XML from JSON/YAML; `--template FA3` prints a skeleton.
ksef invoice send file.xml     # 2. Send invoice
ksef session invoices          # 3. Verify invoice status (check for errors/duplicates)
ksef invoice query --from 2026-01-01  # Query invoices by date range
ksef session close             # 4. Close session (optional)
```

Invoice number (`P_2` in XML) must be unique — resubmitting gives error 440 (Duplikat faktury).

### OpenAPI spec

`packages/ksef-client-ts/docs/open-api.json` is the KSeF API OpenAPI specification (source of truth, KSeF API v2.7.1, build `2.7.1-te`; synced from the live TEST endpoint `https://api-test.ksef.mf.gov.pl/docs/v2/openapi.json`). Note: TEST/DEMO lead while PROD trails, so the vendored spec can be ahead of what PROD serves. Update it with `yarn sync-openapi` (`--env demo|prod` to pull from another environment, `--dry-run` to preview the delta), which writes the served document verbatim. Per-domain chunks in `packages/ksef-client-ts/docs/openapi-chunks/` (10 chunks + manifest; descriptions stripped to save tokens). Regenerate with `yarn split-openapi` after every sync. Validate coverage with `yarn check-api`.

### XSD schemas

`packages/ksef-client-ts/docs/schemas/` contains official KSeF invoice XSD schemas from [CIRFMF/ksef-docs](https://github.com/CIRFMF/ksef-docs). Organized by type: `FA/` (standard invoices), `PEF/` (Peppol), `RR/` (farmer invoices), each with `bazowe/` base types. Update with `yarn sync-schemas`.

### Error hierarchy

`KSeFError` (base) → `KSeFApiError` (generic HTTP), `KSeFBadRequestError` (400), `KSeFUnauthorizedError` (401), `KSeFForbiddenError` (403), `KSeFGoneError` (410, retention expired), `KSeFRateLimitError` (429), `KSeFBatchTimeoutError` (KSeF code 21208), `KSeFUnknownPublicKeyError` (KSeF code 21470, pre-empts `KSeFBadRequestError`), `KSeFAuthStatusError`, `KSeFSessionExpiredError`, `KSeFValidationError` (builder validation), `KSeFXsdValidationError` (XSD schema validation), `KSeFMetadataPaginationError` (paging cannot advance), `KSeFCircuitOpenError` (circuit breaker fail-fast).

`RestClient.ensureSuccess` reads body text once, then parses per status code (400→429→401→403→410), falling back to a KSeF-error-code check and then generic `KSeFApiError`.

### CI/CD

GitHub Actions workflows in `.github/workflows/` (the `.github/` dir stays at the repo root; build/test steps run root-level `yarn` scripts that delegate to the `ksef-client-ts` workspace):
- `ci.yml` — markdown lint + unit + E2E tests on Node 18/20/22 matrix, coverage badge via gist (coverage JSON read from `packages/ksef-client-ts/coverage/`)
- `release.yml` — on tag `v*`: create GitHub Release (from `packages/ksef-client-ts/CHANGELOG.md`), then publish to npm + GitHub Packages in parallel
- `deploy-docs.yml` — VitePress → GitHub Pages (artifact from `packages/ksef-client-ts/docs/.vitepress/dist`)
- `deno-smoke.yml` — Deno runtime smoke test (`deno task smoke`, run in the package dir)
- `codex-pr-review.yml` — automatic Codex PR review on open/sync (prompt: `.github/codex/prompts/review.md`)

### Documentation

VitePress site in `packages/ksef-client-ts/docs/` with Scalar API reference. Config: `packages/ksef-client-ts/docs/.vitepress/config.ts`.
Feature descriptions live in two places that must be kept in sync: the root `README.md` (bullet list — the canonical repo landing page on GitHub) and `packages/ksef-client-ts/docs/index.md` (VitePress homepage cards). The package `packages/ksef-client-ts/README.md` is intentionally a thin npm-only intro (install + quick start + links) and is NOT a mirror of the feature list — do not duplicate the full feature bullets there.

### Plans

`plans/` directory (gitignored) contains development plans and roadmaps. Not tracked in git.

- `plans/references.md` — reference-project comparison: maturity, crypto, feature gaps, KSeF API changelog
- `plans/shipped.md` — feature history by version
- `plans/backlog.md` — pending work, release proposals, deferred items
- `plans/p<priority>-<id>-<slug>.md` — individual feature sub-plans; each is cross-referenced from `backlog.md`

### Reference implementations

`ref/` directory (gitignored) contains reference implementations, official docs, and related projects. See `ref/ref-index.md` for the full index.

### WebCrypto typing quirk

`crypto.webcrypto.subtle.generateKey()` returns `CryptoKeyPair | CryptoKey`. Cast to `crypto.webcrypto.CryptoKeyPair` when generating key pairs — TypeScript cannot narrow this union.

## Rules

- Do not push commits or create files unless explicitly asked. Do not push to remote unless the user explicitly says "push" — committing and pushing are separate actions. Do not assume the user wants additional actions beyond what was requested.
- When writing CHANGELOG entries, describe the feature's purpose and user-facing impact, NOT implementation details. Keep entries concise — one sentence per bullet, no method names, class names, parameter names, option names, header names, CLI flags, internal field names, or error class identifiers. If an API version reference is useful (e.g. "KSeF API v2.2.0"), keep it in parentheses at the end.
- Always run the full test suite (unit + e2e) before committing. Ensure all tests pass before creating commits.
- When debugging issues, investigate root causes before suggesting surface-level fixes. Don't suggest simple retries or config changes without first checking if the value is hardcoded or the real problem is deeper.
- Always merge PRs with `--squash`. Merge commits are disabled on this repository.
- When squash-merging, edit the combined commit message to remove duplicate `Co-Authored-By` lines from individual commits — keep only a single `Co-Authored-By` at the very end.
- Name version branches with `version/` prefix (e.g. `version/v0.6.1`) to avoid conflicts with release tags.
- When writing documentation (README, docs/**, plans/**, CHANGELOG, etc.), always tag fenced code blocks containing ASCII tables, tree diagrams, or other non-code content with ` ```text ` instead of a bare ` ``` `. Reserve language-less fences only for genuinely untyped snippets.
