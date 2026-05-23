## Why

KSeF API advanced to **v2.6.0** (through 2.5.0; PRD dates 2026-05-11 and 2026-05-26) and all four
active reference clients (C# 2.6.0, Java 3.0.26, smekcio Py 0.14.0, ksef2 0.16.0) adopted the same
contract changes within ~2 weeks. We ship none of them. The most urgent item is not new
functionality but a latent break: our public-certificate selection ignores validity windows and sends
no key selector, so once KSeF activates a key-rotation window our encrypted requests can be rejected
(`400 / 21470`). The OpenAPI spec has already been refreshed to v2.6.0 on this branch.

## What Changes

- **`publicKeyId` key-rotation selector** — encryption requests (`auth/ksef-token`, `sessions/online`,
  `sessions/batch`, `invoices/exports`) carry a `publicKeyId` identifying which KSeF public key was
  used. Certificate selection becomes rotation-safe (filter to currently-valid certs, pick the newest);
  the new `400 / 21470` ("key id unknown or revoked") triggers a certificate refresh and one retry.
- **`TarGz` compression** — batch upload and invoice export accept a `Zip | TarGz` compression choice;
  `Zip` remains the default (no behavior change for existing callers).
- **`X-System-Warning` handling** — the HTTP layer surfaces the optional `X-System-Warning` response
  header (non-fatal technical warnings) through a caller-supplied callback.
- **AuthTokenRequest schema 2.1** — the unsigned auth-token XML builder targets the
  `http://ksef.mf.gov.pl/auth/token/2.1` namespace (relaxed IP regexes), staying compatible with 2.0.
- **Drop deprecated `RR` query form type** — the invoice-query form-type filter no longer accepts `RR`
  (keep `FA`/`PEF`/`FA_RR`), matching the spec which removed it. **BREAKING** for any caller passing
  `'RR'` as a query form type.

## Capabilities

### New Capabilities

- `public-key-rotation`: how the client fetches KSeF public certificates, selects the correct one per
  usage under rotation (validity-window filtering + newest-wins), attaches the `publicKeyId` selector to
  every encryption request, and recovers from the `21470` unknown/revoked-key error.
- `archive-compression`: the `Zip | TarGz` compression-type option for batch-upload and invoice-export
  packages, including how `TarGz` archives are produced, with `Zip` as the backward-compatible default.

### Modified Capabilities

- `http-transport`: add surfacing of the `X-System-Warning` response header via an optional callback.
- `external-signing`: the unsigned auth-token request XML targets the `auth/token/2.1` namespace
  (previously hardcoded to `2.0`).

## Impact

- **Code**: `src/crypto/certificate-fetcher.ts`, `src/crypto/cryptography-service.ts`,
  `src/crypto/auth-xml-builder.ts`, `src/http/rest-client.ts`, `src/builders/batch-file.ts`,
  `src/workflows/batch-session-workflow.ts`, `src/cli/commands/invoice.ts`, plus models in
  `src/models/{crypto,common,sessions,invoices,auth}/`.
- **Public API / types**: `PublicKeyCertificate` (+`publicKeyId`/`certificateId`), `EncryptionInfo`
  (+`publicKeyId`), `BatchFileInfo`/`InvoiceExportRequest` (+`compressionType`), `RestClient` options
  (+`onSystemWarning`), `FormType` (remove `'RR'` — breaking).
- **Dependencies**: `TarGz` needs tar packing (gzip is native via `node:zlib`); decide between a small
  dep (e.g. `tar-stream`) and a hand-rolled tar writer in design.
- **Tooling/docs**: `docs/open-api.json` already refreshed to v2.6.0 (done); `scripts/generate-invoice-schemas.mjs`
  still references the deleted `schemat_RR(1)` XSDs and must be updated.
- **No new endpoints** — `yarn check-api` confirms route coverage is unchanged (78/78); all changes are
  field-level.
- **Reference**: engineering design and `file:line` map live in `plans/p2-9-api-2.5-2.6-catchup.md`.
