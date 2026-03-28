## ADDED Requirements

### Requirement: Incremental export command
The CLI SHALL provide `ksef invoice export-incremental` to perform incremental invoice export with persistent HWM state. The `--from` flag MUST be required. The command SHALL use `FileHwmStore` for state persistence between invocations.

#### Scenario: First run with basic date range
- **WHEN** user runs `ksef invoice export-incremental --from 2026-01-01 --to 2026-03-01`
- **THEN** CLI SHALL create a state file (default `./ksef-hwm-state.json`), run incremental export iterations, save decrypted parts to the output directory, and display progress per iteration

#### Scenario: Resume from saved state
- **WHEN** user runs `ksef invoice export-incremental --from 2026-01-01 --to 2026-03-01` and `./ksef-hwm-state.json` already contains `{ "Subject1": "2026-01-15T12:00:00Z" }`
- **THEN** CLI SHALL resume from the saved continuation point, starting the first iteration from `2026-01-15T12:00:00Z`

#### Scenario: Missing required --from
- **WHEN** user runs `ksef invoice export-incremental` without `--from`
- **THEN** CLI SHALL display an error indicating `--from` is required

### Requirement: State file option
The command SHALL accept `--state-file <path>` to specify the HWM state file location. Default SHALL be `./ksef-hwm-state.json`.

#### Scenario: Custom state file path
- **WHEN** user runs `ksef invoice export-incremental --from 2026-01-01 --state-file ./my-state.json`
- **THEN** CLI SHALL use `./my-state.json` for loading and saving HWM state

#### Scenario: State file auto-creation
- **WHEN** the state file does not exist on first run
- **THEN** CLI SHALL create it with an empty `{}` after the first iteration completes

### Requirement: Output directory option
The command SHALL accept `--output-dir <path>` to specify where decrypted export parts are saved. Default SHALL be `./ksef-exports/`.

#### Scenario: Custom output directory
- **WHEN** user runs `ksef invoice export-incremental --from 2026-01-01 --output-dir ./my-exports/`
- **THEN** decrypted parts SHALL be saved to `./my-exports/`

#### Scenario: Output directory auto-creation
- **WHEN** the output directory does not exist
- **THEN** CLI SHALL create it automatically (recursive mkdir)

#### Scenario: File naming
- **WHEN** iteration 1 produces 2 parts and iteration 2 produces 1 part
- **THEN** files SHALL be named with iteration and part numbers (e.g., `iter-001-part-001.zip`, `iter-001-part-002.zip`, `iter-002-part-001.zip`)

### Requirement: Max iterations option
The command SHALL accept `--max-iterations <n>` to limit the number of export iterations. Default SHALL be 20.

#### Scenario: Custom max iterations
- **WHEN** user runs `ksef invoice export-incremental --from 2026-01-01 --max-iterations 5`
- **THEN** the workflow SHALL stop after at most 5 iterations

### Requirement: Subject type option
The command SHALL accept `--subject-type <type>` to specify the invoice subject type. Default SHALL be `Subject1`.

#### Scenario: Export received invoices
- **WHEN** user runs `ksef invoice export-incremental --from 2026-01-01 --subject-type Subject2`
- **THEN** the workflow SHALL query received invoices (buyer perspective)

### Requirement: Progress display
The command SHALL display progress information during execution, including iteration number, invoices found, HWM advancement, and a summary upon completion.

#### Scenario: Iteration progress
- **WHEN** each iteration completes
- **THEN** CLI SHALL display: iteration number, invoice count in this iteration, new HWM date, and whether result was truncated

#### Scenario: Completion summary
- **WHEN** all iterations complete
- **THEN** CLI SHALL display: total iterations, total parts downloaded, final HWM state, and output directory path

#### Scenario: JSON output
- **WHEN** user runs `ksef invoice export-incremental --from 2026-01-01 --json`
- **THEN** CLI SHALL output the `IncrementalExportResult` as JSON (no progress spinners)

### Requirement: Global flags support
The command SHALL respect global flags: `--env`, `--json`, `--nip`, `--timeout`.

#### Scenario: Environment override
- **WHEN** user runs `ksef invoice export-incremental --from 2026-01-01 --env demo`
- **THEN** CLI SHALL use the demo environment
