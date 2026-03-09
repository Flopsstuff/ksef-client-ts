## ADDED Requirements

### Requirement: Check KSeF system status
The `ksef lighthouse status` command SHALL check KSeF system availability. The command SHALL NOT require an active session. It SHALL use `createClient` only to resolve the environment URL.

#### Scenario: System available
- **WHEN** user runs `ksef lighthouse status`
- **THEN** the CLI SHALL call `LighthouseService.getStatus` and display key-value pairs showing system availability status

#### Scenario: System unavailable
- **WHEN** the system reports unavailability
- **THEN** the CLI SHALL display a warning with the status details

#### Scenario: Status with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full `KsefStatusResponse` as JSON

### Requirement: View system messages
The `ksef lighthouse messages` command SHALL display KSeF system messages. The command SHALL NOT require an active session.

#### Scenario: Messages available
- **WHEN** user runs `ksef lighthouse messages`
- **THEN** the CLI SHALL call `LighthouseService.getMessages` and display results as a table with relevant columns

#### Scenario: No messages
- **WHEN** the system returns no messages
- **THEN** the CLI SHALL display a "No system messages." info message

#### Scenario: Messages with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full messages array as JSON

### Requirement: Lighthouse command group registration
The `lighthouseCommand` SHALL be exported from `src/cli/commands/lighthouse.ts` and registered in `src/cli/index.ts` under the `lighthouse` subcommand key.

#### Scenario: Help output
- **WHEN** user runs `ksef lighthouse --help`
- **THEN** the CLI SHALL list subcommands: status, messages
