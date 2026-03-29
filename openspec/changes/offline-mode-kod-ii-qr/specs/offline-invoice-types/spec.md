## ADDED Requirements

### Requirement: Offline mode enumeration
The system SHALL define an `OfflineMode` type with exactly four values: `offline24`, `offline`, `awaryjny`, `awaria_calkowita`. Each value SHALL correspond to a distinct legal basis for offline invoicing under KSeF 2.0.

#### Scenario: All four modes defined
- **WHEN** a consumer imports `OfflineMode` from the offline module
- **THEN** the type SHALL accept exactly `'offline24' | 'offline' | 'awaryjny' | 'awaria_calkowita'`

#### Scenario: Mode used in invoice metadata
- **WHEN** creating an `OfflineInvoiceMetadata` with `mode: 'awaryjny'`
- **THEN** the type system SHALL accept it without errors

### Requirement: Offline reason enumeration
The system SHALL define an `OfflineReason` type mapping each mode to its cause: `Planned` (offline24), `SystemUnavailable` (offline), `Emergency` (awaryjny), `TotalFailure` (awaria_calkowita).

#### Scenario: Reason matches mode
- **WHEN** generating offline invoice metadata with mode `offline24`
- **THEN** the reason SHALL be set to `'Planned'`

#### Scenario: Reason for emergency mode
- **WHEN** generating offline invoice metadata with mode `awaryjny`
- **THEN** the reason SHALL be set to `'Emergency'`

### Requirement: Offline invoice status lifecycle
The system SHALL define an `OfflineInvoiceStatus` type with six values representing the lifecycle: `Generated`, `Queued`, `Submitted`, `Accepted`, `Rejected`, `Expired`. Transitions SHALL follow the lifecycle: `Generated` → `Queued` → `Submitted` → `Accepted` | `Rejected` | `Expired`.

#### Scenario: Initial status
- **WHEN** an offline invoice is generated
- **THEN** its status SHALL be `'Generated'`

#### Scenario: Queued for submission
- **WHEN** an offline invoice is marked for batch submission
- **THEN** its status SHALL transition to `'Queued'`

#### Scenario: Submitted to KSeF
- **WHEN** a queued invoice is sent to KSeF with `offlineMode: true`
- **THEN** its status SHALL transition to `'Submitted'`

#### Scenario: Accepted by KSeF
- **WHEN** KSeF accepts a submitted offline invoice and assigns a KSeF reference number
- **THEN** its status SHALL transition to `'Accepted'`

#### Scenario: Rejected by KSeF
- **WHEN** KSeF rejects a submitted offline invoice
- **THEN** its status SHALL transition to `'Rejected'` with error details stored

#### Scenario: Expired deadline
- **WHEN** an offline invoice's submission deadline passes without submission
- **THEN** its status SHALL transition to `'Expired'`

### Requirement: Offline invoice metadata model
The system SHALL define an `OfflineInvoiceMetadata` interface containing: `id` (UUID string), `mode` (OfflineMode), `reason` (OfflineReason), `status` (OfflineInvoiceStatus), `invoiceNumber` (string), `invoiceXml` (string), `invoiceHash` (base64 SHA-256 of invoice XML), `sellerNip` (string), `contextIdentifier` (ContextIdentifier from common types), `generatedAt` (ISO 8601 string), `submitBy` (ISO 8601 deadline string or null for `awaria_calkowita`), `maintenanceWindowId` (string or null), `ksefReferenceNumber` (string or null, set after acceptance), `submittedAt` (ISO 8601 string or null), `error` (string or null, set on rejection).

#### Scenario: Generate metadata for offline24 invoice
- **WHEN** generating metadata with mode `offline24`, NIP `1234567890`, and invoice XML
- **THEN** the metadata SHALL have a UUID `id`, `reason: 'Planned'`, `status: 'Generated'`, `generatedAt` as current ISO timestamp, `submitBy` as 24 hours from `generatedAt`, and `ksefReferenceNumber: null`

#### Scenario: Metadata for awaria_calkowita
- **WHEN** generating metadata with mode `awaria_calkowita`
- **THEN** `submitBy` SHALL be `null` (no submission obligation)

#### Scenario: Metadata after acceptance
- **WHEN** KSeF accepts an offline invoice
- **THEN** `ksefReferenceNumber` SHALL be populated with the assigned reference and `status` SHALL be `'Accepted'`

### Requirement: Maintenance window type
The system SHALL define a `MaintenanceWindow` interface with: `id` (string), `startTime` (ISO 8601), `endTime` (ISO 8601 or null if ongoing), `active` (boolean), `reason` (string or null), `planned` (boolean).

#### Scenario: Active maintenance window
- **WHEN** a maintenance window has `active: true` and `endTime: null`
- **THEN** it SHALL represent an ongoing system unavailability

#### Scenario: Resolved maintenance window
- **WHEN** a maintenance window has `active: false` and `endTime` set
- **THEN** it SHALL represent a resolved unavailability whose `endTime` is used for deadline extension

### Requirement: Deadline calculation
The system SHALL provide a `calculateOfflineDeadline` function that computes submission deadlines based on mode and optional maintenance window. Default rules: `offline24` → 24 hours from generation; `offline` / `awaryjny` → 24 hours after maintenance window end, or 7 calendar days if no window; `awaria_calkowita` → returns `null`. The function SHALL accept an optional `calculateDeadline` callback for custom business-day logic.

#### Scenario: offline24 deadline
- **WHEN** calculating deadline for mode `offline24` with `generatedAt` = `2026-03-15T10:00:00Z`
- **THEN** the deadline SHALL be `2026-03-16T10:00:00Z` (24 hours later)

#### Scenario: offline with maintenance window
- **WHEN** calculating deadline for mode `offline` with a maintenance window ending at `2026-03-15T18:00:00Z`
- **THEN** the deadline SHALL be `2026-03-16T18:00:00Z` (24 hours after window end)

#### Scenario: awaryjny without maintenance window
- **WHEN** calculating deadline for mode `awaryjny` with no maintenance window provided
- **THEN** the deadline SHALL be 7 calendar days from `generatedAt`

#### Scenario: awaria_calkowita has no deadline
- **WHEN** calculating deadline for mode `awaria_calkowita`
- **THEN** the result SHALL be `null`

#### Scenario: Custom deadline callback
- **WHEN** a `calculateDeadline` callback is provided that returns `2026-03-20T00:00:00Z`
- **THEN** the function SHALL use the callback's return value instead of the default calculation

### Requirement: Deadline extension for maintenance windows
The system SHALL provide an `extendDeadlineForMaintenance` function that recalculates a deadline based on a new maintenance window. The extended deadline SHALL be 24 hours after the maintenance window's `endTime`. The function SHALL NOT shorten an existing deadline — if the current deadline is already later, it SHALL be preserved.

#### Scenario: Extend deadline with later window
- **WHEN** current deadline is `2026-03-16T10:00:00Z` and maintenance window ends at `2026-03-17T12:00:00Z`
- **THEN** the new deadline SHALL be `2026-03-18T12:00:00Z`

#### Scenario: Do not shorten deadline
- **WHEN** current deadline is `2026-03-20T10:00:00Z` and maintenance window ends at `2026-03-15T12:00:00Z`
- **THEN** the deadline SHALL remain `2026-03-20T10:00:00Z`

#### Scenario: Maintenance window still active (no endTime)
- **WHEN** maintenance window has `endTime: null`
- **THEN** the function SHALL return the current deadline unchanged

### Requirement: Offline mode to reason mapping
The system SHALL provide a `getOfflineReason` function that maps `OfflineMode` to `OfflineReason`: `offline24` → `Planned`, `offline` → `SystemUnavailable`, `awaryjny` → `Emergency`, `awaria_calkowita` → `TotalFailure`.

#### Scenario: Map each mode
- **WHEN** calling `getOfflineReason('offline24')`
- **THEN** the result SHALL be `'Planned'`

#### Scenario: Map awaryjny
- **WHEN** calling `getOfflineReason('awaryjny')`
- **THEN** the result SHALL be `'Emergency'`
