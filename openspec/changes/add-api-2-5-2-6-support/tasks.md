## 1. OpenAPI spec refresh (done)

- [x] 1.1 Refresh `docs/open-api.json` to v2.6.0 from `ref/ksef-docs`, re-run `yarn split-openapi`, `yarn sync-schemas`; `yarn check-api` passes (78/78). Committed as `5471556`.
- [x] 1.2 Confirmed wire field names against the refreshed spec: `PublicKeyCertificate` adds `certificateId` + `publicKeyId`; `EncryptionInfo.publicKeyId` and `InitTokenAuthenticationRequest.publicKeyId` (string, 44 chars, nullable); `CompressionType` enum `['Zip','TarGz']`; `BatchFileInfo.compressionType` + `InvoiceExportRequest.compressionType`.

## 2. publicKeyId & rotation-safe certificate selection

- [x] 2.1 Add `publicKeyId: string` and `certificateId: string` to `PublicKeyCertificate` (`src/models/crypto/types.ts`).
- [x] 2.2 Add `publicKeyId?: string` to `EncryptionInfo` (`src/models/common.ts`).
- [x] 2.3 Rewrite `CertificateFetcher.fetchCertificates()` (`src/crypto/certificate-fetcher.ts`): per usage, filter to currently-valid certs (`validFrom ≤ now < validTo`), pick latest `validFrom`; fall back to newest by `validFrom` if none valid. Cache `{ pem, publicKeyId }` per usage.
- [x] 2.4 Expose `getSymmetricKeyPublicKeyId()` / `getKsefTokenPublicKeyId()` on `CertificateFetcher`.
- [x] 2.5 `CryptographyService.getEncryptionData()` (`src/crypto/cryptography-service.ts`) includes the symmetric `publicKeyId` in the returned `EncryptionInfo`.
- [x] 2.6 Thread the ksef-token `publicKeyId` from `encryptKsefToken()` into the auth-ksef-token request model (`src/models/auth/types.ts`).
- [x] 2.7 Verify online session, batch session, and invoice export requests all carry `publicKeyId` in their encryption info (no extra change expected once `EncryptionInfo` has it — confirm each call-site).
- [x] 2.8 Add error code `21470` to the error-code enum and map it to a typed unknown-public-key error in the 400 branch of `RestClient.ensureSuccess` (`src/http/rest-client.ts`).
- [x] 2.9 Add refresh-and-retry-once recovery around encryption-bearing operations (token auth, session open, invoice export): on the typed 21470 error → `fetcher.refresh()` → rebuild encryption → retry once → rethrow on second failure. Decide shared helper vs inline (design Open Question).
- [x] 2.10 Unit tests: cert selection rotation scenarios (newest valid, expired/not-yet-valid ignored, no-valid fallback) + `publicKeyId` surfaced (`tests/unit/crypto/certificate-fetcher.test.ts`).
- [x] 2.11 Unit tests: `EncryptionInfo` carries `publicKeyId` (`tests/unit/crypto/cryptography-service.test.ts`); 21470 → typed error + refresh-retry path (`tests/unit/http/rest-client.test.ts`).

## 3. Drop deprecated RR query form type

- [x] 3.1 Remove `'RR'` from `FormType` in `src/models/invoices/types.ts` → `'FA' | 'PEF' | 'FA_RR'`.
- [x] 3.2 Update `scripts/generate-invoice-schemas.mjs:43,50` to drop the deleted `schemat_RR(1)_v1-1E.xsd` / `_v1-0E.xsd` entries (surviving file: `RR/schemat_FA_RR(1)_v1-1E.xsd`).
- [x] 3.3 Confirm `document-structures` `FA_RR_1_LEGACY`/`_TRANSITION` (`value: 'RR'`) are untouched (document system code, not query form type).
- [x] 3.4 `yarn lint` passes (catches any remaining `'RR'` form-type literal); existing invoice-query tests still pass.

## 4. TarGz compression

- [x] 4.1 Add `tar-stream` dependency to `package.json`; confirm pure-JS (no native bindings, keeps Deno/edge compat).
- [x] 4.2 Add shared `CompressionType = 'Zip' | 'TarGz'` (likely `src/models/common.ts`).
- [x] 4.3 Add `compressionType?: CompressionType` to `BatchFileInfo` (`src/models/sessions/batch-types.ts`) and `InvoiceExportRequest` (`src/models/invoices/types.ts`).
- [x] 4.4 Implement TarGz packing (`tar-stream` piped through `node:zlib.createGzip`) in/around `src/builders/batch-file.ts`; keep zip path as default.
- [x] 4.5 Thread compression choice through `uploadBatch()` (`src/workflows/batch-session-workflow.ts`) and the export path; ensure reported size/hash are computed over the produced archive.
- [~] 4.6 CLI flag deferred — the CLI batch path uploads raw per-file parts (no single archive to compress) and the CLI export is fire-and-forget (no download/extract step to thread compression through). TarGz is delivered at the SDK layer (`uploadBatch` / `exportInvoices` workflows). CLI wiring tracked as a follow-up.
- [x] 4.7 Unit tests: TarGz produces a valid gzip-wrapped tar; size/hash correct; zip default unchanged (`tests/unit/builders/batch-file.test.ts`).

## 5. X-System-Warning handler

- [x] 5.1 Add optional `onSystemWarning?: (warning: string) => void` to `RestClient` options.
- [x] 5.2 In `RestClient.execute()` (`src/http/rest-client.ts`), read the `X-System-Warning` response header; invoke the callback with the raw value if configured, else log at warn level. Never alter result.
- [x] 5.3 Document the callback in the resilience/options docs section.
- [x] 5.4 Unit tests: callback fires with raw value when header present; warn-log fallback; not called when absent (`tests/unit/http/rest-client.test.ts`).

## 6. AuthTokenRequest schema 2.1

- [x] 6.1 Bump `AUTH_TOKEN_REQUEST_NS` to `http://ksef.mf.gov.pl/auth/token/2.1` in `src/crypto/auth-xml-builder.ts:10` (no config flag).
- [x] 6.2 Update `tests/unit/crypto/auth-xml-builder.test.ts` assertions to expect the 2.1 namespace.

## 7. Release wrap-up

- [x] 7.1 CHANGELOG entries under `[0.9.0]` per project rules (user-facing impact, no internal identifiers; tag API version e.g. "(KSeF API v2.5.0)"); mark the `RR` removal as breaking.
- [x] 7.2 `yarn lint` clean; `yarn test` full unit suite green (incl. new tests); `yarn check-api` holds.
- [ ] 7.3 E2E against KSeF TEST: `tests/e2e/02-auth-token.test.ts` + a session-open run still pass; optionally a TarGz batch.
- [ ] 7.4 Verify `openspec validate "add-api-2-5-2-6-support"` is clean, then archive the change.
