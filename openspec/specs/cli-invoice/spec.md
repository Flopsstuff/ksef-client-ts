## Purpose

The `cli-invoice` capability defines the `ksef invoice` command group, which submits invoices to KSeF from the command line. It covers sending a single invoice XML file — reading the file, computing its hash and size, encrypting the content via the client crypto layer, and dispatching it through an active online session. It also handles form-code selection and optional pre-send schema validation.
## Requirements
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

### Requirement: Render an invoice or UPO to PDF

The CLI SHALL provide `ksef invoice pdf <file>` to render a KSeF invoice or UPO XML file to a PDF. The command MUST lazily bridge into the internal PDF module and, when `pdfmake` is not installed or is an incompatible version, MUST surface the module's friendly installation error (`npm i "pdfmake@^0.2.20"`) rather than a raw crash. By default the output PDF MUST be written next to the source file with a `.pdf` extension.

The command MUST accept:
- `--template <name>` — select a built-in template by name; mutually exclusive with `--template-file`.
- `--template-file <path>` — load a custom `.json` template from a path; mutually exclusive with `--template`.
- `--locale <pl|en|pl+en>` — label language, defaulting to `pl`.
- `--out <file.pdf>` — output path override.
- `--qr` — embed the KSeF Code I QR derived from the invoice XML.
- `--ksef-number <NR>` — the KSeF number to print; when absent the visualization is marked OFFLINE.
- `--upo` — treat the input as a UPO document (otherwise the version is auto-detected).
- `--env <e>` — environment used to derive the QR base URL.

When neither `--template` nor `--template-file` is given, the command MUST select the default built-in template matching the detected XML version.

#### Scenario: Render an invoice with the default built-in template

- **WHEN** user runs `ksef invoice pdf invoice.xml` with no template flag
- **THEN** CLI detects the invoice version, renders it with the matching built-in template, and writes `invoice.pdf` next to the source file

#### Scenario: Render with a built-in template by name

- **WHEN** user runs `ksef invoice pdf invoice.xml --template fa3-default`
- **THEN** CLI renders the invoice using the named built-in template

#### Scenario: Render with a custom template file

- **WHEN** user runs `ksef invoice pdf invoice.xml --template-file ./my-template.json`
- **THEN** CLI loads the custom template from the path and renders the invoice

#### Scenario: Mutually exclusive template flags

- **WHEN** user runs `ksef invoice pdf invoice.xml --template fa3-default --template-file ./my-template.json`
- **THEN** CLI SHALL display an error stating that `--template` and `--template-file` cannot be combined

#### Scenario: Output path override

- **WHEN** user runs `ksef invoice pdf invoice.xml --out /tmp/result.pdf`
- **THEN** CLI writes the PDF to `/tmp/result.pdf` instead of next to the source file

#### Scenario: Embed QR code

- **WHEN** user runs `ksef invoice pdf invoice.xml --qr`
- **THEN** CLI renders the PDF with the KSeF Code I QR derived from the invoice XML

#### Scenario: Render a UPO document

- **WHEN** user runs `ksef invoice pdf upo.xml --upo`
- **THEN** CLI renders the UPO receipt using the matching built-in UPO template

#### Scenario: pdfmake not installed

- **WHEN** user runs `ksef invoice pdf invoice.xml` without `pdfmake` installed
- **THEN** CLI SHALL display the friendly installation hint `npm i "pdfmake@^0.2.20"` rather than a raw module-not-found error

#### Scenario: Localized labels

- **WHEN** user runs `ksef invoice pdf invoice.xml --locale pl+en`
- **THEN** CLI renders the PDF with bilingual Polish/English labels

