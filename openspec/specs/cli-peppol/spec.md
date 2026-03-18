## ADDED Requirements

### Requirement: Query Peppol providers
The CLI SHALL provide `ksef peppol providers` to list Peppol providers. It MUST call `PeppolService.queryProviders()`. Results SHALL be displayed as a table with columns: Identifier, Name, Description, Created. The `--page-size` and `--page` flags SHALL control pagination.

#### Scenario: List providers
- **WHEN** user runs `ksef peppol providers`
- **THEN** CLI SHALL call `PeppolService.queryProviders()` and display a table of providers

#### Scenario: List with pagination
- **WHEN** user runs `ksef peppol providers --page 2 --page-size 10`
- **THEN** CLI SHALL pass `pageOffset: 2` and `pageSize: 10` to the service

#### Scenario: No providers found
- **WHEN** the response `providers` array is empty
- **THEN** CLI SHALL display a "No providers found." warning

#### Scenario: More results available
- **WHEN** the response `hasMore` is `true`
- **THEN** CLI SHALL display a message indicating more results are available with `--page`

#### Scenario: JSON output
- **WHEN** user runs `ksef peppol providers --json`
- **THEN** CLI SHALL output the full `QueryPeppolProvidersResponse` as JSON

#### Scenario: No auth session
- **WHEN** user runs `ksef peppol providers` without a stored auth session
- **THEN** CLI SHALL display an error suggesting `ksef auth login`

### Requirement: Peppol command group registration
The `peppolCommand` SHALL be exported from `src/cli/commands/peppol.ts` and registered in `src/cli/index.ts` under the `peppol` subcommand key.

#### Scenario: Help output
- **WHEN** user runs `ksef peppol --help`
- **THEN** CLI SHALL list subcommands: providers

### Requirement: Global flags support
All peppol commands SHALL respect global flags: `--env`, `--json`, `--verbose`, `--timeout`.

#### Scenario: Environment override
- **WHEN** any peppol command is run with `--env prod`
- **THEN** CLI MUST use the production environment regardless of stored config
