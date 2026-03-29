## ADDED Requirements

### Requirement: Persistent credentials storage

The system SHALL provide a credentials store that persists long-lived CLI credentials (API tokens) in `~/.ksef/credentials.json`, separate from config and session files. The file SHALL be created with mode `0o600` (owner read/write only).

#### Scenario: Save credentials
- **WHEN** `saveCredentials({ token: "abc123" })` is called
- **THEN** the credentials SHALL be written to `~/.ksef/credentials.json` with file mode `0o600`

#### Scenario: Load existing credentials
- **WHEN** `loadCredentials()` is called and `~/.ksef/credentials.json` exists with valid JSON
- **THEN** the function SHALL return the parsed `CliCredentials` object

#### Scenario: Load when no credentials file exists
- **WHEN** `loadCredentials()` is called and `~/.ksef/credentials.json` does not exist
- **THEN** the function SHALL return `null`

#### Scenario: Clear credentials
- **WHEN** `clearCredentials()` is called
- **THEN** `~/.ksef/credentials.json` SHALL be deleted, and no error SHALL be thrown if the file does not exist

#### Scenario: Parent directory created automatically
- **WHEN** `saveCredentials()` is called and `~/.ksef/` does not exist
- **THEN** the directory SHALL be created recursively before writing the file
