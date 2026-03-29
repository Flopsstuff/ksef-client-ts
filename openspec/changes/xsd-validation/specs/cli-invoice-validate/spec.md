## ADDED Requirements

### Requirement: Validate invoice XML from file
The CLI SHALL provide `ksef invoice validate <file.xml>` to validate a single invoice XML file. It MUST read the file, run all three validation levels (well-formedness, schema, business rules), and display results.

#### Scenario: Valid invoice
- **WHEN** user runs `ksef invoice validate valid-fa3.xml` and the file is valid
- **THEN** CLI SHALL display: detected schema type, "Valid" status, and number of checks passed

#### Scenario: Invalid invoice with errors
- **WHEN** user runs `ksef invoice validate invalid.xml` and the file has errors
- **THEN** CLI SHALL display each error with: severity (error/warning), error code, XPath-like path, message, and expected/actual values where applicable. CLI SHALL exit with non-zero exit code.

#### Scenario: File not found
- **WHEN** user runs `ksef invoice validate missing.xml` and the file does not exist
- **THEN** CLI SHALL display a file-not-found error

#### Scenario: Non-XML file
- **WHEN** user runs `ksef invoice validate photo.png` and the file is not valid XML
- **THEN** CLI SHALL display the XML parse error

### Requirement: Schema override flag
The CLI SHALL accept an optional `--schema <type>` flag to force a specific schema instead of auto-detection. Valid values SHALL be: `FA2`, `FA3`, `PEF3`, `PEFKOR3`, `RR1`, `RR1_V10E`, `RR1_V11E`.

#### Scenario: Explicit schema
- **WHEN** user runs `ksef invoice validate invoice.xml --schema FA3`
- **THEN** CLI SHALL validate against FA(3) schema regardless of the XML namespace

#### Scenario: Invalid schema key
- **WHEN** user runs `ksef invoice validate invoice.xml --schema INVALID`
- **THEN** CLI SHALL display an error listing valid schema keys

#### Scenario: RR1 alias
- **WHEN** user runs `ksef invoice validate invoice.xml --schema RR1`
- **THEN** CLI SHALL use the latest RR(1) schema (v1-1E)

### Requirement: Validation level flags
The CLI SHALL accept `--schema-only` and `--business-only` flags to control which validation levels run.

#### Scenario: Schema-only validation
- **WHEN** user runs `ksef invoice validate invoice.xml --schema-only`
- **THEN** CLI SHALL run only XML parsing and schema validation, skipping business rules

#### Scenario: Business rules only
- **WHEN** user runs `ksef invoice validate invoice.xml --business-only`
- **THEN** CLI SHALL run only business rule checks

#### Scenario: Default runs all levels
- **WHEN** user runs `ksef invoice validate invoice.xml` without level flags
- **THEN** CLI SHALL run all three levels

### Requirement: Validate multiple files
The CLI SHALL accept multiple file paths or a directory path. When a directory is given, it SHALL validate all `*.xml` files in it.

#### Scenario: Multiple files
- **WHEN** user runs `ksef invoice validate a.xml b.xml c.xml`
- **THEN** CLI SHALL validate each file and show per-file results with a summary at the end

#### Scenario: Directory
- **WHEN** user runs `ksef invoice validate ./invoices/`
- **THEN** CLI SHALL find all `*.xml` files in the directory and validate each

#### Scenario: Directory with no XML files
- **WHEN** user runs `ksef invoice validate ./empty/` and the directory has no `.xml` files
- **THEN** CLI SHALL display an error indicating no XML files found

#### Scenario: Mixed valid and invalid
- **WHEN** multiple files are validated and some pass, some fail
- **THEN** CLI SHALL display per-file status and a summary: "3/5 files valid, 2/5 files have errors". Exit code SHALL be non-zero if any file has errors.

### Requirement: JSON output
The CLI SHALL support `--json` flag for machine-readable output.

#### Scenario: JSON output single file
- **WHEN** user runs `ksef invoice validate invoice.xml --json`
- **THEN** CLI SHALL output the full `InvoiceValidationResult` as JSON

#### Scenario: JSON output multiple files
- **WHEN** user runs `ksef invoice validate a.xml b.xml --json`
- **THEN** CLI SHALL output a JSON array of results, one per file, each including the filename

### Requirement: Global flags support
The `ksef invoice validate` command SHALL respect the `--json` global flag. It SHALL NOT require authentication or an active session (validation is local-only).

#### Scenario: No auth required
- **WHEN** user runs `ksef invoice validate invoice.xml` without any prior `ksef auth login`
- **THEN** CLI SHALL validate successfully (no API calls needed)

#### Scenario: Help includes validate
- **WHEN** user runs `ksef invoice --help`
- **THEN** the help output SHALL list `validate` among available subcommands
