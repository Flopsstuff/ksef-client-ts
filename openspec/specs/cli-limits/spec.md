## ADDED Requirements

### Requirement: View context limits
The CLI SHALL provide `ksef limits context` to display effective context limits. It MUST call `LimitsService.getContextLimits()` and display online and batch session limits as key-value pairs: Max Invoice Size (MB), Max Invoice+Attachment Size (MB), Max Invoices — for each session type.

#### Scenario: View context limits
- **WHEN** user runs `ksef limits context`
- **THEN** CLI SHALL call `LimitsService.getContextLimits()` and display online and batch limits as labeled key-value pairs

#### Scenario: JSON output
- **WHEN** user runs `ksef limits context --json`
- **THEN** CLI SHALL output the full `EffectiveContextLimits` as JSON

#### Scenario: No auth session
- **WHEN** user runs `ksef limits context` without a stored auth session
- **THEN** CLI SHALL display an error suggesting `ksef auth login`

### Requirement: View subject limits
The CLI SHALL provide `ksef limits subject` to display effective subject limits. It MUST call `LimitsService.getSubjectLimits()` and display enrollment and certificate limits as key-value pairs.

#### Scenario: View subject limits
- **WHEN** user runs `ksef limits subject`
- **THEN** CLI SHALL call `LimitsService.getSubjectLimits()` and display key-value pairs: Max Enrollments, Max Certificates (displaying "Unlimited" if null)

#### Scenario: JSON output
- **WHEN** user runs `ksef limits subject --json`
- **THEN** CLI SHALL output the full `EffectiveSubjectLimits` as JSON

### Requirement: View rate limits
The CLI SHALL provide `ksef limits rate` to display effective API rate limits. It MUST call `LimitsService.getRateLimits()` and display per-category rate limits as a table with columns: Category, Per Second, Per Minute, Per Hour.

#### Scenario: View rate limits
- **WHEN** user runs `ksef limits rate`
- **THEN** CLI SHALL call `LimitsService.getRateLimits()` and display a table with one row per rate-limit category (onlineSession, batchSession, invoiceSend, etc.)

#### Scenario: JSON output
- **WHEN** user runs `ksef limits rate --json`
- **THEN** CLI SHALL output the full `EffectiveApiRateLimits` as JSON

### Requirement: Limits command group registration
The `limitsCommand` SHALL be exported from `src/cli/commands/limits.ts` and registered in `src/cli/index.ts` under the `limits` subcommand key.

#### Scenario: Help output
- **WHEN** user runs `ksef limits --help`
- **THEN** CLI SHALL list subcommands: context, subject, rate

### Requirement: Global flags support
All limits commands SHALL respect global flags: `--env`, `--json`, `--verbose`, `--timeout`.

#### Scenario: Environment override
- **WHEN** any limits command is run with `--env prod`
- **THEN** CLI MUST use the production environment regardless of stored config
