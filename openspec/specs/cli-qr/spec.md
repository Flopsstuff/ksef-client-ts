## ADDED Requirements

### Requirement: Generate invoice QR code
The `ksef qr invoice` command SHALL generate a QR code for invoice verification. Required flags: `--nip`, `--date` (issue date, ISO format), `--hash` (invoice hash, base64). The `--format` flag SHALL select `png` (default) or `svg`. The `-o` flag SHALL specify the output file path. The `--size` flag SHALL set QR code width in pixels (default 300). The `--label` flag SHALL add a text label (SVG only). The `--offline` flag SHALL set the label to `"OFFLINE"` when generating SVG with label.

#### Scenario: Generate PNG QR to file
- **WHEN** user runs `ksef qr invoice --nip 1234567890 --date 2026-01-15 --hash "abc123==" -o invoice-qr.png`
- **THEN** the CLI SHALL build the verification URL via `VerificationLinkService.buildInvoiceVerificationUrl`, generate PNG via `QrCodeService.generateQrCode`, write to `invoice-qr.png`, and display the verification URL

#### Scenario: Generate SVG QR with label
- **WHEN** user runs with `--format svg --label "Faktura 2026/001" -o invoice-qr.svg`
- **THEN** the CLI SHALL generate SVG with label via `QrCodeService.generateQrCodeSvgWithLabel` and write to the file

#### Scenario: Generate SVG with offline label
- **WHEN** user runs with `--format svg --offline -o invoice-qr.svg`
- **THEN** the CLI SHALL generate SVG with label `"OFFLINE"` via `QrCodeService.generateQrCodeSvgWithLabel`

#### Scenario: Offline flag overrides label
- **WHEN** user runs with `--format svg --offline --label "Custom"` 
- **THEN** the CLI SHALL use `"OFFLINE"` as the label, ignoring `--label`

#### Scenario: No output file specified
- **WHEN** user runs without `-o`
- **THEN** the CLI SHALL output base64-encoded PNG to stdout

#### Scenario: Generate with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output JSON with `url` and `qrCode` (base64) fields

### Requirement: Generate certificate QR code
The `ksef qr certificate` command SHALL generate a QR code for certificate-based invoice verification. Required flags: `--context-type`, `--context-id`, `--seller-nip`, `--cert-serial`, `--hash` (base64), `--key` (private key PEM file path). Output options are the same as invoice QR (`-o`, `--format`, `--size`).

#### Scenario: Generate certificate QR
- **WHEN** user runs `ksef qr certificate --context-type institutional --context-id CTX1 --seller-nip 1234567890 --cert-serial SER1 --hash "abc123==" --key ./key.pem -o cert-qr.png`
- **THEN** the CLI SHALL read the private key, build the signed URL via `VerificationLinkService.buildCertificateVerificationUrl`, generate PNG, write to file, and display the URL

#### Scenario: No output file specified
- **WHEN** user runs without `-o`
- **THEN** the CLI SHALL output base64-encoded PNG to stdout

#### Scenario: Invalid key file
- **WHEN** the `--key` file does not exist or is not a valid PEM
- **THEN** the CLI SHALL display a clear error message

### Requirement: Print verification URL only
The `ksef qr url` command SHALL print the invoice verification URL without generating a QR image. Required flags: `--nip`, `--date`, `--hash`.

#### Scenario: Print URL
- **WHEN** user runs `ksef qr url --nip 1234567890 --date 2026-01-15 --hash "abc123=="`
- **THEN** the CLI SHALL print the verification URL to stdout

#### Scenario: URL with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output `{ "url": "<verification-url>" }` as JSON

### Requirement: QR command group registration
The `qrCommand` SHALL be exported from `src/cli/commands/qr.ts` and registered in `src/cli/index.ts` under the `qr` subcommand key.

#### Scenario: Help output
- **WHEN** user runs `ksef qr --help`
- **THEN** the CLI SHALL list subcommands: invoice, certificate, url
