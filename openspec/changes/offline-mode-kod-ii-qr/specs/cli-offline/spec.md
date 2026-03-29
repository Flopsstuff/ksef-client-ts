## ADDED Requirements

### Requirement: Offline command group registration
The `offlineCommand` SHALL be exported from `src/cli/commands/offline.ts` and registered in `src/cli/index.ts` under the `offline` subcommand key. Running `ksef offline --help` SHALL list all subcommands.

#### Scenario: Help output
- **WHEN** user runs `ksef offline --help`
- **THEN** the CLI SHALL list subcommands: generate, list, queue, submit, status

### Requirement: Generate offline invoice
The `ksef offline generate` command SHALL generate offline invoice metadata and QR codes. Required flags: `--invoice` (path to invoice XML file), `--mode` (offline24|offline|awaryjny|awaria_calkowita), `--nip` (seller NIP), `--invoice-number` (invoice number string), `--date` (issue date, ISO format). Optional flags: `--context-type` (Nip|InternalId|NipVatUe|PeppolId, default: Nip), `--context-id` (context identifier value, defaults to NIP), `--certificate` (path to offline certificate private key PEM), `--cert-serial` (certificate serial number), `--maintenance-window-end` (ISO 8601 timestamp for maintenance window end), `--out-dir` (directory to write QR code PNGs). It SHALL call `generateOfflineInvoice()` from the offline workflow.

#### Scenario: Generate with certificate and QR output
- **WHEN** user runs `ksef offline generate --invoice fa.xml --mode offline24 --nip 1234567890 --invoice-number "FV/2026/001" --date 2026-03-15 --certificate key.pem --cert-serial CERT001 --out-dir ./qr/`
- **THEN** the CLI SHALL read the XML file, generate metadata with QR codes, write KOD I PNG to `./qr/kod-i.png` and KOD II PNG to `./qr/kod-ii.png`, and display metadata summary (id, mode, deadline, QR URLs)

#### Scenario: Generate without certificate
- **WHEN** user runs `ksef offline generate` without `--certificate`
- **THEN** the CLI SHALL generate metadata without QR codes and display a warning that KOD II was not generated

#### Scenario: Generate with maintenance window
- **WHEN** user runs with `--maintenance-window-end 2026-03-15T18:00:00Z`
- **THEN** the deadline SHALL be calculated using the maintenance window end time

#### Scenario: JSON output
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full `GenerateOfflineInvoiceResult` as JSON (metadata + QR URLs)

#### Scenario: Invalid mode
- **WHEN** user runs with `--mode invalid`
- **THEN** the CLI SHALL display an error listing valid modes: offline24, offline, awaryjny, awaria_calkowita

#### Scenario: Invoice file not found
- **WHEN** `--invoice` path does not exist
- **THEN** the CLI SHALL display a clear error message

### Requirement: List offline invoices
The `ksef offline list` command SHALL list offline invoices from a JSON file. Required flag: `--store` (path to JSON file used as invoice store). Optional flags: `--status` (filter by status), `--mode` (filter by mode), `--expiring-within` (hours, show only invoices expiring within N hours).

#### Scenario: List all invoices
- **WHEN** user runs `ksef offline list --store invoices.json`
- **THEN** the CLI SHALL display a table with columns: ID (truncated), Mode, Status, Invoice Number, Deadline, KSeF Ref

#### Scenario: Filter by status
- **WHEN** user runs `ksef offline list --store invoices.json --status Generated`
- **THEN** the table SHALL show only invoices with `status: 'Generated'`

#### Scenario: Show expiring invoices
- **WHEN** user runs `ksef offline list --store invoices.json --expiring-within 24`
- **THEN** the table SHALL show only Generated/Queued invoices with deadlines within 24 hours

#### Scenario: Empty store
- **WHEN** the store file is empty or has no matching invoices
- **THEN** the CLI SHALL display a message indicating no invoices found

#### Scenario: JSON output
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the array of matching `OfflineInvoiceMetadata` as JSON

### Requirement: Queue offline invoices
The `ksef offline queue` command SHALL mark Generated invoices as Queued for submission. Required flag: `--store` (path to JSON store). Optional flags: `--mode` (filter by offline mode), `--id` (queue a specific invoice by ID).

#### Scenario: Queue all generated
- **WHEN** user runs `ksef offline queue --store invoices.json`
- **THEN** the CLI SHALL update all Generated invoices to Queued and display the count

#### Scenario: Queue specific invoice
- **WHEN** user runs `ksef offline queue --store invoices.json --id abc-123`
- **THEN** only the specified invoice SHALL be queued

#### Scenario: Queue by mode
- **WHEN** user runs `ksef offline queue --store invoices.json --mode offline24`
- **THEN** only Generated invoices with `mode: 'offline24'` SHALL be queued

#### Scenario: No invoices to queue
- **WHEN** no Generated invoices match the filter
- **THEN** the CLI SHALL display a message indicating nothing to queue

### Requirement: Submit offline invoices
The `ksef offline submit` command SHALL submit queued invoices to KSeF. Required flag: `--store` (path to JSON store). Optional flags: `--submission-mode` (online|batch, default: batch), `--form-code` (FA2|FA3|PEF3|PEFKOR3|FARR1, default: FA2), `--continue-on-error` (boolean). The command SHALL require an active auth session (same as `ksef session open`).

#### Scenario: Batch submission
- **WHEN** user runs `ksef offline submit --store invoices.json`
- **THEN** the CLI SHALL submit all Queued invoices via batch session with `offlineMode: true`, display progress, update the store with results, and show a summary (submitted/accepted/rejected counts)

#### Scenario: Online submission
- **WHEN** user runs `ksef offline submit --store invoices.json --submission-mode online`
- **THEN** the CLI SHALL submit invoices one by one via online session

#### Scenario: No queued invoices
- **WHEN** the store has no Queued invoices
- **THEN** the CLI SHALL display a message indicating nothing to submit

#### Scenario: Submission failure with continue-on-error
- **WHEN** one invoice is rejected and `--continue-on-error` is set
- **THEN** the CLI SHALL continue processing remaining invoices and display both successes and failures in the summary

#### Scenario: Not authenticated
- **WHEN** user runs `ksef offline submit` without an active auth session
- **THEN** the CLI SHALL display an error suggesting `ksef auth login`

### Requirement: Check offline invoice status
The `ksef offline status` command SHALL show the status of a specific offline invoice. Required flags: `--store` (path to JSON store), `--id` (invoice ID).

#### Scenario: Show invoice status
- **WHEN** user runs `ksef offline status --store invoices.json --id abc-123`
- **THEN** the CLI SHALL display key-value pairs: ID, Mode, Reason, Status, Invoice Number, NIP, Generated At, Deadline, KSeF Ref (if accepted), Submitted At, Error (if rejected)

#### Scenario: Invoice not found
- **WHEN** the specified ID does not exist in the store
- **THEN** the CLI SHALL display an error indicating the invoice was not found

#### Scenario: JSON output
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full `OfflineInvoiceMetadata` as JSON

### Requirement: Global flags support
All offline commands SHALL respect global flags: `--env`, `--json`, `--nip`, `--timeout`.

#### Scenario: Environment override
- **WHEN** any offline command is run with `--env prod`
- **THEN** the CLI MUST use the production environment QR URL base for QR code generation

#### Scenario: JSON output on any offline command
- **WHEN** any offline command is run with `--json`
- **THEN** output MUST be raw JSON, no tables or spinners
