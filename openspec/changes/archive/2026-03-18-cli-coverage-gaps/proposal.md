## Why

CLI covers ~91% of the API client (112/123 methods). 11 service methods have no CLI commands — including two entire services (`ActiveSessionsService`, `LimitsService`) that are completely inaccessible from CLI. This creates a gap where users must fall back to the programmatic API for basic operations like viewing rate limits or managing active sessions.

## What Changes

**New CLI command groups (3):**
- `ksef session active` / `ksef session revoke` — list and revoke active sessions (3 methods from `ActiveSessionsService`)
- `ksef limits context|subject|rate` — read current context, subject, and rate limits (3 methods from `LimitsService`)
- `ksef peppol providers` — query Peppol providers (1 method from `PeppolService`)

**Additions to existing CLI commands (5):**
- `ksef cert enrollment-data` — get enrollment data required before certificate enrollment (`CertificateApiService.getEnrollmentData()`)
- `ksef cert retrieve` — retrieve certificates by criteria (`CertificateApiService.retrieve()`)
- `ksef session invoice <invoiceRef>` — get single invoice status within a session (`SessionStatusService.getSessionInvoice()`)
- `ksef permission attachment-status` — check whether attachment permissions are allowed (`PermissionsService.getAttachmentStatus()`)

## Capabilities

### New Capabilities
- `cli-active-sessions`: CLI commands for listing and revoking active KSeF sessions
- `cli-limits`: CLI commands for reading context, subject, and API rate limits
- `cli-peppol`: CLI command for querying Peppol providers

### Modified Capabilities
- `cli-session`: add `invoice` subcommand for single invoice status lookup
- `cli-cert`: add `enrollment-data` and `retrieve` subcommands
- `cli-permission`: add `attachment-status` subcommand

## Impact

- **New files**: `src/cli/commands/limits.ts`, `src/cli/commands/peppol.ts`
- **Modified files**: `src/cli/commands/session.ts` (active sessions + invoice subcommands), `src/cli/commands/cert.ts`, `src/cli/commands/permission.ts`, `src/cli/index.ts` (register new command groups)
- **No service/model changes** — all 11 methods already exist in the service layer
- **No breaking changes** — purely additive CLI commands
