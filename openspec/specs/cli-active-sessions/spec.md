## ADDED Requirements

### Requirement: List active sessions
The CLI SHALL provide `ksef session active` to list active authentication sessions. It MUST call `ActiveSessionsService.getActiveSessions()`. Results SHALL be displayed as a table with columns: Reference, Start Date, Auth Method, Status, Is Current. The `--page-size` flag SHALL control pagination. If a continuation token is returned, the CLI SHALL display it.

#### Scenario: List active sessions
- **WHEN** user runs `ksef session active`
- **THEN** CLI SHALL call `ActiveSessionsService.getActiveSessions()` and display a table of active sessions

#### Scenario: List with pagination
- **WHEN** user runs `ksef session active --page-size 10`
- **THEN** CLI SHALL pass `pageSize: 10` to the service and display continuation token if present

#### Scenario: No active sessions
- **WHEN** the response contains an empty `items` array
- **THEN** CLI SHALL display a "No active sessions found." warning

#### Scenario: JSON output
- **WHEN** user runs `ksef session active --json`
- **THEN** CLI SHALL output the full `AuthenticationListResponse` as JSON

#### Scenario: No auth session
- **WHEN** user runs `ksef session active` without a stored auth session
- **THEN** CLI SHALL display an error suggesting `ksef auth login`

### Requirement: Revoke active session by reference
The CLI SHALL provide `ksef session revoke <ref>` to revoke a specific active session by its reference number. It MUST call `ActiveSessionsService.revokeSession(ref)`.

#### Scenario: Revoke session by reference
- **WHEN** user runs `ksef session revoke abc123`
- **THEN** CLI SHALL call `ActiveSessionsService.revokeSession("abc123")` and display a success message

#### Scenario: Revoke with JSON output
- **WHEN** user runs `ksef session revoke abc123 --json`
- **THEN** CLI SHALL output `{ "status": "revoked", "reference": "abc123" }` as JSON

### Requirement: Revoke current active session
The CLI SHALL support `ksef session revoke --current` to revoke the caller's current active session. It MUST call `ActiveSessionsService.revokeCurrentSession()`.

#### Scenario: Revoke current session
- **WHEN** user runs `ksef session revoke --current`
- **THEN** CLI SHALL call `ActiveSessionsService.revokeCurrentSession()` and display a success message

#### Scenario: Revoke with neither ref nor --current
- **WHEN** user runs `ksef session revoke` with no positional argument and no `--current` flag
- **THEN** CLI SHALL display an error requesting either a reference or `--current`
