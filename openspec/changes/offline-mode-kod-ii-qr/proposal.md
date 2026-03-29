## Why

All four reference implementations (C#, Java, lkow TS, smekcio TS) support offline invoicing — our project is the only one without it. Offline mode is mandatory for KSeF 2.0 compliance (effective Feb 1, 2026): taxpayers must issue invoices locally when KSeF is unavailable and submit them later with proper QR codes (KOD I + KOD II). This is the largest remaining feature gap identified in the reference comparison plan (P3.1).

## What Changes

- Add offline invoice types: 4 modes (`offline24`, `offline`, `awaryjny`, `awaria_calkowita`), status lifecycle (`GENERATED` → `QUEUED` → `SUBMITTED` → `ACCEPTED` / `REJECTED` / `EXPIRED`), and offline invoice metadata
- Add pluggable offline invoice storage with `OfflineInvoiceStorage` interface and `InMemoryOfflineInvoiceStorage` reference implementation
- Add deadline calculation for each offline mode with maintenance window extension support
- Add KOD II (certificate verification) QR code signing with RSA-PSS and ECDSA-P256, auto-detecting key type from PEM
- Add offline invoice workflow: generate metadata locally, create dual QR set (KOD I + KOD II), store, queue for submission, submit via online/batch session with `offlineMode: true`, resume polling
- Add CLI commands for offline invoice lifecycle: generate, list, queue, submit, status
- Extend existing `ksef qr` CLI to generate dual QR code sets for offline invoices

## Capabilities

### New Capabilities

- `offline-invoice-types`: Offline mode enum (4 modes), offline reason, status lifecycle (6 states), `OfflineInvoiceMetadata` model, `MaintenanceWindow` type, deadline calculation logic with maintenance window extension
- `offline-invoice-storage`: `OfflineInvoiceStorage` interface (save/get/list/update/delete with filtering by status, mode, expiration), `InMemoryOfflineInvoiceStorage` reference implementation
- `offline-qr-kod-ii`: KOD II certificate verification URL construction and cryptographic signing (RSA-PSS SHA-256 + ECDSA-P256 IEEE P1363), auto-detection of key type, dual QR set generation (KOD I + KOD II) for offline invoices, label rules ("OFFLINE" for KOD I, "CERTYFIKAT" for KOD II)
- `offline-workflow`: Offline invoice workflow orchestrating: metadata generation, QR code creation, storage, batch queuing, submission via online/batch session with `offlineMode: true`, deferred UPO polling, deadline monitoring
- `cli-offline`: CLI command group `ksef offline` with subcommands: generate (create offline invoice metadata + QR codes), list (filter by status/mode/expiration), queue (mark for submission), submit (batch send queued invoices), status (check submission results)

### Modified Capabilities

- `cli-qr`: Add `--offline` flag and `--certificate` option to generate dual QR sets (KOD I + KOD II) for offline invoices
- `cli-session`: Add `--offline-mode` flag to `ksef session open` and `ksef session send` for submitting offline invoices via existing session commands

## Impact

- **New directory**: `src/offline/` — types, storage, deadline calculation
- **Extended**: `src/qr/verification-link-service.ts` — already has `buildCertificateVerificationUrl()` with RSA-PSS/ECDSA signing; needs integration with offline metadata for dual QR set generation
- **Extended**: `src/workflows/` — new `offline-invoice-workflow.ts` orchestrating the full lifecycle
- **Extended**: `src/cli/commands/` — new `offline.ts` command group, modifications to `qr.ts` and `session.ts`
- **Extended**: `src/models/` — new offline types barrel in `src/models/offline/`
- **Dependencies**: No new npm dependencies (crypto signing already uses Node.js built-in `crypto`, QR generation uses existing `qrcode` package)
- **Existing infrastructure leveraged**: `CertificateType: 'Offline'` already defined, `SendInvoiceRequest.offlineMode` flag already in session models, `InvoicingMode: 'Offline'` already in common types, KOD II URL builder already implemented in `VerificationLinkService`
