## 1. Offline Invoice Types

- [ ] 1.1 Create `src/offline/types.ts` with `OfflineMode`, `OfflineReason`, `OfflineInvoiceStatus` types, `OfflineInvoiceMetadata` interface, `MaintenanceWindow` interface, and `getOfflineReason()` mapping function
- [ ] 1.2 Create `src/offline/deadline.ts` with `calculateOfflineDeadline()` (4 mode rules + custom callback) and `extendDeadlineForMaintenance()` (never-shorten logic)
- [ ] 1.3 Create `src/offline/index.ts` barrel export
- [ ] 1.4 Write unit tests for `getOfflineReason()` — all 4 mode→reason mappings
- [ ] 1.5 Write unit tests for `calculateOfflineDeadline()` — offline24 (+24h), offline with/without maintenance window, awaryjny fallback (7 days), awaria_calkowita (null), custom callback override
- [ ] 1.6 Write unit tests for `extendDeadlineForMaintenance()` — extend with later window, preserve with earlier window, null endTime passthrough

## 2. Offline Invoice Storage

- [ ] 2.1 Create `src/offline/storage.ts` with `OfflineInvoiceFilter` interface and `OfflineInvoiceStorage` interface (save/get/list/update/delete)
- [ ] 2.2 Create `src/offline/in-memory-storage.ts` with `InMemoryOfflineInvoiceStorage` implementing the interface using `Map<string, OfflineInvoiceMetadata>`, including filter logic for status/mode/expiringBefore
- [ ] 2.3 Write unit tests for `InMemoryOfflineInvoiceStorage` — CRUD operations, filter by status, filter by mode, filter by expiringBefore, combined filters, empty filter returns all, null submitBy excluded from expiration filter, update non-existent throws

## 3. Offline QR KOD II

- [ ] 3.1 Create `src/qr/offline-qr-service.ts` with `generateOfflineQRCodes()` function and `OfflineInvoiceQRCodes` type. Use existing `VerificationLinkService` for URLs and `QrCodeService` for PNG generation. Add certificate type validation (reject Authentication, accept Offline, skip if not provided)
- [ ] 3.2 Export new types and function from `src/qr/index.ts`
- [ ] 3.3 Write unit tests for `generateOfflineQRCodes()` — dual QR generation with RSA key, dual QR with EC key, correct labels (OFFLINE/CERTYFIKAT), certificate type validation (reject Authentication), URL format verification, base64url encoding

## 4. Offline Workflow

- [ ] 4.1 Create `src/workflows/offline-invoice-workflow.ts` with `generateOfflineInvoice()` — compute SHA-256 hash, create metadata, optionally generate QR codes, optionally save to storage. Define `GenerateOfflineInvoiceResult` type
- [ ] 4.2 Add `queueOfflineInvoices()` — transition Generated→Queued with optional filter, return count
- [ ] 4.3 Add `getExpiringInvoices()` — query storage for invoices expiring within N hours, exclude Submitted+ and null-deadline
- [ ] 4.4 Add `submitOfflineInvoices()` — load from storage, open session with offlineMode, send invoices, poll UPO, update statuses (Accepted/Rejected). Support batch and online modes, continueOnError flag. Define `SubmitOfflineInvoicesResult` type
- [ ] 4.5 Export all workflow functions and types from `src/workflows/index.ts`
- [ ] 4.6 Write unit tests for `generateOfflineInvoice()` — with/without certificate, with/without storage, awaria_calkowita (no QR, null deadline), hash computation
- [ ] 4.7 Write unit tests for `queueOfflineInvoices()` — queue all, queue by filter, empty result
- [ ] 4.8 Write unit tests for `getExpiringInvoices()` — within window, outside window, exclude submitted, exclude null deadline
- [ ] 4.9 Write unit tests for `submitOfflineInvoices()` — batch submission with mocked client, online submission, empty queue, continueOnError, rejection handling

## 5. CLI: Offline Command Group

- [ ] 5.1 Create `src/cli/commands/offline.ts` with `offlineCommand` group and `generate` subcommand — read XML file, call `generateOfflineInvoice()`, write QR PNGs to out-dir, display summary
- [ ] 5.2 Add `list` subcommand — load JSON store, apply status/mode/expiring-within filters, display table or JSON
- [ ] 5.3 Add `queue` subcommand — load JSON store, call `queueOfflineInvoices()`, save store, display count
- [ ] 5.4 Add `submit` subcommand — load JSON store, require auth session, call `submitOfflineInvoices()`, save store, display results summary
- [ ] 5.5 Add `status` subcommand — load JSON store, find by ID, display key-value pairs or JSON
- [ ] 5.6 Register `offlineCommand` in `src/cli/index.ts`
- [ ] 5.7 Write unit tests for `generate` subcommand — file read, QR output, JSON mode, missing file error, invalid mode error
- [ ] 5.8 Write unit tests for `list`, `queue`, `status` subcommands — table output, filters, empty store
- [ ] 5.9 Write unit tests for `submit` subcommand — auth check, batch/online modes, success/failure output

## 6. CLI: Extend Existing Commands

- [ ] 6.1 Add `--offline` flag to `ksef qr invoice` command with `--certificate` and `--cert-serial` requirements. When set, generate dual QR set (KOD I + KOD II), output to dir or JSON
- [ ] 6.2 Add `--offline-mode` flag to `ksef session open` — persist in session store alongside session ref
- [ ] 6.3 Add `--offline-mode` / `--no-offline-mode` flags to `ksef session send` — set `offlineMode: true` on `SendInvoiceRequest`, auto-apply from session if opened with `--offline-mode`
- [ ] 6.4 Write unit tests for `ksef qr invoice --offline` — dual output, missing certificate error, JSON format
- [ ] 6.5 Write unit tests for `ksef session open --offline-mode` and `ksef session send --offline-mode` — flag persistence, auto-apply, override

## 7. Integration & Exports

- [ ] 7.1 Re-export offline types from `src/models/index.ts` for public API consumers
- [ ] 7.2 Verify `yarn build` succeeds with all new modules (ESM + CJS + DTS)
- [ ] 7.3 Run full test suite `yarn test` — all existing + new tests pass
- [ ] 7.4 Run `yarn lint` — no type errors
