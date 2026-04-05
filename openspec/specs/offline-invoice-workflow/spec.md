## ADDED Requirements

### Requirement: Workflow class construction
The system SHALL provide `OfflineInvoiceWorkflow` class that accepts `VerificationLinkService` and `CryptographyService` via constructor. It SHALL NOT require network access for construction.

#### Scenario: Construct workflow
- **WHEN** `new OfflineInvoiceWorkflow(verificationLinkService, cryptographyService)` is called
- **THEN** it SHALL create a workflow instance without making any network calls

### Requirement: Generate offline invoice
The `generate(input, options?)` method SHALL create `OfflineInvoiceMetadata` with QR code URLs. It SHALL compute the SHA-256 hash of `invoiceXml`, build the KOD I URL via `VerificationLinkService.buildInvoiceVerificationUrl()`, optionally build the KOD II URL via `buildCertificateVerificationUrl()` when a certificate is provided, calculate the deadline via `calculateOfflineDeadline()`, generate a UUID for the `id`, and set status to `'GENERATED'`.

#### Scenario: Generate with certificate (KOD I + KOD II)
- **WHEN** `generate(input, { certificate: { privateKeyPem, certificateSerial } })` is called
- **THEN** the returned metadata SHALL have `kod1Url` with the invoice verification URL
- **AND** `kod2Url` with the signed certificate verification URL
- **AND** `status` SHALL be `'GENERATED'`
- **AND** `submitBy` SHALL be calculated based on the mode

#### Scenario: Generate without certificate (KOD I only)
- **WHEN** `generate(input, {})` is called without a certificate
- **THEN** `kod1Url` SHALL be populated
- **AND** `kod2Url` SHALL be `undefined`

#### Scenario: Default mode is offline24
- **WHEN** `generate(input)` is called without specifying a mode
- **THEN** the metadata `mode` SHALL be `'offline24'`
- **AND** `reason` SHALL be `'PLANNED'`

#### Scenario: Custom deadline overrides calculation
- **WHEN** `generate(input, { customDeadline: '2026-05-01T23:59:59Z' })` is called
- **THEN** `submitBy` SHALL be `'2026-05-01T23:59:59Z'` regardless of mode

#### Scenario: Auto-save to storage
- **WHEN** `generate(input, { storage })` is called with a storage instance
- **THEN** the metadata SHALL be saved to storage via `storage.save()`
- **AND** the metadata SHALL also be returned

#### Scenario: Input validation
- **WHEN** `generate(input)` is called with empty `invoiceXml`
- **THEN** it SHALL throw an error indicating invalid input

### Requirement: Submit offline invoices to KSeF
The `submit(client, options)` method SHALL load invoices from storage, check for expiry, open an online session, send each pending invoice with `offlineMode: true`, update statuses, and close the session. It SHALL return an `OfflineBatchResult` summary.

#### Scenario: Submit all pending invoices
- **WHEN** `submit(client, { storage })` is called with storage containing 3 GENERATED invoices
- **THEN** it SHALL mark them as QUEUED
- **AND** open an online session via `client`
- **AND** send each invoice with `offlineMode: true` in the `SendInvoiceRequest`
- **AND** update each to SUBMITTED, then ACCEPTED on success
- **AND** set `ksefReferenceNumber` and `submittedAt` on each
- **AND** close the session
- **AND** return `OfflineBatchResult` with `total: 3, submitted: 3, accepted: 3`

#### Scenario: Submit specific invoice IDs
- **WHEN** `submit(client, { storage, invoiceIds: ['id-1', 'id-3'] })` is called
- **THEN** it SHALL only process invoices with those IDs

#### Scenario: Skip expired invoices
- **WHEN** storage contains an invoice with `submitBy` in the past
- **AND** `submit(client, { storage, checkExpiry: true })` is called
- **THEN** it SHALL mark that invoice as `'EXPIRED'` in storage
- **AND** NOT attempt to submit it
- **AND** `OfflineBatchResult.expired` SHALL include the count

#### Scenario: Partial failure
- **WHEN** 3 invoices are submitted and the 2nd one is rejected by KSeF
- **THEN** the 1st SHALL be ACCEPTED, the 2nd SHALL be REJECTED with error details, and the 3rd SHALL still be attempted
- **AND** `OfflineBatchResult` SHALL show `accepted: 2, rejected: 1`

#### Scenario: Session open failure
- **WHEN** the online session fails to open (e.g., auth error)
- **THEN** `submit()` SHALL throw the error
- **AND** no invoice statuses SHALL be changed

### Requirement: Technical correction
The `correct(client, options)` method SHALL resubmit a rejected offline invoice. It SHALL load the original rejected invoice from storage, compute SHA-256 of the original `invoiceXml`, open an online session, send the corrected XML with `offlineMode: true` and `hashOfCorrectedInvoice` set to the original's hash, and store the new invoice metadata linked via `correctedInvoiceId`.

#### Scenario: Correct a rejected invoice
- **WHEN** `correct(client, { rejectedInvoiceId: 'rej-1', correctedInvoiceXml: '<FA>...</FA>', storage })` is called
- **AND** invoice 'rej-1' exists in storage with status `'REJECTED'`
- **THEN** it SHALL open an online session
- **AND** send the corrected XML with `offlineMode: true`
- **AND** `hashOfCorrectedInvoice` SHALL be the SHA-256 (base64) of the original invoice's XML
- **AND** store a new `OfflineInvoiceMetadata` with `correctedInvoiceId: 'rej-1'`
- **AND** return the submission result

#### Scenario: Correct non-rejected invoice
- **WHEN** `correct(client, { rejectedInvoiceId: 'gen-1', ... })` is called
- **AND** invoice 'gen-1' has status `'GENERATED'` (not REJECTED)
- **THEN** it SHALL throw an error indicating only rejected invoices can be corrected

#### Scenario: Original invoice not found
- **WHEN** `correct(client, { rejectedInvoiceId: 'missing', ... })` is called
- **AND** no invoice with that ID exists in storage
- **THEN** it SHALL throw an error indicating the invoice was not found

### Requirement: Batch result type
The system SHALL define `OfflineBatchResult` with fields: `total` (number), `submitted` (number), `accepted` (number), `rejected` (number), `failed` (number), `expired` (number), `results` (array of `OfflineSubmissionResult`). Each `OfflineSubmissionResult` SHALL have: `invoiceId`, `invoiceNumber`, `status`, optional `ksefReferenceNumber`, optional `error`.

#### Scenario: All accepted
- **WHEN** 5 invoices are submitted and all succeed
- **THEN** `OfflineBatchResult` SHALL have `total: 5, submitted: 5, accepted: 5, rejected: 0, failed: 0, expired: 0`

#### Scenario: Mixed results
- **WHEN** 5 invoices are processed: 3 accepted, 1 rejected, 1 expired
- **THEN** `OfflineBatchResult` SHALL have `total: 5, submitted: 4, accepted: 3, rejected: 1, failed: 0, expired: 1`
