## ADDED Requirements

### Requirement: Offline mode types
The system SHALL define `OfflineMode` as a string union of `'offline24' | 'offline' | 'awaryjny' | 'awaria_calkowita'`, representing the four KSeF offline modes per art. 106nda/106nh/106nf of the VAT Act.

#### Scenario: All four modes are valid
- **WHEN** a value of type `OfflineMode` is assigned
- **THEN** it SHALL accept exactly `'offline24'`, `'offline'`, `'awaryjny'`, or `'awaria_calkowita'`
- **AND** TypeScript SHALL reject any other string at compile time

### Requirement: Offline reason types
The system SHALL define `OfflineReason` as `'PLANNED' | 'SYSTEM_UNAVAILABLE' | 'EMERGENCY' | 'TOTAL_FAILURE'`. A function `getDefaultReason(mode: OfflineMode)` SHALL map: `offline24` → `PLANNED`, `offline` → `SYSTEM_UNAVAILABLE`, `awaryjny` → `EMERGENCY`, `awaria_calkowita` → `TOTAL_FAILURE`.

#### Scenario: Default reason mapping
- **WHEN** `getDefaultReason('offline24')` is called
- **THEN** it SHALL return `'PLANNED'`

#### Scenario: Emergency reason mapping
- **WHEN** `getDefaultReason('awaryjny')` is called
- **THEN** it SHALL return `'EMERGENCY'`

### Requirement: Offline invoice status state machine
The system SHALL define `OfflineInvoiceStatus` as `'GENERATED' | 'QUEUED' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'`. Valid transitions SHALL be: GENERATED → QUEUED, QUEUED → SUBMITTED, SUBMITTED → ACCEPTED, SUBMITTED → REJECTED. Any non-terminal status (GENERATED, QUEUED, SUBMITTED) MAY transition to EXPIRED.

#### Scenario: Normal lifecycle
- **WHEN** an offline invoice is created
- **THEN** its status SHALL be `'GENERATED'`
- **AND** it SHALL progress through QUEUED → SUBMITTED → ACCEPTED on successful submission

#### Scenario: Rejection
- **WHEN** KSeF rejects the invoice during submission
- **THEN** status SHALL transition from SUBMITTED to `'REJECTED'`
- **AND** the `error` field SHALL contain the rejection code and message

#### Scenario: Expiry
- **WHEN** the submission deadline passes while status is GENERATED, QUEUED, or SUBMITTED
- **THEN** status SHALL transition to `'EXPIRED'`

### Requirement: Offline invoice metadata
The system SHALL define `OfflineInvoiceMetadata` containing: `id` (UUID string), `mode` (OfflineMode), `reason` (OfflineReason), `status` (OfflineInvoiceStatus), `invoiceNumber` (string), `invoiceDate` (ISO 8601 string), `invoiceXml` (string), `sellerNip` (string), `sellerIdentifier` (ContextIdentifier), optional `buyerIdentifier` (ContextIdentifier), optional `totalAmount` (number), optional `currency` (string, default PLN), `kod1Url` (string), optional `kod2Url` (string), `generatedAt` (ISO 8601), `submitBy` (ISO 8601 deadline), optional `submittedAt`, optional `acceptedAt`, optional `ksefReferenceNumber`, optional `error` object with `code`, `message`, `details`, optional `maintenanceWindowId`, optional `correctedInvoiceId`.

#### Scenario: Metadata has all required fields
- **WHEN** an offline invoice is generated
- **THEN** the metadata SHALL have `id`, `mode`, `reason`, `status`, `invoiceNumber`, `invoiceDate`, `invoiceXml`, `sellerNip`, `sellerIdentifier`, `kod1Url`, `generatedAt`, and `submitBy` populated
- **AND** `status` SHALL be `'GENERATED'`

#### Scenario: KOD II URL populated when certificate provided
- **WHEN** an offline invoice is generated with an `OfflineCertificate`
- **THEN** `kod2Url` SHALL be populated with the signed certificate verification URL

#### Scenario: KOD II URL absent without certificate
- **WHEN** an offline invoice is generated without an `OfflineCertificate`
- **THEN** `kod2Url` SHALL be `undefined`

### Requirement: Offline certificate type
The system SHALL define `OfflineCertificate` with fields: `privateKeyPem` (string, PEM-encoded RSA 2048+ or EC P-256 private key), `certificateSerial` (string, hex format), optional `password` (string, for encrypted PKCS#8 keys).

#### Scenario: RSA certificate
- **WHEN** an `OfflineCertificate` has an RSA-2048 private key in PEM format
- **THEN** it SHALL be accepted for KOD II signing

#### Scenario: EC P-256 certificate
- **WHEN** an `OfflineCertificate` has an EC P-256 (secp256r1) private key in PEM format
- **THEN** it SHALL be accepted for KOD II signing

### Requirement: Maintenance window type
The system SHALL define `MaintenanceWindow` with fields: `id` (string), `startTime` (ISO 8601), optional `endTime` (ISO 8601, null if ongoing), `active` (boolean), `planned` (boolean), optional `reason` (string).

#### Scenario: Active maintenance window
- **WHEN** a `MaintenanceWindow` has `active: true` and no `endTime`
- **THEN** deadline calculation SHALL use a fallback of 7 days from `startTime`

#### Scenario: Completed maintenance window
- **WHEN** a `MaintenanceWindow` has `active: false` and `endTime` set
- **THEN** deadline calculation SHALL use `endTime` as the base

### Requirement: Offline invoice input data
The system SHALL define `OfflineInvoiceInputData` with required fields: `invoiceNumber` (string), `invoiceDate` (ISO 8601 string), `invoiceXml` (string), `sellerNip` (string), `sellerIdentifier` (ContextIdentifier); and optional fields: `buyerIdentifier` (ContextIdentifier), `totalAmount` (number), `currency` (string).

#### Scenario: Minimal input
- **WHEN** input has `invoiceNumber`, `invoiceDate`, `invoiceXml`, `sellerNip`, and `sellerIdentifier`
- **THEN** it SHALL be accepted as valid input for offline invoice generation

### Requirement: Deadline calculation for offline24
The function `calculateOfflineDeadline('offline24', invoiceDate)` SHALL return the end of the next business day after the invoice date. Business days exclude Saturdays and Sundays.

#### Scenario: Invoice on Wednesday
- **WHEN** `calculateOfflineDeadline('offline24', '2026-04-08')` is called (Wednesday)
- **THEN** it SHALL return end of Thursday 2026-04-09 (23:59:59)

#### Scenario: Invoice on Friday
- **WHEN** `calculateOfflineDeadline('offline24', '2026-04-10')` is called (Friday)
- **THEN** it SHALL return end of Monday 2026-04-13 (23:59:59), skipping the weekend

#### Scenario: Invoice on Saturday
- **WHEN** `calculateOfflineDeadline('offline24', '2026-04-11')` is called (Saturday)
- **THEN** it SHALL return end of Monday 2026-04-13 (23:59:59)

### Requirement: Deadline calculation for offline mode
The function `calculateOfflineDeadline('offline', invoiceDate, maintenanceWindow)` SHALL return the end of the next business day after the maintenance window ends. If no `endTime`, it SHALL use 7 days from `startTime` as fallback.

#### Scenario: Maintenance ended on Tuesday
- **WHEN** `calculateOfflineDeadline('offline', invoiceDate, { endTime: '2026-04-07T14:00:00Z', ... })` is called
- **THEN** it SHALL return end of Wednesday 2026-04-08 (23:59:59)

#### Scenario: No end time (ongoing)
- **WHEN** maintenance window has no `endTime`
- **THEN** it SHALL use `startTime + 7 days` as the base, then find next business day

### Requirement: Deadline calculation for awaryjny mode
The function `calculateOfflineDeadline('awaryjny', invoiceDate, maintenanceWindow)` SHALL return the end of the 7th business day after the maintenance window ends.

#### Scenario: Maintenance ended on Monday
- **WHEN** `calculateOfflineDeadline('awaryjny', invoiceDate, { endTime: '2026-04-06T10:00:00Z', ... })` is called
- **THEN** it SHALL return end of the 7th business day after April 6 (Wednesday 2026-04-15)

### Requirement: Deadline calculation for awaria_calkowita
The function `calculateOfflineDeadline('awaria_calkowita', invoiceDate)` SHALL return a far-future date (e.g., year 9999), representing suspended invoice obligation.

#### Scenario: Total failure mode
- **WHEN** `calculateOfflineDeadline('awaria_calkowita', '2026-04-08')` is called
- **THEN** it SHALL return a date far in the future
- **AND** `isExpired()` SHALL return `false` for that date

### Requirement: Deadline extension for maintenance cascading
The function `extendDeadlineForMaintenance(currentDeadline, maintenanceWindow)` SHALL recalculate the deadline if the maintenance window ends after the current deadline. For `awaryjny` cascading, the new deadline SHALL be 7 business days from the new `endTime`.

#### Scenario: New failure during existing window
- **WHEN** current deadline is 2026-04-10 and a new maintenance window ends 2026-04-12
- **THEN** `extendDeadlineForMaintenance` SHALL return a new deadline based on 2026-04-12

#### Scenario: Maintenance ends before current deadline
- **WHEN** current deadline is 2026-04-15 and maintenance window ends 2026-04-10
- **THEN** the deadline SHALL remain unchanged (2026-04-15)

### Requirement: Business day helpers
The system SHALL export `nextBusinessDay(from: Date): Date` and `addBusinessDays(from: Date, days: number): Date`. Business days SHALL exclude Saturdays and Sundays only (Polish holidays not included in v1).

#### Scenario: Next business day from Friday
- **WHEN** `nextBusinessDay(new Date('2026-04-10'))` is called (Friday)
- **THEN** it SHALL return Monday 2026-04-13

#### Scenario: Add 7 business days
- **WHEN** `addBusinessDays(new Date('2026-04-06'), 7)` is called (Monday)
- **THEN** it SHALL return Monday 2026-04-15 (skipping 2 weekends)

### Requirement: Expiry check helpers
The system SHALL export `isExpired(submitBy: Date | string): boolean` and `getTimeUntilDeadline(submitBy: Date | string): number` (milliseconds, clamped to >= 0).

#### Scenario: Deadline in the past
- **WHEN** `isExpired('2026-04-01T23:59:59Z')` is called and current time is after that
- **THEN** it SHALL return `true`

#### Scenario: Time until future deadline
- **WHEN** `getTimeUntilDeadline(futureDate)` is called
- **THEN** it SHALL return a positive number of milliseconds

#### Scenario: Time until past deadline
- **WHEN** `getTimeUntilDeadline(pastDate)` is called
- **THEN** it SHALL return `0`
