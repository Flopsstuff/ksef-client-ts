## ADDED Requirements

### Requirement: Generate self-signed certificate locally
The `ksef cert generate` command SHALL generate a self-signed certificate and private key using `CertificateService.generateSelfSignedCertificate`. The `--type` flag SHALL select `personal` or `company-seal`. Subject fields SHALL be provided via `--cn`, `--org`, `--country`, `--serial-number`, `--given-name`, `--surname`. The `--out` flag SHALL specify the output directory (defaults to current directory). The `--days` flag SHALL set validity period (defaults to 365).

#### Scenario: Generate personal certificate
- **WHEN** user runs `ksef cert generate --type personal --cn "Jan Kowalski" --country PL --out ./certs`
- **THEN** the CLI SHALL write `cert.pem` and `key.pem` to `./certs/` and display the SHA-256 fingerprint

#### Scenario: Generate company-seal certificate
- **WHEN** user runs `ksef cert generate --type company-seal --cn "Firma Sp. z o.o." --org "Firma" --country PL --serial-number 1234567890`
- **THEN** the CLI SHALL write `cert.pem` and `key.pem` to the current directory and display the SHA-256 fingerprint

#### Scenario: Output directory does not exist
- **WHEN** user runs with `--out ./nonexistent`
- **THEN** the CLI SHALL create the directory and write the files

#### Scenario: Files already exist without --force
- **WHEN** `cert.pem` or `key.pem` already exist in the output directory and `--force` is not set
- **THEN** the CLI SHALL display an error and refuse to overwrite

#### Scenario: Generate with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output JSON with `certPath`, `keyPath`, and `fingerprint` fields

### Requirement: Enroll certificate via API
The `ksef cert enroll` command SHALL submit a certificate enrollment request to KSeF. The `--cert` flag SHALL specify the certificate PEM file path. The `--name` flag SHALL set the certificate name. The `--type` flag SHALL select `Authentication` or `Offline`. The `--valid-from` flag SHALL optionally set the start date. The command SHALL call `client.crypto.init()` before enrollment.

#### Scenario: Enroll certificate
- **WHEN** user runs `ksef cert enroll --cert ./cert.pem --name "My Cert" --type Authentication`
- **THEN** the CLI SHALL read the PEM file, call `CertificateApiService.enroll`, and display the reference number and timestamp

#### Scenario: Enroll with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full `EnrollCertificateResponse` as JSON

#### Scenario: No active session
- **WHEN** user runs without a stored session
- **THEN** the CLI SHALL display an error suggesting `ksef auth login`

### Requirement: Check enrollment status
The `ksef cert status` command SHALL check the enrollment status by reference number.

#### Scenario: Check status
- **WHEN** user runs `ksef cert status <ref>`
- **THEN** the CLI SHALL call `CertificateApiService.getEnrollmentStatus` and display key-value pairs: Reference, Status Code, Description, Certificate Serial (if available)

#### Scenario: Status with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full `CertificateEnrollmentStatusResponse` as JSON

### Requirement: List certificates
The `ksef cert list` command SHALL query certificates with optional filters: `--serial`, `--name`, `--type` (Authentication/Offline), `--status` (Active/Blocked/Revoked/Expired), `--expires-after`. Results SHALL be displayed as a table.

#### Scenario: List all certificates
- **WHEN** user runs `ksef cert list`
- **THEN** the CLI SHALL call `CertificateApiService.query` and display results as a table with columns: Serial, Name, Type, Status, Valid From, Valid To

#### Scenario: List with filters
- **WHEN** user runs `ksef cert list --type Authentication --status Active`
- **THEN** the CLI SHALL pass filters to the query and display filtered results

#### Scenario: List with pagination
- **WHEN** user adds `--page <n>` and `--page-size <n>`
- **THEN** the CLI SHALL pass `pageOffset` and `pageSize` to the query

#### Scenario: Empty results
- **WHEN** the query returns no certificates
- **THEN** the CLI SHALL display a "No certificates found." warning

#### Scenario: List with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full `QueryCertificatesResponse` as JSON

### Requirement: Revoke certificate
The `ksef cert revoke` command SHALL revoke a certificate by serial number.

#### Scenario: Revoke certificate
- **WHEN** user runs `ksef cert revoke <serial> --reason "Key compromised"`
- **THEN** the CLI SHALL call `CertificateApiService.revoke` and display a success message

#### Scenario: Revoke without reason
- **WHEN** user runs `ksef cert revoke <serial>` without `--reason`
- **THEN** the CLI SHALL call revoke with no reason and display a success message

#### Scenario: Revoke with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output `{ "status": "revoked", "serialNumber": "<serial>" }` as JSON

### Requirement: View certificate limits
The `ksef cert limits` command SHALL display current certificate enrollment and certificate limits.

#### Scenario: View limits
- **WHEN** user runs `ksef cert limits`
- **THEN** the CLI SHALL call `CertificateApiService.getLimits` and display key-value pairs: Can Request, Enrollment Limit, Enrollment Remaining, Certificate Limit, Certificate Remaining

#### Scenario: Limits with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full `CertificateLimitsResponse` as JSON

### Requirement: Cert command group registration
The `certCommand` SHALL be exported from `src/cli/commands/cert.ts` and registered in `src/cli/index.ts` under the `cert` subcommand key.

#### Scenario: Help output
- **WHEN** user runs `ksef cert --help`
- **THEN** the CLI SHALL list subcommands: generate, enroll, status, list, revoke, limits
