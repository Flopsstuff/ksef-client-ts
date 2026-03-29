## ADDED Requirements

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

### Requirement: List tokens via CLI
The `ksef token list` command SHALL query tokens with optional filters: `--status` (comma-separated statuses), `--description`, `--author`, `--author-type`. Results SHALL be displayed as a table.

#### Scenario: List all tokens
- **WHEN** user runs `ksef token list`
- **THEN** the CLI SHALL call `TokenService.queryTokens` and display results as a table with columns: Reference, Description, Status, Permissions, Created

#### Scenario: List with status filter
- **WHEN** user runs `ksef token list --status Active,Pending`
- **THEN** the CLI SHALL pass the status array to the query and display filtered results

#### Scenario: List with pagination
- **WHEN** user adds `--page <n>` and `--page-size <n>`
- **THEN** the CLI SHALL pass `pageOffset` and `pageSize` to the query

#### Scenario: Empty results
- **WHEN** the query returns no tokens
- **THEN** the CLI SHALL display a "No tokens found." warning

#### Scenario: List with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full `QueryKsefTokensResponse` as JSON

### Requirement: Get token details via CLI
The `ksef token get` command SHALL retrieve token details by reference number.

#### Scenario: Get token details
- **WHEN** user runs `ksef token get <ref>`
- **THEN** the CLI SHALL call `TokenService.getToken` and display key-value pairs: Reference, Description, Status, Permissions, Author, Created, Last Used

#### Scenario: Get with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full `AuthenticationKsefToken` as JSON

### Requirement: Revoke token via CLI
The `ksef token revoke` command SHALL revoke a token by its reference number.

#### Scenario: Revoke token
- **WHEN** user runs `ksef token revoke <ref>`
- **THEN** the CLI SHALL call `TokenService.revokeToken` and display a success message

#### Scenario: Revoke with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output `{ "status": "revoked", "referenceNumber": "<ref>" }` as JSON

### Requirement: Token command group registration
The `tokenCommand` SHALL be exported from `src/cli/commands/token.ts` and registered in `src/cli/index.ts` under the `token` subcommand key.

#### Scenario: Help output
- **WHEN** user runs `ksef token --help`
- **THEN** the CLI SHALL list subcommands: generate, list, get, revoke

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
