## MODIFIED Requirements

### Requirement: Send single invoice
MODIFY the existing `ksef invoice send <file.xml>` command to accept an optional `--validate` flag. When present, the CLI MUST validate the invoice XML using `InvoiceValidator.validate()` before sending. If validation fails, the CLI MUST display errors and abort without sending. The `--no-validate` flag SHALL explicitly disable validation. By default (no flag), validation SHALL NOT run (opt-in behavior).

#### Scenario: Send with pre-validation passing
- **WHEN** user runs `ksef invoice send invoice.xml --validate` and the invoice is valid
- **THEN** CLI SHALL display "Validation passed", then proceed to encrypt and send the invoice normally

#### Scenario: Send with pre-validation failing
- **WHEN** user runs `ksef invoice send invoice.xml --validate` and the invoice has schema errors
- **THEN** CLI SHALL display validation errors and abort with "Invoice not sent due to validation errors". Exit code SHALL be non-zero.

#### Scenario: Send without validate flag (default)
- **WHEN** user runs `ksef invoice send invoice.xml` without `--validate`
- **THEN** CLI SHALL send the invoice without running local validation (existing behavior unchanged)

#### Scenario: Send batch with validation
- **WHEN** user runs `ksef invoice send ./invoices/ --validate`
- **THEN** CLI SHALL validate each XML file before building the batch. If any file fails validation, CLI SHALL report all errors and abort without opening a batch session.
