## ADDED Requirements

### Requirement: Verbose global flag
All CLI commands SHALL accept a `--verbose` flag. When set, the CLI SHALL set `consola.level` to 4 (debug) so that all `consola.debug()` calls become visible.

#### Scenario: Verbose flag present
- **WHEN** user runs any command with `--verbose`
- **THEN** the CLI SHALL enable debug-level logging before executing the command

#### Scenario: Verbose flag absent
- **WHEN** user runs any command without `--verbose`
- **THEN** debug-level log messages SHALL NOT be displayed

### Requirement: HTTP request/response logging
When verbose mode is active, `RestClient` SHALL log each HTTP request and response using `consola.debug`. Logged details SHALL include: HTTP method, full URL, response status code, and response time in milliseconds. Request/response bodies SHALL NOT be logged (may contain sensitive data).

#### Scenario: Verbose HTTP logging
- **WHEN** user runs `ksef lighthouse status --verbose`
- **THEN** the CLI SHALL display lines like `GET https://ksef-test.mf.gov.pl/... → 200 (123ms)` to stderr via consola.debug

#### Scenario: JSON output not affected
- **WHEN** user runs with `--verbose --json`
- **THEN** verbose logs SHALL go to stderr via consola.debug, and JSON output SHALL go to stdout via console.log, without interference

### Requirement: Verbose flag in GlobalOptions
The `verbose` field in `GlobalOptions` SHALL be wired through `getGlobalOpts` in all command files. The `client-factory.ts` SHALL check `globalOpts.verbose` and set `consola.level = 4` when truthy.

#### Scenario: Verbose propagation
- **WHEN** `createClient` or `requireSession` is called with `{ verbose: true }`
- **THEN** `consola.level` SHALL be set to 4 before client creation
