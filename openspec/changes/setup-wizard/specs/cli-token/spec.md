## MODIFIED Requirements

### Requirement: Generate KSeF token via CLI
The `ksef token generate` command SHALL create a new KSeF API token. The `--permissions` flag SHALL accept a comma-separated list of permission types (e.g. `InvoiceRead,InvoiceWrite`). The `--description` flag SHALL set an optional description. The `--valid-to` flag SHALL set an optional expiration date (ISO 8601).

#### Scenario: Generate token with permissions
- **WHEN** user runs `ksef token generate --permissions InvoiceRead,InvoiceWrite --description "CI/CD token"`
- **THEN** the CLI SHALL call `TokenService.generateToken` and display the reference number and generated token value

#### Scenario: Generate with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full `KsefTokenResponse` as JSON

#### Scenario: No permissions specified
- **WHEN** user runs `ksef token generate` without `--permissions`
- **THEN** the CLI SHALL display an error that --permissions is required

#### Scenario: No active session
- **WHEN** user runs without a stored session
- **THEN** the CLI SHALL display an error suggesting `ksef auth login`

### Requirement: Auth login credentials fallback

The `ksef auth login` command SHALL fall back to the credentials store when `--token` is not provided. If a stored token exists in the credentials store, it SHALL be used automatically for token-based authentication.

#### Scenario: Login with stored credentials
- **WHEN** user runs `ksef auth login --nip 1234567890` without `--token`, and a token exists in the credentials store
- **THEN** the CLI SHALL use the stored token for authentication

#### Scenario: Explicit token takes precedence
- **WHEN** user runs `ksef auth login --token explicit-token --nip 1234567890`, and a different token exists in the credentials store
- **THEN** the CLI SHALL use `explicit-token`, not the stored one

#### Scenario: No token available
- **WHEN** user runs `ksef auth login --nip 1234567890` without `--token`, and no token exists in the credentials store
- **THEN** the CLI SHALL display the existing error requiring `--token`, `--p12`, or `--cert`/`--key`
