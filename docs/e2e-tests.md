# E2E Tests

End-to-end tests that run against the **KSeF TEST environment** (`https://api-test.ksef.mf.gov.pl`).

## Zero Secrets

All tests use **self-signed certificate authentication** — no API tokens, no env vars, no secrets needed.

The flow:
1. Generate a random valid NIP
2. Generate a self-signed RSA company seal certificate with `VATPL-{NIP}` in Subject DN
3. Sign an XAdES auth request and submit to KSeF
4. KSeF TEST accepts self-signed certs (`verifyCertificateChain=false`)

This means tests can run on any machine, any CI, without configuring credentials.

## Running

```bash
yarn test:e2e              # Run all e2e tests
yarn test:e2e:watch        # Watch mode
yarn vitest run tests/e2e/01-lighthouse.test.ts  # Single file
```

## Test Suites

| # | File | What it tests | Auth | Timeout |
|---|------|--------------|------|---------|
| 01 | `01-lighthouse.test.ts` | System status, messages | None | 30s |
| 02 | `02-auth-token.test.ts` | Token auth flow (challenge, encrypt, submit, access token, refresh) | Cert (bootstrap) + Token | 60s |
| 03 | `03-auth-xades.test.ts` | Cert generation (RSA/ECDSA), XAdES signing, full cert auth | Cert | 60s |
| 04 | `04-session-online.test.ts` | Online session lifecycle: open, send invoice, poll, close, UPO, get invoice. Negative test: wrong NIP (status 445) | Cert + Crypto | 180s |
| 05 | `05-session-batch.test.ts` | Batch session: 5 invoices in ZIP, upload, poll, verify all processed | Cert + Crypto | 300s |
| 06 | `06-invoices.test.ts` | Query invoice metadata, get invoice by KSeF number, async export with decrypt | Cert + Crypto | 300s |
| 07 | `07-permissions.test.ts` | Personal grants query, grant/query/revoke person permissions cycle | Cert | 120s |
| 08 | `08-tokens.test.ts` | Token generate/query/get/revoke lifecycle | Cert | 120s |
| 09 | `09-certificates.test.ts` | Certificate limits, full enrollment lifecycle (CSR, enroll, retrieve, revoke) | Cert | 120s |
| 10 | `10-limits.test.ts` | Context/subject/rate limits | Cert | 60s |
| 11 | `11-active-sessions.test.ts` | List active sessions, revoke current session | Cert | 120s |
| 12 | `12-test-data.test.ts` | TestData API: create/remove subjects and persons, grant/revoke permissions | Cert | 120s |
| 13 | `13-peppol.test.ts` | Query Peppol providers | Cert | 60s |

## Auth Helpers

Located in `tests/e2e/helpers/auth.ts`:

- **`authenticateWithCert(nip?)`** — Primary method. Generates random NIP + self-signed cert, calls `loginWithCertificate`. Returns `{ client, nip }`.
- **`authenticateWithCertAndCrypto(nip?)`** — Same + calls `crypto.init()` and returns `encryptionData` (cipherKey, cipherIv, encryptionInfo). Required for invoice send/export operations.
- **`createTestClient()`** — Creates `KSeFClient({ environment: 'TEST' })` without auth.

## Other Helpers

- **`helpers/identifiers.ts`** — `generateRandomNip()` (valid checksum, XSD-compliant), `generateRandomPesel()`, `generateUniqueInvoiceNumber()`
- **`helpers/invoices.ts`** — `prepareInvoiceXml()` loads FA_2/FA_3 XML templates from `fixtures/`, replaces `#nip#`, `#invoicing_date#`, `#invoice_number#`. `prepareAndEncryptInvoice()` also encrypts with AES-256-CBC.
- **`helpers/polling.ts`** — `pollUntil(action, condition, options)` — generic async poller for session status, auth status, export completion, etc.
- **`helpers/env.ts`** — `FIXTURE_DIR` path, `hasTokenAuth()` (only used internally).

## Fixtures

- `fixtures/invoice-fa2.xml` — FA(2) v1-0E invoice template
- `fixtures/invoice-fa3.xml` — FA(3) v1-0E invoice template

Placeholders: `#nip#`, `#invoicing_date#`, `#invoice_number#`.

## How Token Auth Test Works (02)

Since no env vars are available, the test bootstraps its own token:
1. `beforeAll`: authenticate via cert, call `tokens.generateToken()`, save the token string
2. Tests use the generated token for `loginWithToken`, manual step-by-step flow, and refresh

## Key Implementation Details

- **Auth status polling**: Both `loginWithToken()` and `loginWithCertificate()` in `src/client.ts` poll `getAuthStatus()` until status code is 200 before calling `getAccessToken()`. This prevents race conditions when KSeF is still processing the auth request.
- **`executeVoid()`**: `RestClient` has a dedicated `executeVoid()` method for API endpoints that return empty bodies (closeSession, revokeToken, TestData operations). This avoids `JSON.parse` errors on empty responses.
- **NIP validation**: `generateRandomNip()` follows the XSD `TNIP` pattern `[1-9]((\d[1-9])|([1-9]\d))\d{7}` — digits 2-3 cannot both be zero.
- **`crypto.init()` is NOT called by `loginWithCertificate()`** — tests that need encryption must call it explicitly via `authenticateWithCertAndCrypto()`.

## CI

GitHub Actions workflow at `.github/workflows/e2e.yml`:
- Triggers: push to `main` (src/tests changes), manual dispatch
- Single job, 30min timeout, no secrets required
