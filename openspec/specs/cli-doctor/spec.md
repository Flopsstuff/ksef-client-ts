## ADDED Requirements

### Requirement: Config check
The `ksef doctor` command SHALL check if `~/.ksef/config.json` exists and is valid JSON. It SHALL display the resolved environment and NIP if configured.

#### Scenario: Config exists and is valid
- **WHEN** user runs `ksef doctor` and config file exists
- **THEN** the CLI SHALL display "✓ Config OK (env: test, nip: 1234567890)"

#### Scenario: Config missing
- **WHEN** user runs `ksef doctor` and no config file exists
- **THEN** the CLI SHALL display "✗ Config not found. Run `ksef config set` to configure."

#### Scenario: Config invalid JSON
- **WHEN** the config file contains invalid JSON
- **THEN** the CLI SHALL display "✗ Config file is corrupted."

### Requirement: Connectivity check
The `ksef doctor` command SHALL test API connectivity by calling the lighthouse status endpoint with a short timeout (5 seconds). No authentication is required.

#### Scenario: API reachable
- **WHEN** the lighthouse status endpoint responds successfully
- **THEN** the CLI SHALL display "✓ API reachable (<env> — <url>)"

#### Scenario: API unreachable
- **WHEN** the lighthouse status endpoint fails or times out
- **THEN** the CLI SHALL display "✗ Cannot reach API at <url>. Check network and environment."

### Requirement: Session check
The `ksef doctor` command SHALL check if a stored session exists and whether it is expired.

#### Scenario: Valid session
- **WHEN** a session file exists and the session is not expired
- **THEN** the CLI SHALL display "✓ Session active (expires: <date>)"

#### Scenario: Expired session
- **WHEN** a session file exists but the session is expired
- **THEN** the CLI SHALL display "✗ Session expired. Run `ksef auth login` to re-authenticate."

#### Scenario: No session
- **WHEN** no session file exists
- **THEN** the CLI SHALL display "⚠ No session stored. Run `ksef auth login` to authenticate."

### Requirement: Summary output
After all checks, `ksef doctor` SHALL display a summary line: "N/M checks passed."

#### Scenario: All checks pass
- **WHEN** all checks pass
- **THEN** the CLI SHALL display "3/3 checks passed." with a success style

#### Scenario: Some checks fail
- **WHEN** 1 out of 3 checks fail
- **THEN** the CLI SHALL display "2/3 checks passed." with a warning style

### Requirement: Doctor JSON output
When `--json` is passed, `ksef doctor` SHALL output a JSON object with check results instead of formatted text.

#### Scenario: JSON output
- **WHEN** user runs `ksef doctor --json`
- **THEN** the CLI SHALL output JSON with fields: `config` (object with status/details), `connectivity` (object with status/url), `session` (object with status/details), `summary` (object with passed/total)

### Requirement: Doctor command registration
The `doctorCommand` SHALL be exported from `src/cli/commands/doctor.ts` and registered in `src/cli/index.ts` under the `doctor` subcommand key.

#### Scenario: Help output
- **WHEN** user runs `ksef doctor --help`
- **THEN** the CLI SHALL display the doctor command description and available flags
