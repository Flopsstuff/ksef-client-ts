## ADDED Requirements

### Requirement: Offline command group
The system SHALL provide a `ksef offline` command group registered in the CLI. Running `ksef offline --help` SHALL list all subcommands.

#### Scenario: Help output
- **WHEN** user runs `ksef offline --help`
- **THEN** the CLI SHALL list subcommands: generate, list, status, submit, correct, delete

### Requirement: Generate offline invoice
The `ksef offline generate <xml-file>` command SHALL read the invoice XML file, generate offline invoice metadata with QR codes, and save to the local store. Options: `--mode` (offline mode, default: offline24), `--key` (PEM private key file for KOD II), `--cert-serial` (certificate serial hex), `--context-type` (default: Nip), `--context-id` (seller context value), `--nip` (seller NIP, from config if omitted), `--qr-format` (png or svg), `--qr-out` (directory to save QR images), `--no-store` (skip saving to store), `--store-dir` (custom store directory).

#### Scenario: Generate with certificate
- **WHEN** user runs `ksef offline generate invoice.xml --key key.pem --cert-serial 01F20A --nip 1234567890`
- **THEN** the CLI SHALL read the XML and private key files
- **AND** generate metadata with KOD I and KOD II URLs
- **AND** save to `~/.ksef/offline/`
- **AND** display the invoice ID, deadline, and QR URLs

#### Scenario: Generate without certificate
- **WHEN** user runs `ksef offline generate invoice.xml --nip 1234567890`
- **THEN** the CLI SHALL generate metadata with KOD I URL only
- **AND** display a warning that KOD II was not generated (no certificate)

#### Scenario: Save QR images
- **WHEN** user adds `--qr-out ./qr-codes --qr-format png`
- **THEN** the CLI SHALL save KOD I QR as `{id}-kod1.png` and KOD II QR as `{id}-kod2.png` in the specified directory

#### Scenario: No-store mode
- **WHEN** user adds `--no-store`
- **THEN** the CLI SHALL output the metadata to stdout (or JSON with `--json`) but NOT save to the file store

#### Scenario: JSON output
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full `OfflineInvoiceMetadata` as JSON

#### Scenario: XML file not found
- **WHEN** the specified XML file does not exist
- **THEN** the CLI SHALL display an error and exit with non-zero code

### Requirement: List offline invoices
The `ksef offline list` command SHALL display stored offline invoices in a table format. Options: `--status` (filter by status), `--mode` (filter by mode), `--expiring` (show only invoices expiring within 24 hours), `--store-dir` (custom store directory).

#### Scenario: List all
- **WHEN** user runs `ksef offline list`
- **THEN** the CLI SHALL display a table with columns: ID (short), Number, Mode, Status, Deadline, Seller NIP

#### Scenario: Filter by status
- **WHEN** user runs `ksef offline list --status GENERATED`
- **THEN** the CLI SHALL show only invoices with GENERATED status

#### Scenario: Show expiring
- **WHEN** user runs `ksef offline list --expiring`
- **THEN** the CLI SHALL show only invoices whose deadline is within 24 hours from now

#### Scenario: JSON output
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full array of `OfflineInvoiceMetadata` as JSON

#### Scenario: Empty store
- **WHEN** no offline invoices exist in the store
- **THEN** the CLI SHALL display a message indicating no invoices found

### Requirement: Show offline invoice status
The `ksef offline status <id>` command SHALL display detailed information about a single offline invoice. Options: `--store-dir`.

#### Scenario: Show existing invoice
- **WHEN** user runs `ksef offline status abc-123`
- **THEN** the CLI SHALL display all metadata fields: ID, number, mode, reason, status, seller NIP, dates, deadline, QR URLs, KSeF reference (if submitted), error (if rejected)

#### Scenario: Invoice not found
- **WHEN** user runs `ksef offline status non-existent`
- **THEN** the CLI SHALL display an error indicating the invoice was not found

#### Scenario: JSON output
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full `OfflineInvoiceMetadata` as JSON

### Requirement: Submit offline invoices
The `ksef offline submit` command SHALL submit stored offline invoices to KSeF. Accepts optional invoice IDs as positional arguments. Options: `--all` (submit all pending), `--no-check-expiry` (skip expiry check), `--store-dir`, standard auth options (`--env`, `--nip`).

#### Scenario: Submit all pending
- **WHEN** user runs `ksef offline submit --all`
- **THEN** the CLI SHALL load all GENERATED/QUEUED invoices from storage
- **AND** authenticate with KSeF (using stored credentials or session)
- **AND** submit each with `offlineMode: true`
- **AND** display results: accepted count, rejected count, expired count

#### Scenario: Submit specific IDs
- **WHEN** user runs `ksef offline submit id-1 id-2`
- **THEN** the CLI SHALL submit only those two invoices

#### Scenario: No invoices to submit
- **WHEN** user runs `ksef offline submit --all` and no pending invoices exist
- **THEN** the CLI SHALL display a message indicating nothing to submit

#### Scenario: JSON output
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `OfflineBatchResult` as JSON

### Requirement: Technical correction command
The `ksef offline correct <invoice-id> <corrected-xml-file>` command SHALL resubmit a rejected offline invoice with the corrected XML. Options: `--store-dir`, standard auth options.

#### Scenario: Successful correction
- **WHEN** user runs `ksef offline correct rej-1 corrected.xml`
- **AND** invoice rej-1 has status REJECTED
- **THEN** the CLI SHALL submit the corrected XML with `hashOfCorrectedInvoice` from the original
- **AND** display the new KSeF reference number

#### Scenario: Invoice not rejected
- **WHEN** user runs `ksef offline correct gen-1 corrected.xml`
- **AND** invoice gen-1 has status GENERATED
- **THEN** the CLI SHALL display an error: only rejected invoices can be corrected

### Requirement: Delete offline invoices
The `ksef offline delete <id>` command SHALL remove an invoice from the local store. Options: `--expired` (delete all expired invoices), `--store-dir`.

#### Scenario: Delete by ID
- **WHEN** user runs `ksef offline delete abc-123`
- **THEN** the CLI SHALL remove that invoice from the store
- **AND** display confirmation

#### Scenario: Delete all expired
- **WHEN** user runs `ksef offline delete --expired`
- **THEN** the CLI SHALL delete all invoices with status EXPIRED
- **AND** display the count of deleted invoices

#### Scenario: Delete non-existent
- **WHEN** user runs `ksef offline delete non-existent`
- **THEN** the CLI SHALL display an error indicating the invoice was not found
