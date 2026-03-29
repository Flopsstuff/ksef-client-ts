## ADDED Requirements

### Requirement: Validate invoice XML file
The CLI SHALL provide `ksef invoice validate <file.xml>` to validate an invoice XML file against KSeF XSD schemas. It MUST run all three validation levels (well-formedness, schema, business rules) and display results.

#### Scenario: Valid invoice file
- **WHEN** user runs `ksef invoice validate invoice.xml` with a valid FA(3) invoice
- **THEN** CLI displays: detected schema type, "Valid" status, and exits with code 0

#### Scenario: Invalid invoice file
- **WHEN** user runs `ksef invoice validate invoice.xml` with schema violations
- **THEN** CLI displays: detected schema type, error count, each error with its path and message, and exits with non-zero code

#### Scenario: Malformed XML
- **WHEN** user runs `ksef invoice validate broken.xml` with malformed XML
- **THEN** CLI displays XML parsing errors and exits with non-zero code

#### Scenario: File not found
- **WHEN** user runs `ksef invoice validate missing.xml` and the file does not exist
- **THEN** CLI displays a file-not-found error

#### Scenario: JSON output
- **WHEN** user runs `ksef invoice validate invoice.xml --json`
- **THEN** CLI outputs the full `InvoiceValidationResult` as JSON

#### Scenario: Explicit schema override
- **WHEN** user runs `ksef invoice validate invoice.xml --schema FA2`
- **THEN** CLI uses the FA(2) schema instead of auto-detecting

### Requirement: Validate multiple files
The CLI SHALL accept multiple file paths or a glob pattern.

#### Scenario: Multiple files
- **WHEN** user runs `ksef invoice validate a.xml b.xml c.xml`
- **THEN** CLI validates each file independently and displays results per file, exit code is non-zero if any file is invalid

#### Scenario: Directory of XML files
- **WHEN** user runs `ksef invoice validate ./invoices/`
- **THEN** CLI validates all `*.xml` files in the directory

### Requirement: Validation summary
The CLI MUST display a summary after validating one or more files.

#### Scenario: Single file summary
- **WHEN** one file is validated successfully
- **THEN** CLI displays the schema type and "Valid" or error count

#### Scenario: Multi-file summary
- **WHEN** multiple files are validated
- **THEN** CLI displays total files, valid count, invalid count
