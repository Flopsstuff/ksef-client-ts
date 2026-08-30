# Tests

Test infrastructure for `ksef-client-ts`: unit tests (vitest, mocked) and E2E tests (against live KSeF TEST environment).

## Overview

All tests use **vitest** and live in the `tests/` directory:

- **Unit tests** (`tests/unit/`) — mocked, no network access. Cover services, HTTP layer, crypto, CLI, builders, validation, workflows, and error hierarchy.
- **E2E tests** (`tests/e2e/`) — run against the live KSeF TEST environment (`api-test.ksef.mf.gov.pl`). No secrets needed — all auth uses self-signed certificates.

## Running

```bash
yarn test                # Unit tests (tests/unit)
yarn test:watch          # Unit tests in watch mode
yarn test:e2e            # E2E tests (tests/e2e)
yarn vitest run tests/unit/services/auth.test.ts   # Single file
```

---

## Unit Tests

157 test files, 2905 tests. Located in `tests/unit/`. All service/HTTP calls are mocked — no network access, fast execution.

### Coverage by Area

| Area | Files | What is tested |
|------|-------|----------------|
| **cli** | 34 | All 17 command groups, client factory, config/session store, error handler, output formatting |
| **services** | 14 | All 14 API services — request construction, response parsing, error propagation |
| **http** | 10 | RestClient, RetryPolicy (backoff, jitter), RateLimitPolicy (token bucket), PresignedUrlPolicy, AuthManager (401 refresh), transport, RestRequest builder, KSeF feature constants, circuit breaker |
| **workflows** | 10 | Auth workflow, online/batch session, invoice export, incremental export, HWM coordinator, polling utility |
| **errors** | 9 | Full error hierarchy — KSeFError, ApiError, RateLimitError, UnauthorizedError (ProblemDetails), ForbiddenError (reasonCode), batch timeout |
| **crypto** | 8 | CryptographyService (AES, RSA, ECDH, CSR), SignatureService (XAdES), CertificateService (self-signed), CertificateFetcher, PKCS#12 loader, auth XML builder |
| **validation** | 10 | Regex patterns + checksum validators (NIP, PESEL, KSeF number CRC-8), constraints, char validity, XSD validation helpers |
| **xml** | 9 | FA2/FA3/PEF builders, invoice serializer, XSD validation, property ordering |
| **pdf** | 29 | Template DSL validation and interpretation, every block renderer, the built-in layouts against fixtures, document flags, formatters, i18n bundles, QR derivation and sizing, font loading, strict mode |
| **utils** | 7 | Concurrency helpers, filesystem utilities, hashing, date/time helpers |
| **builders** | 5 | AuthTokenRequest, AuthKsefTokenRequest, InvoiceQueryFilter, Permissions (person/entity/authorization), batch file |
| **offline** | 4 | Offline invoice deadlines, file storage, holiday calendar, workflow orchestration |
| **qr** | 3 | QrCodeService (PNG/SVG), VerificationLinkService (Code I/II URLs), environment QR URLs |
| **config** | 2 | Environment resolution, options defaults |
| **models** | 2 | Document structure types, token permission models |
| **client** | 1 | KSeFClient initialization, service wiring, login/logout orchestration |

### Conventions

- Mock `RestClient.execute` or `RestClient.executeRaw` to verify request construction
- Test both success paths and error paths (wrong status codes, missing fields)
- Builders test validation: required fields, constraints, edge cases
- Crypto tests use real crypto operations (key generation, signing, encrypt/decrypt)

---

## E2E Tests

36 test files running against the live **KSeF TEST** environment. No API tokens or env vars needed.

### Zero Secrets

All tests use **self-signed certificate authentication**:

1. Generate a random valid NIP
2. Generate a self-signed RSA company seal certificate with `VATPL-{NIP}` in Subject DN
3. Sign an XAdES auth request and submit to KSeF
4. KSeF TEST accepts self-signed certs (`verifyCertificateChain=false`)

This means tests can run on any machine, any CI, without configuring credentials.

### Test Suites

| # | File | What it tests | Auth | Timeout |
|---|------|--------------|------|---------|
| 01 | `01-lighthouse.test.ts` | System status, messages | None | 30s |
| 02 | `02-auth-token.test.ts` | Token auth flow (challenge, encrypt, submit, access token, refresh) | Cert (bootstrap) + Token | 60s |
| 03 | `03-auth-xades.test.ts` | Cert generation (RSA/ECDSA), XAdES signing, full cert auth | Cert | 60s |
| 04 | `04-session-online.test.ts` | Online session lifecycle: open, send, poll, close, UPO, get invoice. Negative: wrong NIP (445) | Cert + Crypto | 180s |
| 05 | `05-session-batch.test.ts` | Batch session: 5 invoices in ZIP, upload, poll, verify all processed | Cert + Crypto | 300s |
| 06 | `06-invoices.test.ts` | Query metadata, get by KSeF number, async export with decrypt | Cert + Crypto | 300s |
| 07 | `07-permissions.test.ts` | Personal grants query, grant/query/revoke person permissions cycle | Cert | 120s |
| 08 | `08-tokens.test.ts` | Token generate/query/get/revoke lifecycle | Cert | 120s |
| 09 | `09-certificates.test.ts` | Certificate limits, full enrollment lifecycle (CSR, enroll, retrieve, revoke) | Cert | 120s |
| 10 | `10-limits.test.ts` | Context/subject/rate limits | Cert | 60s |
| 11 | `11-active-sessions.test.ts` | List active sessions, revoke current session | Cert | 120s |
| 12 | `12-test-data.test.ts` | TestData API: create/remove subjects and persons, grant/revoke permissions | Cert | 120s |
| 13 | `13-peppol.test.ts` | Query Peppol providers | Cert | 60s |
| 14 | `14-permissions-entity.test.ts` | Entity permission grants | Cert | 120s |
| 15 | `15-permissions-authorization.test.ts` | Authorization permission grants | Cert | 120s |
| 16 | `16-permissions-eu-entity.test.ts` | EU entity permission grants | Cert | 120s |
| 17 | `17-permissions-subunit.test.ts` | Subunit permission grants | Cert | 120s |
| 18 | `18-permissions-indirect.test.ts` | Indirect permission grants | Cert | 120s |
| 19 | `19-test-data-limits.test.ts` | TestData API limits | Cert | 120s |
| 20 | `20-workflow-auth.test.ts` | High-level auth workflow | Cert | 120s |
| 21 | `21-workflow-online-session.test.ts` | High-level online session workflow | Cert + Crypto | 300s |
| 22 | `22-workflow-invoice-export.test.ts` | High-level invoice export workflow | Cert + Crypto | 300s |
| 23 | `23-workflow-incremental-export.test.ts` | Incremental export workflow | Cert + Crypto | 300s |
| 24 | `24-workflow-external-signing.test.ts` | External XAdES signing workflow | Cert | 120s |
| 25 | `25-error-handling.test.ts` | API error handling paths | Cert | 120s |
| 26 | `26-duplicate-invoice.test.ts` | Duplicate invoice rejection | Cert + Crypto | 180s |
| 27 | `27-enforcement.test.ts` | Permission enforcement | Cert | 120s |
| 28 | `28-upo-parsing.test.ts` | UPO XML parsing | Cert + Crypto | 180s |
| 29 | `29-technical-correction.test.ts` | Technical correction invoices | Cert + Crypto | 180s |
| 30 | `30-rr-invoicing.test.ts` | FA_RR invoicing | Cert + Crypto | 180s |
| 31 | `31-invoice-build-cli-smoke.test.ts` | `ksef invoice build` CLI smoke | Cert | 60s |
| 31 | `31-self-invoicing.test.ts` | Self-invoicing flow | Cert + Crypto | 180s |
| 32 | `32-invoice-build-send.test.ts` | Build and send invoice via CLI | Cert + Crypto | 180s |
| 32 | `32-offline-invoice.test.ts` | Offline invoice lifecycle | Cert + Crypto | 300s |
| 33 | `33-xml-serialization.test.ts` | Invoice XML serialization round-trip | None | 60s |
| 34 | `34-collective-identifiers.test.ts` | Collective identifier lifecycle | Cert + Crypto | 180s |
| 35 | `35-invoice-pdf-cli.test.ts` | `ksef invoice pdf` through the built CLI: the whole preview set, plus the inputs it refuses | None | 120s |
| 36 | `36-invoice-pdf-library.test.ts` | The same rendering through `ksef-client-ts/pdf`: template objects, supplied QR URLs, every render option | None | 120s |

### The PDF Specs (35, 36)

Both are exceptions to everything above: they authenticate against nothing and reach the network at no point — a render reads a local document and writes bytes. They need `yarn build` first, because 35 drives the built CLI (`dist/cli.js`) and 36 imports the built package.

They also leave something behind on purpose. Each writes a numbered set of PDFs into `.pdf-preview/` (override with `KSEF_PDF_OUT`), distinguished by a `cli-`/`lib-` prefix, so the pages can be opened and judged by eye after a run. The assertions themselves are deliberately shallow — a file appears and is a structurally complete PDF — because asserting on glyph positions breaks on every deliberate design change while saying nothing about whether the page reads well. What they do catch is the class of failure unit tests cannot see: a template that stops validating at import, a bundling regression that drops the fonts, a flag that stops being wired, an optional peer that fails to load.

### Auth Helpers

Located in `tests/e2e/helpers/auth.ts`:

- **`authenticateWithCert(nip?)`** — Primary method. Generates random NIP + self-signed cert, calls `loginWithCertificate`. Returns `{ client, nip }`.
- **`authenticateWithCertAndCrypto(nip?)`** — Same + calls `crypto.init()` and returns `encryptionData` (cipherKey, cipherIv, encryptionInfo). Required for invoice send/export operations.
- **`createTestClient()`** — Creates `KSeFClient({ environment: 'TEST' })` without auth.

### Other Helpers

- **`helpers/identifiers.ts`** — `generateRandomNip()` (valid checksum, XSD-compliant), `generateRandomPesel()`, `generateUniqueInvoiceNumber()`
- **`helpers/invoices.ts`** — `prepareInvoiceXml()` loads FA_2/FA_3 XML templates from `fixtures/`, replaces `#nip#`, `#invoicing_date#`, `#invoice_number#`. `prepareAndEncryptInvoice()` also encrypts with AES-256-CBC.
- **`helpers/polling.ts`** — `pollUntil(action, condition, options)` — generic async poller for session status, auth status, export completion, etc.
- **`helpers/env.ts`** — `FIXTURE_DIR` path, `hasTokenAuth()` (only used internally).

### Fixtures

- `fixtures/invoice-fa2.xml` — FA(2) v1-0E invoice template
- `fixtures/invoice-fa3.xml` — FA(3) v1-0E invoice template

Placeholders: `#nip#`, `#invoicing_date#`, `#invoice_number#`.

### How Token Auth Test Works (02)

Since no env vars are available, the test bootstraps its own token:

1. `beforeAll`: authenticate via cert, call `tokens.generateToken()`, save the token string
2. Tests use the generated token for `loginWithToken`, manual step-by-step flow, and refresh

### Key Implementation Details

- **Auth status polling**: Both `loginWithToken()` and `loginWithCertificate()` in `src/client.ts` poll `getAuthStatus()` until status code is 200 before calling `getAccessToken()`. This prevents race conditions when KSeF is still processing the auth request.
- **`executeVoid()`**: `RestClient` has a dedicated `executeVoid()` method for API endpoints that return empty bodies (closeSession, revokeToken, TestData operations). This avoids `JSON.parse` errors on empty responses.
- **NIP validation**: `generateRandomNip()` follows the XSD `TNIP` pattern `[1-9]((\d[1-9])|([1-9]\d))\d{7}` — digits 2-3 cannot both be zero.
- **`crypto.init()` is NOT called by `loginWithCertificate()`** — tests that need encryption must call it explicitly via `authenticateWithCertAndCrypto()`.

---

## CI

GitHub Actions workflow at `.github/workflows/ci.yml` (consolidated):

- Triggers: push to `main` (src/tests changes), pull requests, manual dispatch
- **Unit tests**: Node 18/20/22 matrix, coverage badge via gist
- **E2E tests**: against KSeF TEST environment, 30min timeout, no secrets required
