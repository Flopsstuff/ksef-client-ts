## ADDED Requirements

### Requirement: Grant permissions via CLI
The `ksef permission grant` command SHALL grant permissions by type. The `--type` flag SHALL select the grant variant: `person`, `entity`, `authorization`, `indirect`, `subunit`, `eu-entity-admin`, `eu-entity-representative`. The command SHALL require an active session (stored access token). The `--permissions` flag SHALL accept a comma-separated list of permission types (e.g. `InvoiceRead,InvoiceWrite`).

#### Scenario: Grant person permission
- **WHEN** user runs `ksef permission grant --type person --identifier <pesel> --identifier-type Pesel --permissions InvoiceRead,InvoiceWrite`
- **THEN** the CLI SHALL call `PermissionsService.grantPersonPermissions` with the constructed request and display the operation reference number

#### Scenario: Grant entity permission
- **WHEN** user runs `ksef permission grant --type entity --target-nip <nip> --permissions InvoiceRead`
- **THEN** the CLI SHALL call `PermissionsService.grantEntityPermissions` and display the operation reference number

#### Scenario: Grant authorization permission
- **WHEN** user runs `ksef permission grant --type authorization --target-nip <nip> --permissions InvoiceRead`
- **THEN** the CLI SHALL call `PermissionsService.grantAuthorizationPermissions` and display the operation reference number

#### Scenario: Grant with --json flag
- **WHEN** user adds `--json` to any grant command
- **THEN** the CLI SHALL output the full `OperationResponse` as JSON

#### Scenario: Missing required flags
- **WHEN** user omits a required flag for the selected type (e.g. `--identifier` for person)
- **THEN** the CLI SHALL display an error message listing the missing flag

#### Scenario: No active session
- **WHEN** user runs any permission command without a stored session
- **THEN** the CLI SHALL display an error suggesting `ksef auth login`

### Requirement: Revoke permissions via CLI
The `ksef permission revoke` command SHALL revoke a permission grant by its ID. By default it SHALL call `revokeCommonGrant`. When the `--authorization` flag is provided, it SHALL call `revokeAuthorizationGrant` instead.

#### Scenario: Revoke common grant
- **WHEN** user runs `ksef permission revoke <grant-id>`
- **THEN** the CLI SHALL call `PermissionsService.revokeCommonGrant` and display success

#### Scenario: Revoke authorization grant
- **WHEN** user runs `ksef permission revoke <grant-id> --authorization`
- **THEN** the CLI SHALL call `PermissionsService.revokeAuthorizationGrant` and display success

#### Scenario: Revoke with --json flag
- **WHEN** user adds `--json` to the revoke command
- **THEN** the CLI SHALL output the full `OperationResponse` as JSON

### Requirement: Search permissions via CLI
The `ksef permission search` command SHALL query permissions by type. The `--type` flag SHALL select the query variant: `personal`, `persons`, `subunits`, `entities`, `entities-grants`, `subordinate-entities`, `authorizations`, `eu-entities`. Results SHALL be displayed as a table in pretty mode.

#### Scenario: Search personal grants
- **WHEN** user runs `ksef permission search --type personal`
- **THEN** the CLI SHALL call `PermissionsService.queryPersonalGrants` and display results as a table

#### Scenario: Search persons grants with identifier filter
- **WHEN** user runs `ksef permission search --type persons --identifier <pesel> --identifier-type Pesel`
- **THEN** the CLI SHALL call `PermissionsService.queryPersonsGrants` with the filter and display results

#### Scenario: Search with pagination
- **WHEN** user adds `--page <n>` and `--page-size <n>` flags
- **THEN** the CLI SHALL pass `pageOffset` and `pageSize` to the query method

#### Scenario: Empty results
- **WHEN** the query returns no results
- **THEN** the CLI SHALL display a "No permissions found." warning

#### Scenario: Search with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full paged response as JSON

### Requirement: Check permission operation status via CLI
The `ksef permission status` command SHALL check the status of a permission operation by its reference number.

#### Scenario: Check operation status
- **WHEN** user runs `ksef permission status <ref>`
- **THEN** the CLI SHALL call `PermissionsService.getOperationStatus` and display status code, description, and timestamps as key-value pairs

#### Scenario: Status with --json flag
- **WHEN** user adds `--json`
- **THEN** the CLI SHALL output the full `PermissionsOperationStatusResponse` as JSON

### Requirement: Permission command group registration
The `permissionCommand` SHALL be exported from `src/cli/commands/permission.ts` and registered in `src/cli/index.ts` under the `permission` subcommand key.

#### Scenario: Help output
- **WHEN** user runs `ksef permission --help`
- **THEN** the CLI SHALL list subcommands: grant, revoke, search, status, attachment-status

### Requirement: Check attachment permission status
The CLI SHALL provide `ksef permission attachment-status` to check whether attachment permissions are allowed for the current context. It MUST call `PermissionsService.getAttachmentStatus()` and display the result.

#### Scenario: Attachments allowed
- **WHEN** user runs `ksef permission attachment-status` and the response `allowed` is `true`
- **THEN** CLI SHALL display "Attachments: Allowed"

#### Scenario: Attachments not allowed
- **WHEN** user runs `ksef permission attachment-status` and the response `allowed` is `false`
- **THEN** CLI SHALL display "Attachments: Not Allowed"

#### Scenario: JSON output
- **WHEN** user runs `ksef permission attachment-status --json`
- **THEN** CLI SHALL output the full `PermissionsAttachmentAllowedResponse` as JSON

#### Scenario: No auth session
- **WHEN** user runs `ksef permission attachment-status` without a stored auth session
- **THEN** CLI SHALL display an error suggesting `ksef auth login`
