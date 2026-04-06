# Changelog

All notable changes to this project will be documented in this file.

## [0.6.1] - 2026-04-06

### Added
- **Session state serialization** — online sessions can now be serialized to JSON via `handle.getState()` and restored with `resumeOnlineSession(client, state)`. Enables fault-tolerant invoice sending across process restarts without re-opening sessions.
- **File hash verification** — downloaded invoices and export parts are now verified against the SHA-256 hash from the `x-ms-meta-hash` response header. Export workflows verify encrypted part integrity by default (opt out with `verifyHash: false`). `getInvoice()` returns the hash alongside the XML for caller-side verification.
- **Documentation** — new VitePress page: Polish Holidays reference with full holiday list, calculation details, and usage examples.

### Fixed
- **Polish holidays in deadline calculation** — `nextBusinessDay()` and `addBusinessDays()` now skip 14 Polish statutory holidays (9 fixed + 4 Easter-based + Wigilia since 2025), not just weekends. Fixes legally incorrect deadlines that could fall on holidays like Christmas or Corpus Christi.

## [0.6.0] - 2026-04-05

### Added
- **Offline invoice mode** — full lifecycle for offline invoices: generate locally with QR KOD I + KOD II codes, store in `~/.ksef/offline/`, track submission deadlines, submit to KSeF when available. Supports all 4 KSeF offline modes (`offline24`, `offline`, `awaryjny`, `awaria_calkowita`) with business day deadline calculation and maintenance window cascading.
- **Technical correction** — resubmit rejected offline invoices with automatic hash-based linking to the original.
- **CLI `ksef offline`** — 6 subcommands: `generate`, `list`, `status`, `submit`, `correct`, `delete` for managing offline invoices from the terminal.
- **CLI `ksef qr invoice --offline`** — generates KOD I QR with "OFFLINE" label for SVG output.
- **Documentation** — new VitePress page: Offline Mode.

## [0.5.2] - 2026-04-05

### Added
- **Batch invoice validation** — `--validate` flag now works for directory batch sends in CLI and `validate` option in programmatic `uploadBatch()`. Invalid invoices are caught before upload with per-file error reporting.
- **OnlyMetadata export** — `--onlyMetadata` flag for `invoice export` and `invoice export-incremental` CLI commands to download metadata without invoice XML files.
- **`SCHEMA_TYPES` runtime array** — exported list of all valid schema type identifiers for runtime use.

### Fixed
- **Strict Invoice validation** — unknown XML elements not defined in KSeF schemas now rejected client-side instead of silently passing through to KSeF (error 450).

## [0.5.1] - 2026-03-30

### Added
- **Interactive setup wizard** — `ksef setup` guides users through NIP configuration, authentication, and optional API token generation in a single interactive session. Supports self-signed certificate quick auth on the test environment and external signature flow for demo/production.
- **Credentials store** — persistent storage for long-lived API tokens in `~/.ksef/credentials.json`, separate from session and config files. Tokens saved during setup or manually are automatically used by `ksef auth login` as a fallback when `--token` is not provided.
- **Cross-platform folder opener** — `ksef setup` opens the `~/.ksef/` folder in the system file manager during external signing to streamline the workflow.
- **Automatic session recovery** — all CLI commands automatically restore expired sessions by refreshing the token or re-authenticating with stored credentials. No more manual `ksef auth login` after session expiry.
- **Future invoice date validation** — invoice validator now rejects P_1 (invoice issue date) set in the future, which KSeF silently rejects with a 445 error.

### Fixed
- **Encryption key mismatch on invoice send** — `ksef session open` and `ksef invoice send` each generated independent AES-256 keys, causing KSeF to reject every invoice with status 445. Encryption keys are now persisted in the session store and reused across commands.

## [0.5.0] - 2026-03-29

### Added
- **Invoice XML validation** — client-side validation of invoice XML against official KSeF XSD schemas before submission. Three levels: XML well-formedness, Zod schema validation (generated from XSD at build time), and business rules (NIP/PESEL checksums). Auto-detects schema type from XML namespace. Supports all 6 invoice types (FA2, FA3, PEF3, PEF_KOR3, RR v1-0E, RR v1-1E). Available via `ksef invoice validate` CLI command, programmatic `validate()` API, and opt-in `--validate` flag on `ksef invoice send`.
- **Official XSD invoice schemas** — all KSeF invoice XSD schemas (FA, PEF, RR) bundled in `docs/schemas/` with `yarn sync-schemas` to update from the official Ministry of Finance repository.
- **Encrypted PEM key support** — `--key-password` option for `ksef auth login` to use encrypted PEM private keys without manual decryption.
- **`whoami` identity context** — `ksef auth whoami` now displays NIP, auth method, permissions, and token type parsed from the JWT access token. Full context available in `--json` mode.
- **Advanced E2E scenarios** — RR invoicing (FA-RR agricultural invoice lifecycle), self-invoicing (buyer-seller cross-entity flow with seller verification), enforcement operations, technical corrections, incremental export with HWM, and duplicate invoice detection.
### Changed
- **Default form code switched to FA(3)** — CLI commands, workflows, and E2E tests now default to FA(3), the invoice schema required by KSeF on DEMO and PROD since February 2026. FA(2) remains available via `--form-code FA2` for backward compatibility.
- **CLI defaults to PROD environment** — `ksef` commands now target the production KSeF API when `--env` is not specified. Use `--env test` or `ksef config set --env test` for development. The library (`KSeFClient`) still defaults to TEST as a safety measure.
### Fixed
- **CLI date format** — `--from` and `--to` date arguments in `invoice query`, `invoice export`, and `invoice export-incremental` are now normalized to full ISO-8601 datetime, fixing HTTP 400 errors when using short `YYYY-MM-DD` format.

## [0.4.0] - 2026-03-28

### Added
- **External signing support** — `buildUnsignedAuthTokenRequestXml()` generates unsigned KSeF auth XML for external signing (HSM, EPUAP, smart cards). Supports all 4 context identifier types. Includes `authenticateWithExternalSignature()` callback-based workflow and CLI `ksef auth login-external` with two-phase `--generate` / `--submit` flow.
- **Multiple document structures** — `SystemCode` enum (FA v2/v3, PEF, PEF_KOR, FA_RR), typed `FORM_CODES` constants (7 variants), session-type constrained unions, helper functions (`getFormCode`, `parseFormCode`, `validateFormCodeForSession`), InvoiceType mapping per document type. CLI `--form-code` option on `ksef session open` and `ksef invoice send` with PEF batch rejection.
- **Stream-based batch upload** — `uploadBatchStream()` workflow with constant memory usage via Web Streams API. Stream-based AES-256-CBC encryption, SHA-256 hashing, and ZIP splitting with two-pass stream factory pattern. Sequential part upload for O(max_part_size) memory. CLI `--stream` flag on `ksef invoice send` for .zip files.
- **Incremental export (HWM)** — iterative export of invoices with automatic high-water-mark tracking. Resumes from the last processed date across runs, handles truncated results with multiple iterations, and saves state to a JSON file for reliable long-running syncs. Includes CLI command and pluggable storage for custom integrations.
- **UPO XML parsing** — parse official KSeF receipt confirmations (UPO) into structured typed objects. Supports all authentication context variants and multi-document session receipts. Integrated into online and batch session workflows, with `--parsed` CLI option for JSON output.
- **ZIP bomb protection** — safe `unzip()` / `createZip()` with configurable limits (file count, total/per-file size, compression ratio). Export workflow supports opt-in extraction via `extract` option.
- **Documentation** — 6 new VitePress pages: Workflows, Batch Processing, HTTP Resilience, Cryptography, QR Codes, Validation & Data Integrity.
- **E2E test expansion** — 6 new E2E tests across 4 files
### Changed
- TBD
### Fixed
- **Incremental export decryption** — `incrementalExportAndDownload` used its own AES key instead of the one from `doExport`, causing `bad decrypt` on downloaded parts.
- **DEFAULT_FORM_CODE** — `systemCode`/`schemaVersion`/`value` fields were swapped in both workflow files; corrected to match OpenAPI spec (`FA (2)` / `1-0E` / `FA`).
- **CLI version** — `ksef --version` was hardcoded to `0.1.0`; now reads from `package.json` at runtime.

## [0.3.0] - 2026-03-25

### Added
- **Test data environment guard** — `TestDataService` now throws `KSeFError` when called on DEMO or PROD environments.
- **Batch auto-split** — `BatchFileBuilder` automatically splits large ZIP files into parts (100 MB default), encrypts each part with AES-256-CBC, and computes SHA-256 hashes.
- **E2E test coverage expansion** — 5 new E2E test suites: test-data limits & attachments, workflow auth, online session workflow, invoice export workflow, error handling. Existing suites extended with additional assertions.

### Changed
- **`uploadBatch()` API** — now accepts raw `Uint8Array` ZIP data instead of separate encryption parameters. Encryption, splitting, and hash computation are handled internally by `BatchFileBuilder`.

### Fixed
- **Export workflow** — `exportAndDownload()` now correctly initializes crypto before decrypting parts.
- **Session polling** — `waitForUpo()` now checks for terminal status codes (200 or >=400) instead of just "not 100".

## [0.2.0] - 2026-03-22

### Added
- **Workflows** — high-level orchestration functions for multi-step KSeF operations:
  - `openOnlineSession()` / `openSendAndClose()` — online session: open, send invoices, close, poll UPO.
  - `uploadBatch()` — batch session: open, upload parts, close, poll UPO.
  - `exportInvoices()` / `exportAndDownload()` — invoice export: initiate, poll status, download and decrypt parts.
  - `authenticateWithToken()` / `authenticateWithCertificate()` / `authenticateWithPkcs12()` — full auth flow orchestration.
  - Shared `pollUntil()` utility extracted from E2E helpers.
- **UPO versioning** — type-safe `UpoVersion` constants (`V4_2`, `V4_3`) and `KSEF_FEATURE_HEADER` for `X-KSeF-Feature` header support on session open requests.
- **XAdES compliance header** — `enforceXadesCompliance` parameter on `AuthService.submitXadesAuthRequest()` with `ENFORCE_XADES_COMPLIANCE` constant.
- **KSeF number CRC-8 validation** — `isValidKsefNumber()` now verifies CRC-8 checksum (polynomial 0x07) per official KSeF spec. New `isValidKsefNumberV35()` and `isValidKsefNumberV36()` validators for version-specific formats.

### Fixed
- Added missing `context-type-not-allowed` literal to `ForbiddenReasonCode` type union (aligns with OpenAPI spec).

## [0.1.1] - 2026-03-22

### Added
- PKCS#12 authentication support (`src/crypto/pkcs12-loader.ts`) for certificate-based login.
- Full E2E test suite — 13 base suites + 5 permission suites (18 files total), zero secrets in code.
- E2E test helpers: auth, env, identifiers, invoices, polling; FA2/FA3 invoice fixtures.
- `scripts/check-openapi-coverage.mjs` to validate OpenAPI spec coverage.
- `scripts/whoami.ts` diagnostic script.
- GitHub Actions: `release.yml` (automated releases from `v*` tags), `e2e.yml` (E2E tests).
- E2E test documentation (`docs/e2e-tests.md`).
- Installation instructions in README.

### Changed
- Updated OpenAPI source to KSeF API version `2.3.0`.
- Renamed `PRD` environment to `PROD` across the codebase.
- Aligned `TestData` service with OpenAPI spec — methods return `void` instead of `OperationStatusInfo`.
- Refactored status handling and type definitions across services.
- Updated invoice types: replaced deprecated `RR` usage with `FA_RR`.
- Improved NIP/PESEL validation patterns.
- Updated bearer auth scheme casing in the OpenAPI definition.

## [0.1.0] - 2026-03-22

### Added
- Initial public release of `ksef-client-ts` on npm.
- OpenAPI source to KSeF API version `2.2.1`
- TypeScript client for KSeF API v2 with typed models and service-based API.
- Dual ESM/CJS build output with generated type declarations.
- Built-in CLI (`ksef`) with command groups for common KSeF operations.
- Documentation site powered by VitePress.

## Info
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Format:
```
## [{VERSION}] - {DATE}

### Added
- TBD
### Changed
- TBD
### Fixed
- TBD
```

