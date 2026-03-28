## MODIFIED Requirements

### Requirement: Send single invoice
The CLI SHALL provide `ksef invoice send <file.xml>` to send a single invoice. The CLI MUST read the XML file, compute its hash and size, encrypt the content via `client.crypto`, and call `OnlineSessionService.sendInvoice()`. Crypto MUST be initialized automatically (`client.crypto.init()`). It MUST accept an optional `--form-code <key>` flag where `<key>` is one of `FA2`, `FA3`, `PEF3`, `PEFKOR3`, `FARR1`.

#### Scenario: Send single invoice file
- **WHEN** user runs `ksef invoice send invoice.xml` with an active online session
- **THEN** CLI reads the file, encrypts it, sends it via the online session, and displays the invoice reference number

#### Scenario: Send invoice without active session
- **WHEN** user runs `ksef invoice send invoice.xml` without a stored online session ref
- **THEN** CLI SHALL display an error suggesting `ksef session open`

#### Scenario: Send non-existent file
- **WHEN** user runs `ksef invoice send missing.xml` and the file does not exist
- **THEN** CLI SHALL display a file-not-found error

#### Scenario: Send with session ref override
- **WHEN** user runs `ksef invoice send invoice.xml --session-ref <ref>`
- **THEN** CLI uses the provided session ref instead of the stored one

#### Scenario: Send with form code override
- **WHEN** user runs `ksef invoice send invoice.xml --form-code PEF3`
- **THEN** CLI SHALL resolve `PEF3` to `FORM_CODES.PEF_3` and use it when the session requires a form code context

#### Scenario: Send with invalid form code key
- **WHEN** user runs `ksef invoice send invoice.xml --form-code INVALID`
- **THEN** CLI SHALL display an error listing valid keys: FA2, FA3, PEF3, PEFKOR3, FARR1

### Requirement: Send batch invoices from directory
The CLI SHALL support `ksef invoice send <dir/>` when the path is a directory. It MUST open a batch session, read all `*.xml` files, send them as batch parts, and close the batch session. It MUST accept an optional `--form-code <key>` flag. If `--form-code` specifies a PEF variant (`PEF3` or `PEFKOR3`), the CLI MUST reject with an error because batch sessions do not support PEF document types.

#### Scenario: Send directory of invoices
- **WHEN** user runs `ksef invoice send ./invoices/` and the directory contains XML files
- **THEN** CLI opens a batch session, sends all XML files as parts, closes the session, and displays the batch reference and count of sent invoices

#### Scenario: Send empty directory
- **WHEN** user runs `ksef invoice send ./empty/` and the directory contains no XML files
- **THEN** CLI SHALL display an error indicating no XML files found

#### Scenario: Send directory path detection
- **WHEN** user provides a path that is a directory (detected via `fs.statSync`)
- **THEN** CLI MUST automatically use batch mode without requiring a `--batch` flag

#### Scenario: Send batch with form code
- **WHEN** user runs `ksef invoice send ./invoices/ --form-code FA3`
- **THEN** CLI SHALL resolve `FA3` to `FORM_CODES.FA_3` and use it as the batch session form code

#### Scenario: Reject PEF for batch
- **WHEN** user runs `ksef invoice send ./invoices/ --form-code PEF3`
- **THEN** CLI SHALL display an error explaining that PEF document types are not supported in batch sessions
