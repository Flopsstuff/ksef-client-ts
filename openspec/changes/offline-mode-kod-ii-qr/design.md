## Context

KSeF 2.0 mandates offline invoicing when the system is unavailable. Invoices must be generated locally with QR codes (KOD I for verification, KOD II for certificate proof), stored until KSeF is back, then submitted with `offlineMode: true`. The submission deadline depends on the offline mode and can be extended by maintenance windows.

Current state:
- `VerificationLinkService` already builds both KOD I and KOD II URLs with RSA-PSS/ECDSA signing
- `SendInvoiceRequest.offlineMode` and `OpenBatchSessionRequest.offlineMode` flags already exist
- `CertificateType: 'Offline'` and `InvoicingMode: 'Offline'` types already defined
- `QrCodeService` generates PNG/SVG/SVG+label QR codes

Missing: offline invoice metadata model, storage abstraction, deadline logic, dual QR set generation, offline workflow, and CLI commands.

## Goals / Non-Goals

**Goals:**
- Provide a complete offline invoice lifecycle: generate → store → queue → submit → track
- Generate dual QR code sets (KOD I + KOD II) for offline invoices
- Calculate submission deadlines per mode with maintenance window extension
- Offer a pluggable storage interface with in-memory reference implementation
- Expose offline workflow as both programmatic API and CLI commands

**Non-Goals:**
- Persistent file-based storage implementation (users provide their own; only `InMemoryOfflineInvoiceStorage` shipped)
- Maintenance window API polling (user provides `MaintenanceWindow` data; we don't poll KSeF for system status)
- Invoice XML serialization (separate P3.4 change; user provides raw XML)
- XSD validation of invoice XML (separate P3.9 change)
- Business-day calculation for legal deadlines (we use calendar days; users can supply custom deadline logic)
- `awaria_calkowita` (total failure) workflow — no QR codes or submission obligation, so no workflow needed; only the type enum value is included for completeness

## Decisions

### D1: New `src/offline/` module vs extending existing modules

**Decision**: Create `src/offline/` for types, storage, and deadline calculation. Keep QR generation in `src/qr/` and workflow in `src/workflows/`.

**Rationale**: Offline invoicing is a distinct domain with its own lifecycle independent of sessions. Types and storage don't belong in `src/models/` (they have behavior) or `src/services/` (they're not API wrappers). QR and workflow code stays where similar code already lives.

**Alternatives considered**:
- Everything in `src/workflows/`: Too broad; storage and types aren't workflow concepts.
- `src/models/offline/` for types + `src/offline/` for logic: Splits related code across two trees; types are tightly coupled with deadline calculation.

### D2: Storage interface design — generic vs KSeF-specific

**Decision**: KSeF-specific `OfflineInvoiceStorage` with `save`, `get`, `list`, `update`, `delete` methods. `list` accepts a filter object (`{ status?, mode?, expiringBefore? }`).

**Rationale**: A generic key-value store would push filtering logic to every consumer. Since offline invoices have a small, fixed set of query patterns (by status for submission, by mode for reporting, by expiration for deadline monitoring), baking these into the interface keeps consumers simple.

**Alternatives considered**:
- Generic `Map<string, T>`-style store: Too low-level; every caller reimplements filtering.
- Full query builder: Over-engineered for 3 filter fields.

### D3: Deadline calculation — calendar days with optional override

**Decision**: Calculate deadlines in calendar days (not business days). Accept an optional `calculateDeadline` callback in workflow options for users who need business-day logic.

**Rationale**: Business-day calculation requires a holiday calendar (country-specific, year-specific), which is out of scope. Calendar-day defaults are safe (always shorter than business-day deadlines). Reference implementations (lkow, smekcio) also use calendar days. Users integrating with ERP systems can inject their own calculation.

Default deadlines:
- `offline24`: +24 hours from generation
- `offline` / `awaryjny`: 24 hours after maintenance window ends, or 7 calendar days if no window provided
- `awaria_calkowita`: no deadline (no submission obligation)

### D4: Dual QR set generation — service method vs workflow integration

**Decision**: Add `generateOfflineQRCodes()` to `VerificationLinkService` that returns `{ kodI: string; kodII: string }` URLs. `QrCodeService` gets `generateOfflineQRCodeSet()` that renders both with correct labels. The offline workflow calls these internally but they're also usable standalone.

**Rationale**: Some users want QR codes without the full offline workflow (e.g., pre-generating labels for a print system). Keeping generation in `src/qr/` is consistent with the existing pattern. The workflow orchestrates but doesn't own QR logic.

### D5: Offline workflow — extend existing vs new function

**Decision**: New `generateOfflineInvoice()` function in `src/workflows/offline-invoice-workflow.ts` for generation. New `submitOfflineInvoices()` for batch submission. Do NOT modify existing `openOnlineSession()` or `uploadBatch()`.

**Rationale**: Offline generation is fundamentally different from online submission — no session is opened, no encryption happens, no KSeF API call is made. Mixing this into existing functions via flags would complicate their signatures and tests. Submission reuses existing session workflows internally but wraps them with offline-specific logic (status updates, error handling per invoice).

### D6: Offline invoice ID generation

**Decision**: Use `crypto.randomUUID()` for local invoice IDs. IDs are local-only identifiers for storage; KSeF reference numbers arrive after submission.

**Rationale**: UUIDs avoid collisions without coordination. They're human-readable in CLI output and compatible with any storage backend.

### D7: CLI command structure — new group vs extending existing

**Decision**: New `ksef offline` command group with `generate`, `list`, `queue`, `submit`, `status` subcommands. Extend `ksef qr` with `--offline` flag for standalone QR generation. Extend `ksef session send` with `--offline-mode` flag.

**Rationale**: Offline invoicing is a distinct workflow, not a variant of online session management. A dedicated command group makes discoverability clear. The `ksef qr` extension supports users who only need QR codes. The `ksef session` extension supports users who manage sessions manually.

## Risks / Trade-offs

**[In-memory storage is volatile]** → Users lose offline invoice data on process restart. Mitigation: documented as reference implementation only; interface is simple to implement with file/DB backends. We ship `InMemoryOfflineInvoiceStorage` clearly labeled as non-production.

**[Calendar-day deadlines may be shorter than legal business-day deadlines]** → Users could submit earlier than required. Mitigation: this is the conservative direction (early submission is never a problem). Document the override mechanism prominently.

**[No maintenance window polling]** → Users must manually provide maintenance window data for deadline extension. Mitigation: the `MaintenanceWindow` type is simple (start/end/active). Users integrating with KSeF status API can pipe data directly. A future change could add automatic polling.

**[Offline certificate must already be enrolled]** → KOD II requires an active Offline-type certificate from KSeF. Mitigation: the existing `CertificateApiService` handles enrollment; we validate certificate type at QR generation time and throw a clear error if it's `Authentication` instead of `Offline`.

**[No invoice XML validation]** → Users can generate offline metadata for malformed XML that KSeF will reject on submission. Mitigation: out of scope (P3.9); hash-based integrity is preserved regardless of XML validity.

## Open Questions

- Should `submitOfflineInvoices()` use online sessions (one invoice at a time) or batch sessions (all at once)? Proposal: support both via `submissionMode: 'online' | 'batch'` option, default to `batch` for efficiency. Batch makes sense when submitting accumulated invoices.
- Should the CLI store offline invoices in a file by default (e.g., `~/.ksef/offline-invoices.json`)? Proposal: no persistent storage in v1; CLI operates on JSON files that users manage. This avoids hidden state. A future change can add `FileOfflineInvoiceStorage`.
