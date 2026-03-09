## ADDED Requirements

### Requirement: Environment gating
All `ksef test-data` subcommands SHALL refuse to run when the resolved environment is `prod`. The CLI SHALL display an error: "Test data commands are only available in test/demo environments."

#### Scenario: Run on prod environment
- **WHEN** user runs any `ksef test-data` subcommand with `--env prod` or config set to prod
- **THEN** the CLI SHALL display an error and exit without calling the API

#### Scenario: Run on test environment
- **WHEN** user runs with `--env test` (or config default is test)
- **THEN** the CLI SHALL proceed normally

### Requirement: Create test subject
The `ksef test-data create-subject` command SHALL create a test subject. Required flags: `--nip`, `--type` (EnforcementAuthority/VatGroup/JST), `--description`. Optional: `--created-date`.

#### Scenario: Create subject
- **WHEN** user runs `ksef test-data create-subject --nip 1234567890 --type VatGroup --description "Test company"`
- **THEN** the CLI SHALL call `TestDataService.createSubject` and display the status response

#### Scenario: Create with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Remove test subject
The `ksef test-data remove-subject` command SHALL remove a test subject by NIP.

#### Scenario: Remove subject
- **WHEN** user runs `ksef test-data remove-subject --nip 1234567890`
- **THEN** the CLI SHALL call `TestDataService.removeSubject` and display the status response

#### Scenario: Remove with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Create test person
The `ksef test-data create-person` command SHALL create a test person. Required flags: `--nip`, `--pesel`, `--description`. Optional: `--bailiff` (boolean), `--deceased` (boolean), `--created-date`.

#### Scenario: Create person
- **WHEN** user runs `ksef test-data create-person --nip 1234567890 --pesel 12345678901 --description "Jan Kowalski"`
- **THEN** the CLI SHALL call `TestDataService.createPerson` with `isBailiff: false` by default and display the status response

#### Scenario: Create with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Remove test person
The `ksef test-data remove-person` command SHALL remove a test person by NIP.

#### Scenario: Remove person
- **WHEN** user runs `ksef test-data remove-person --nip 1234567890`
- **THEN** the CLI SHALL call `TestDataService.removePerson` and display the status response

#### Scenario: Remove with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Grant test permissions
The `ksef test-data grant-permissions` command SHALL grant permissions to a test identity. Required flags: `--context-nip`, `--identifier` (value), `--identifier-type` (Nip/Pesel/Fingerprint), `--permissions` (comma-separated list).

#### Scenario: Grant permissions
- **WHEN** user runs `ksef test-data grant-permissions --context-nip 1111111111 --identifier 22222222222 --identifier-type Pesel --permissions InvoiceRead,InvoiceWrite`
- **THEN** the CLI SHALL call `TestDataService.grantPermissions` and display the status response

#### Scenario: Grant with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Revoke test permissions
The `ksef test-data revoke-permissions` command SHALL revoke permissions from a test identity. Same flags as grant-permissions.

#### Scenario: Revoke permissions
- **WHEN** user runs `ksef test-data revoke-permissions --context-nip 1111111111 --identifier 22222222222 --identifier-type Pesel --permissions InvoiceRead`
- **THEN** the CLI SHALL call `TestDataService.revokePermissions` and display the status response

#### Scenario: Revoke with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Enable attachment permission
The `ksef test-data enable-attachment` command SHALL enable attachment permissions for a NIP.

#### Scenario: Enable attachment
- **WHEN** user runs `ksef test-data enable-attachment --nip 1234567890`
- **THEN** the CLI SHALL call `TestDataService.enableAttachment` and display the status response

#### Scenario: Enable with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Disable attachment permission
The `ksef test-data disable-attachment` command SHALL disable attachment permissions for a NIP. Optional: `--end-date` (ISO format).

#### Scenario: Disable attachment
- **WHEN** user runs `ksef test-data disable-attachment --nip 1234567890`
- **THEN** the CLI SHALL call `TestDataService.disableAttachment` and display the status response

#### Scenario: Disable with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Change session limits
The `ksef test-data change-session-limits` command SHALL change session limits for the current context. Required flags: `--max-invoices` (number), `--max-duration` (minutes). Requires active session.

#### Scenario: Change limits
- **WHEN** user runs `ksef test-data change-session-limits --max-invoices 1000 --max-duration 120`
- **THEN** the CLI SHALL call `TestDataService.changeSessionLimits` with the access token and display the status response

#### Scenario: Change with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Restore default session limits
The `ksef test-data restore-session-limits` command SHALL restore default session limits. Requires active session.

#### Scenario: Restore limits
- **WHEN** user runs `ksef test-data restore-session-limits`
- **THEN** the CLI SHALL call `TestDataService.restoreDefaultSessionLimits` with the access token and display a success message

#### Scenario: Restore with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Change certificate limits
The `ksef test-data change-cert-limits` command SHALL change the certificate limit. Required flag: `--limit` (number). Requires active session.

#### Scenario: Change certificate limit
- **WHEN** user runs `ksef test-data change-cert-limits --limit 10`
- **THEN** the CLI SHALL call `TestDataService.changeCertificatesLimit` with the access token and display the status response

#### Scenario: Change with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Restore default certificate limits
The `ksef test-data restore-cert-limits` command SHALL restore default certificate limits. Requires active session.

#### Scenario: Restore certificate limits
- **WHEN** user runs `ksef test-data restore-cert-limits`
- **THEN** the CLI SHALL call `TestDataService.restoreDefaultCertificatesLimit` with the access token and display a success message

#### Scenario: Restore with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Set rate limits
The `ksef test-data set-rate-limits` command SHALL set custom API rate limits. Required flags: `--context-nip`, `--limits` (JSON string mapping endpoint patterns to `{maxCallsPerInterval, intervalMs}`). Requires active session.

#### Scenario: Set rate limits
- **WHEN** user runs `ksef test-data set-rate-limits --context-nip 1234567890 --limits '{"POST:/api/v2/invoices":{"maxCallsPerInterval":100,"intervalMs":60000}}'`
- **THEN** the CLI SHALL call `TestDataService.setRateLimits` with the access token and display the status response

#### Scenario: Set with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Restore default rate limits
The `ksef test-data restore-rate-limits` command SHALL restore default API rate limits. Requires active session.

#### Scenario: Restore rate limits
- **WHEN** user runs `ksef test-data restore-rate-limits`
- **THEN** the CLI SHALL call `TestDataService.restoreDefaultRateLimits` with the access token and display a success message

#### Scenario: Restore with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Set production rate limits
The `ksef test-data set-production-rate-limits` command SHALL set production-level rate limits for testing. Same flags as set-rate-limits.

#### Scenario: Set production rate limits
- **WHEN** user runs `ksef test-data set-production-rate-limits --context-nip 1234567890 --limits '{"POST:/api/v2/invoices":{"maxCallsPerInterval":50,"intervalMs":60000}}'`
- **THEN** the CLI SHALL call `TestDataService.setProductionRateLimits` with the access token and display the status response

#### Scenario: Set with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Restore default production rate limits
The `ksef test-data restore-production-rate-limits` command SHALL restore default production rate limits. Requires active session.

#### Scenario: Restore production rate limits
- **WHEN** user runs `ksef test-data restore-production-rate-limits`
- **THEN** the CLI SHALL call `TestDataService.restoreDefaultProductionRateLimits` with the access token and display a success message

#### Scenario: Restore with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Block context
The `ksef test-data block-context` command SHALL block a context by NIP. Required flag: `--context-nip`. Requires active session.

#### Scenario: Block context
- **WHEN** user runs `ksef test-data block-context --context-nip 1234567890`
- **THEN** the CLI SHALL call `TestDataService.blockContext` with the access token and display the status response

#### Scenario: Block with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Unblock context
The `ksef test-data unblock-context` command SHALL unblock a context by NIP. Required flag: `--context-nip`. Requires active session.

#### Scenario: Unblock context
- **WHEN** user runs `ksef test-data unblock-context --context-nip 1234567890`
- **THEN** the CLI SHALL call `TestDataService.unblockContext` with the access token and display the status response

#### Scenario: Unblock with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the `TestDataStatusResponse` as JSON

### Requirement: Test-data command group registration
The `testDataCommand` SHALL be exported from `src/cli/commands/test-data.ts` and registered in `src/cli/index.ts` under the `test-data` subcommand key.

#### Scenario: Help output
- **WHEN** user runs `ksef test-data --help`
- **THEN** the CLI SHALL list all subcommands: create-subject, remove-subject, create-person, remove-person, grant-permissions, revoke-permissions, enable-attachment, disable-attachment, change-session-limits, restore-session-limits, change-cert-limits, restore-cert-limits, set-rate-limits, restore-rate-limits, set-production-rate-limits, restore-production-rate-limits, block-context, unblock-context
