## MODIFIED Requirements

### Requirement: Send single invoice
The CLI SHALL provide `ksef invoice send <file.xml>` to send a single invoice. The CLI MUST read the XML file, compute its hash and size, encrypt the content via `client.crypto`, and call `OnlineSessionService.sendInvoice()`. Crypto MUST be initialized automatically (`client.crypto.init()`). It MUST accept an optional `--form-code <key>` flag where `<key>` is one of `FA2`, `FA3`, `PEF3`, `PEFKOR3`, `FARR1`. It MUST accept an optional `--validate` flag that runs schema validation before sending.

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

#### Scenario: Send with validation enabled
- **WHEN** user runs `ksef invoice send invoice.xml --validate` and the XML has schema violations
- **THEN** CLI displays validation errors and does NOT send the invoice

#### Scenario: Send with validation passing
- **WHEN** user runs `ksef invoice send invoice.xml --validate` and the XML is valid
- **THEN** CLI proceeds with encryption and sending normally
