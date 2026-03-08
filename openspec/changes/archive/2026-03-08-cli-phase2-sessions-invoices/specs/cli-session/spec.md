## ADDED Requirements

### Requirement: Open online session
The CLI SHALL provide `ksef session open` to open an online KSeF session. It MUST use the stored access token and NIP from config/flags. The returned session reference MUST be persisted in `SessionData.onlineSessionRef` for use by subsequent commands.

#### Scenario: Open online session with stored config
- **WHEN** user runs `ksef session open` with valid auth session and NIP configured
- **THEN** CLI calls `OnlineSessionService.openSession()` with access token, displays the session reference number and validity date, and stores the session ref in session store

#### Scenario: Open online session with NIP override
- **WHEN** user runs `ksef session open --nip 1234567890`
- **THEN** CLI uses the provided NIP instead of the stored config NIP

#### Scenario: Open online session without auth
- **WHEN** user runs `ksef session open` without a valid auth session
- **THEN** CLI SHALL display an error suggesting `ksef auth login`

#### Scenario: Open online session without NIP
- **WHEN** user runs `ksef session open` with no NIP in config and no `--nip` flag
- **THEN** CLI SHALL display an error requesting NIP via `--nip` or `ksef config set --nip`

### Requirement: Batch session via invoice send
Batch sessions SHALL NOT be opened directly via `ksef session open --batch`. Instead, batch sessions are managed internally by `ksef invoice send <dir/>`. If `--batch` is provided to `session open`, the CLI MUST display an error directing the user to `ksef invoice send <dir/>`.

#### Scenario: Reject standalone batch open
- **WHEN** user runs `ksef session open --batch`
- **THEN** CLI SHALL display an error explaining that batch sessions are managed by `ksef invoice send <dir/>`

### Requirement: Close session
The CLI SHALL provide `ksef session close [ref]` to close a KSeF session. If no ref is provided, it MUST use the stored `onlineSessionRef`.

#### Scenario: Close current session
- **WHEN** user runs `ksef session close` with a stored session ref
- **THEN** CLI calls `OnlineSessionService.closeSession()` with the stored ref, displays success, and clears `onlineSessionRef` from session store

#### Scenario: Close session by reference
- **WHEN** user runs `ksef session close <ref>`
- **THEN** CLI closes the session identified by the provided reference

#### Scenario: Close with no active session
- **WHEN** user runs `ksef session close` with no stored session ref and no positional argument
- **THEN** CLI SHALL display an error indicating no active session to close

### Requirement: Session status
The CLI SHALL provide `ksef session status [ref]` to check session status. If no ref is provided, it MUST use the stored `onlineSessionRef`.

#### Scenario: Get status of current session
- **WHEN** user runs `ksef session status` with a stored session ref
- **THEN** CLI displays session status including state, invoice counts, and validity dates

#### Scenario: Get status by reference
- **WHEN** user runs `ksef session status <ref>`
- **THEN** CLI displays status for the specified session reference

#### Scenario: JSON output
- **WHEN** user runs `ksef session status --json`
- **THEN** CLI outputs the raw `SessionStatusResponse` as JSON

### Requirement: List sessions
The CLI SHALL provide `ksef session list` to list sessions. It MUST accept `--type online|batch` flag (default: `online`) and optional `--page-size` flag.

#### Scenario: List online sessions
- **WHEN** user runs `ksef session list`
- **THEN** CLI displays a table of online sessions with columns: Reference, Status, Created, Invoices (total/success/failed)

#### Scenario: List batch sessions
- **WHEN** user runs `ksef session list --type batch`
- **THEN** CLI displays batch sessions in the same table format

#### Scenario: List with pagination
- **WHEN** user runs `ksef session list --page-size 10`
- **THEN** CLI requests 10 sessions per page and displays continuation token if more results exist

### Requirement: List session invoices
The CLI SHALL provide `ksef session invoices [ref]` to list invoices in a session. If no ref is provided, it MUST use the stored `onlineSessionRef`.

#### Scenario: List invoices in current session
- **WHEN** user runs `ksef session invoices` with a stored session ref
- **THEN** CLI displays a table of invoices with columns: Ordinal, Invoice Number, KSeF Number, Status, Date

#### Scenario: List invoices with pagination
- **WHEN** user runs `ksef session invoices --page-size 20`
- **THEN** CLI requests 20 invoices per page and displays continuation token if more exist

### Requirement: List failed invoices
The CLI SHALL provide `ksef session failed [ref]` to list failed invoices in a session. Behavior mirrors `session invoices` but calls `getSessionFailedInvoices()`.

#### Scenario: List failed invoices
- **WHEN** user runs `ksef session failed`
- **THEN** CLI displays a table of failed invoices with status details

#### Scenario: No failed invoices
- **WHEN** user runs `ksef session failed` and there are no failures
- **THEN** CLI displays a message indicating no failed invoices

### Requirement: Download UPO
The CLI SHALL provide `ksef session upo <session-ref>` to download UPO (Urzedowe Poswiadczenie Odbioru). It MUST support three retrieval modes via flags.

#### Scenario: Download UPO by session UPO reference
- **WHEN** user runs `ksef session upo <session-ref> --upo-ref <upo-ref>`
- **THEN** CLI calls `getSessionUpo()` and outputs the UPO XML to stdout

#### Scenario: Download UPO by KSeF number
- **WHEN** user runs `ksef session upo <session-ref> --ksef-number <num>`
- **THEN** CLI calls `getInvoiceUpoByKsefNumber()` and outputs the UPO XML

#### Scenario: Download UPO by invoice reference
- **WHEN** user runs `ksef session upo <session-ref> --invoice-ref <iref>`
- **THEN** CLI calls `getInvoiceUpoByReference()` and outputs the UPO XML

#### Scenario: Save UPO to file
- **WHEN** user runs `ksef session upo <session-ref> --ksef-number <num> -o upo.xml`
- **THEN** CLI writes the UPO XML to the specified file path

#### Scenario: No retrieval mode specified
- **WHEN** user runs `ksef session upo <session-ref>` without `--upo-ref`, `--ksef-number`, or `--invoice-ref`
- **THEN** CLI SHALL display an error requesting one of the three flags

### Requirement: Global flags support
All session commands SHALL respect global flags: `--env`, `--json`, `--nip`, `--timeout`.

#### Scenario: JSON output on any session command
- **WHEN** any session command is run with `--json`
- **THEN** output MUST be raw JSON, no tables or spinners

#### Scenario: Environment override
- **WHEN** any session command is run with `--env prod`
- **THEN** CLI MUST use the production environment regardless of stored config
