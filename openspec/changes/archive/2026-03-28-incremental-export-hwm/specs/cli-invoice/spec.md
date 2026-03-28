## MODIFIED Requirements

### Requirement: Global flags support
All invoice commands SHALL respect global flags: `--env`, `--json`, `--nip`, `--timeout`. The `ksef invoice` command group SHALL include the `export-incremental` subcommand in its help output.

#### Scenario: JSON output on any invoice command
- **WHEN** any invoice command is run with `--json`
- **THEN** output MUST be raw JSON, no tables or spinners

#### Scenario: Environment override
- **WHEN** any invoice command is run with `--env demo`
- **THEN** CLI MUST use the demo environment regardless of stored config

#### Scenario: Help includes export-incremental
- **WHEN** user runs `ksef invoice --help`
- **THEN** the help output SHALL list `export-incremental` among available subcommands
