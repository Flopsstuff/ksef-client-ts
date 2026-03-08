## ADDED Requirements

### Requirement: Send single invoice
The CLI SHALL provide `ksef invoice send <file.xml>` to send a single invoice. The CLI MUST read the XML file, compute its hash and size, encrypt the content via `client.crypto`, and call `OnlineSessionService.sendInvoice()`. Crypto MUST be initialized automatically (`client.crypto.init()`).

#### Scenario: Send single invoice file
- **WHEN** user runs `ksef invoice send invoice.xml` with an active online session
- **THEN** CLI reads the file, encrypts it, sends it via the online session, and displays the invoice reference number

#### Scenario: Send invoice without active session
- **WHEN** user runs `ksef invoice send invoice.xml` without a stored online session ref
- **THEN** CLI SHALL display an error suggesting `ksef session open`

#### Scenario: Send non-existent file
- **WHEN** user runs `ksef invoice send missing.xml` and the file does not exist
- **THEN** CLI SHALL display a file-not-found error

#### Scenario: Send with session ref override
- **WHEN** user runs `ksef invoice send invoice.xml --session-ref <ref>`
- **THEN** CLI uses the provided session ref instead of the stored one

### Requirement: Send batch invoices from directory
The CLI SHALL support `ksef invoice send <dir/>` when the path is a directory. It MUST open a batch session, read all `*.xml` files, send them as batch parts, and close the batch session.

#### Scenario: Send directory of invoices
- **WHEN** user runs `ksef invoice send ./invoices/` and the directory contains XML files
- **THEN** CLI opens a batch session, sends all XML files as parts, closes the session, and displays the batch reference and count of sent invoices

#### Scenario: Send empty directory
- **WHEN** user runs `ksef invoice send ./empty/` and the directory contains no XML files
- **THEN** CLI SHALL display an error indicating no XML files found

#### Scenario: Send directory path detection
- **WHEN** user provides a path that is a directory (detected via `fs.statSync`)
- **THEN** CLI MUST automatically use batch mode without requiring a `--batch` flag

### Requirement: Get invoice by KSeF number
The CLI SHALL provide `ksef invoice get <ksef-number>` to download an invoice XML by its KSeF number.

#### Scenario: Download invoice to stdout
- **WHEN** user runs `ksef invoice get <ksef-number>`
- **THEN** CLI downloads the invoice XML and outputs it to stdout

#### Scenario: Download invoice to file
- **WHEN** user runs `ksef invoice get <ksef-number> -o invoice.xml`
- **THEN** CLI downloads the invoice XML and writes it to the specified file

#### Scenario: Invoice not found
- **WHEN** user runs `ksef invoice get <invalid-number>` and the API returns 404
- **THEN** CLI SHALL display an error indicating the invoice was not found

### Requirement: Query invoice metadata
The CLI SHALL provide `ksef invoice query` with filter flags to query invoice metadata. The `--from` date flag MUST be required.

#### Scenario: Basic date range query
- **WHEN** user runs `ksef invoice query --from 2026-01-01 --to 2026-01-31`
- **THEN** CLI calls `queryInvoiceMetadata()` with the date range and displays a table of invoices with columns: KSeF Number, Invoice Number, Date, Seller NIP, Gross Amount, Currency

#### Scenario: Query with seller filter
- **WHEN** user runs `ksef invoice query --from 2026-01-01 --seller-nip 1234567890`
- **THEN** CLI adds sellerNip filter to the query

#### Scenario: Query with buyer filter
- **WHEN** user runs `ksef invoice query --from 2026-01-01 --buyer-nip 9876543210`
- **THEN** CLI sets `buyerIdentifier` with type `Nip` and the provided value

#### Scenario: Query with amount range
- **WHEN** user runs `ksef invoice query --from 2026-01-01 --amount-from 1000 --amount-to 5000`
- **THEN** CLI adds amount filter with type `Brutto` (default) and the specified range

#### Scenario: Query with amount type override
- **WHEN** user runs `ksef invoice query --from 2026-01-01 --amount-from 1000 --amount-type Netto`
- **THEN** CLI uses `Netto` as the amount type instead of default `Brutto`

#### Scenario: Query with currency filter
- **WHEN** user runs `ksef invoice query --from 2026-01-01 --currency EUR`
- **THEN** CLI sets `currencyCodes` to `["EUR"]`

#### Scenario: Query with subject type
- **WHEN** user runs `ksef invoice query --from 2026-01-01 --subject-type Subject2`
- **THEN** CLI queries received invoices (buyer perspective) instead of default `Subject1`

#### Scenario: Query with pagination
- **WHEN** user runs `ksef invoice query --from 2026-01-01 --page 2 --size 50`
- **THEN** CLI passes `pageOffset=2` and `pageSize=50` to the query

#### Scenario: Query missing required --from
- **WHEN** user runs `ksef invoice query` without `--from`
- **THEN** CLI SHALL display an error indicating `--from` is required

#### Scenario: JSON output
- **WHEN** user runs `ksef invoice query --from 2026-01-01 --json`
- **THEN** CLI outputs the raw `PagedInvoiceResponse` as JSON

### Requirement: Start invoice export
The CLI SHALL provide `ksef invoice export` to start an async invoice export. It accepts the same filter flags as `ksef invoice query`. Crypto MUST be initialized for encryption info.

#### Scenario: Start export
- **WHEN** user runs `ksef invoice export --from 2026-01-01 --to 2026-01-31`
- **THEN** CLI initializes crypto, builds `InvoiceExportRequest` with filters and encryption info, calls `exportInvoices()`, and displays the operation reference number

#### Scenario: Export with filters
- **WHEN** user runs `ksef invoice export --from 2026-01-01 --seller-nip 1234567890`
- **THEN** CLI applies the same filter mapping as `invoice query`

### Requirement: Check export status
The CLI SHALL provide `ksef invoice export-status <ref>` to check the status of an invoice export.

#### Scenario: Export in progress
- **WHEN** user runs `ksef invoice export-status <ref>` and the export is still processing
- **THEN** CLI displays the current status (e.g., "Processing")

#### Scenario: Export completed
- **WHEN** user runs `ksef invoice export-status <ref>` and the export is complete
- **THEN** CLI displays the status, completion date, package info (invoice count, size), and download URLs for each part

#### Scenario: JSON output
- **WHEN** user runs `ksef invoice export-status <ref> --json`
- **THEN** CLI outputs the raw `InvoiceExportStatusResponse` as JSON

### Requirement: Global flags support
All invoice commands SHALL respect global flags: `--env`, `--json`, `--nip`, `--timeout`.

#### Scenario: JSON output on any invoice command
- **WHEN** any invoice command is run with `--json`
- **THEN** output MUST be raw JSON, no tables or spinners

#### Scenario: Environment override
- **WHEN** any invoice command is run with `--env demo`
- **THEN** CLI MUST use the demo environment regardless of stored config
