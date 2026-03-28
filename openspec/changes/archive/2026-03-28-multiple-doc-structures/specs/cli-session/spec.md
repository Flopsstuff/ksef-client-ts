## MODIFIED Requirements

### Requirement: Open online session
The CLI SHALL provide `ksef session open` to open an online KSeF session. It MUST use the stored access token and NIP from config/flags. It MUST accept an optional `--form-code <key>` flag where `<key>` is one of `FA2`, `FA3`, `PEF3`, `PEFKOR3`, `FARR1` (default: `FA2`). The returned session reference MUST be persisted in `SessionData.onlineSessionRef` for use by subsequent commands.

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

#### Scenario: Open online session with form code
- **WHEN** user runs `ksef session open --form-code FA3`
- **THEN** CLI SHALL resolve `FA3` to `FORM_CODES.FA_3` and pass it as `formCode` to the session open request

#### Scenario: Open online session with PEF form code
- **WHEN** user runs `ksef session open --form-code PEF3`
- **THEN** CLI SHALL resolve `PEF3` to `FORM_CODES.PEF_3` and open the session with PEF document type

#### Scenario: Open online session with invalid form code key
- **WHEN** user runs `ksef session open --form-code INVALID`
- **THEN** CLI SHALL display an error listing valid keys: FA2, FA3, PEF3, PEFKOR3, FARR1

#### Scenario: Open online session with default form code
- **WHEN** user runs `ksef session open` without `--form-code`
- **THEN** CLI SHALL use `FORM_CODES.FA_2` as the default

### Requirement: Batch session via invoice send
Batch sessions SHALL NOT be opened directly via `ksef session open --batch`. Instead, batch sessions are managed internally by `ksef invoice send <dir/>`. If `--batch` is provided to `session open`, the CLI MUST display an error directing the user to `ksef invoice send <dir/>`.

#### Scenario: Reject standalone batch open
- **WHEN** user runs `ksef session open --batch`
- **THEN** CLI SHALL display an error explaining that batch sessions are managed by `ksef invoice send <dir/>`
