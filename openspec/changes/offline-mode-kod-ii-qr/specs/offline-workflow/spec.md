## ADDED Requirements

### Requirement: Generate offline invoice metadata
The system SHALL provide a `generateOfflineInvoice` function that creates `OfflineInvoiceMetadata` and optionally generates QR codes. It SHALL accept: `invoiceXml` (string or Uint8Array), `mode` (OfflineMode), `sellerNip` (string), `invoiceNumber` (string), `issueDate` (Date or string), `contextIdentifier` (ContextIdentifier), and optional fields: `offlineCertificate` (containing `privateKeyPem`, `certSerial`, and optional `certificateType`), `maintenanceWindow` (MaintenanceWindow), `calculateDeadline` callback, `storage` (OfflineInvoiceStorage). If `offlineCertificate` is provided and mode is not `awaria_calkowita`, it SHALL generate dual QR codes (KOD I + KOD II). If `storage` is provided, it SHALL save the metadata automatically.

#### Scenario: Generate with QR codes and storage
- **WHEN** calling `generateOfflineInvoice()` with invoice XML, mode `offline24`, a certificate, and storage
- **THEN** it SHALL compute SHA-256 hash of the XML, create metadata with `status: 'Generated'`, generate KOD I + KOD II QR codes, save to storage, and return the metadata with QR codes

#### Scenario: Generate without certificate
- **WHEN** calling `generateOfflineInvoice()` without `offlineCertificate`
- **THEN** it SHALL create metadata without QR codes (QR codes are `null` in the result)

#### Scenario: Generate for awaria_calkowita
- **WHEN** calling `generateOfflineInvoice()` with mode `awaria_calkowita`
- **THEN** `submitBy` SHALL be `null` and no QR codes SHALL be generated regardless of certificate presence

#### Scenario: Generate without storage
- **WHEN** calling `generateOfflineInvoice()` without `storage`
- **THEN** it SHALL return metadata without saving (caller manages persistence)

#### Scenario: Compute invoice hash
- **WHEN** generating offline invoice metadata from XML string
- **THEN** the `invoiceHash` field SHALL be the SHA-256 hash of the XML bytes encoded as Base64

### Requirement: Generate offline invoice result type
The `generateOfflineInvoice` function SHALL return a `GenerateOfflineInvoiceResult` containing: `metadata` (OfflineInvoiceMetadata) and `qrCodes` (OfflineInvoiceQRCodes or null).

#### Scenario: Access result fields
- **WHEN** receiving the result from `generateOfflineInvoice()`
- **THEN** `result.metadata` SHALL contain the full `OfflineInvoiceMetadata` and `result.qrCodes` SHALL contain KOD I + KOD II if certificate was provided

### Requirement: Submit offline invoices
The system SHALL provide a `submitOfflineInvoices` function that sends stored offline invoices to KSeF. It SHALL accept: `client` (KSeFClient), `storage` (OfflineInvoiceStorage), and options: `filter` (OfflineInvoiceFilter, default: `{ status: 'Queued' }`), `submissionMode` (`'online' | 'batch'`, default: `'batch'`), `formCode` (FormCode), `pollOptions` (PollOptions), `continueOnError` (boolean, default: `false`).

#### Scenario: Batch submission of queued invoices
- **WHEN** calling `submitOfflineInvoices()` with 5 queued invoices and `submissionMode: 'batch'`
- **THEN** it SHALL update their status to `'Submitted'`, open a batch session with `offlineMode: true`, upload all invoices, close the session, poll for UPO, and update accepted invoices to `'Accepted'` with their KSeF reference numbers

#### Scenario: Online submission of queued invoices
- **WHEN** calling `submitOfflineInvoices()` with `submissionMode: 'online'`
- **THEN** it SHALL open an online session, send each invoice individually with `offlineMode: true`, close the session, poll for UPO, and update statuses accordingly

#### Scenario: No queued invoices
- **WHEN** calling `submitOfflineInvoices()` and storage has no invoices matching the filter
- **THEN** it SHALL return an empty result without opening any KSeF session

#### Scenario: Submission with continueOnError
- **WHEN** calling with `continueOnError: true` and one invoice is rejected by KSeF
- **THEN** the rejected invoice SHALL be updated to `'Rejected'` with error details, and remaining invoices SHALL continue processing

#### Scenario: Submission without continueOnError
- **WHEN** calling with `continueOnError: false` (default) and one invoice is rejected
- **THEN** the function SHALL throw an error after updating the failed invoice's status

### Requirement: Submit offline invoices result type
The `submitOfflineInvoices` function SHALL return a `SubmitOfflineInvoicesResult` containing: `sessionRef` (string), `submitted` (number — count of invoices sent), `accepted` (number — count confirmed by KSeF), `rejected` (number — count rejected), `results` (array of per-invoice results with `id`, `status`, `ksefReferenceNumber` or `error`).

#### Scenario: Result after successful batch submission
- **WHEN** 5 invoices are submitted and all accepted
- **THEN** `result.submitted` SHALL be 5, `result.accepted` SHALL be 5, `result.rejected` SHALL be 0, and each `results[i].ksefReferenceNumber` SHALL be populated

### Requirement: Queue offline invoices for submission
The system SHALL provide a `queueOfflineInvoices` function that transitions invoices from `Generated` to `Queued` status. It SHALL accept `storage` (OfflineInvoiceStorage) and optional `filter` (OfflineInvoiceFilter, defaults to `{ status: 'Generated' }`). It SHALL return the count of invoices queued.

#### Scenario: Queue all generated invoices
- **WHEN** calling `queueOfflineInvoices(storage)` with 3 Generated invoices
- **THEN** all 3 SHALL transition to `status: 'Queued'` and the function SHALL return 3

#### Scenario: Queue with custom filter
- **WHEN** calling `queueOfflineInvoices(storage, { status: 'Generated', mode: 'offline24' })`
- **THEN** only Generated invoices with mode `offline24` SHALL be queued

#### Scenario: No invoices to queue
- **WHEN** calling `queueOfflineInvoices()` with no invoices matching the filter
- **THEN** the function SHALL return 0

### Requirement: Check expiring invoices
The system SHALL provide a `getExpiringInvoices` function that returns invoices whose deadline is approaching. It SHALL accept `storage` (OfflineInvoiceStorage) and `withinHours` (number, default 24). It SHALL return invoices with `submitBy` within the specified hours from now and status `Generated` or `Queued`.

#### Scenario: Find invoices expiring within 24 hours
- **WHEN** calling `getExpiringInvoices(storage, 24)` with 2 invoices expiring in 12 hours and 1 expiring in 48 hours
- **THEN** the result SHALL contain only the 2 invoices expiring within 24 hours

#### Scenario: Exclude already submitted invoices
- **WHEN** an invoice has `submitBy` within the window but `status: 'Submitted'`
- **THEN** it SHALL NOT be included in the result

#### Scenario: Exclude invoices with no deadline
- **WHEN** an invoice has `submitBy: null` (awaria_calkowita)
- **THEN** it SHALL NOT be included in the result
