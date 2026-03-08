## Why

CLI Phases 1 (Config & Auth) and 2 (Sessions & Invoices) are complete. Users can authenticate and work with invoices from the terminal, but cannot manage permissions or API tokens without writing code against the library directly. Phase 3 adds these missing management commands so administrators can grant/revoke access and manage KSeF tokens entirely from the CLI.

## What Changes

- New `ksef permission` command group with subcommands:
  - `grant` — grant permissions to persons, entities, subunits, authorizations, indirect, and EU entities
  - `revoke` — revoke a permission grant by ID (common or authorization)
  - `search` — query grants by type (personal, persons, subunits, entities, subordinate-entities, authorizations, eu-entities)
  - `status` — check permission operation status by reference
- New `ksef token` command group with subcommands:
  - `generate` — generate a new KSeF API token
  - `list` — query/list tokens with filtering (status, description, author)
  - `get` — get token details by reference
  - `revoke` — revoke a token by reference
- Register both command groups in `src/cli/index.ts`

## Capabilities

### New Capabilities

- `cli-permission`: CLI command group wrapping `PermissionsService` — grant (7 types), revoke (common + authorization), search (8 query types), and operation status
- `cli-token`: CLI command group wrapping `TokenService` — generate, list/query, get, and revoke tokens

### Modified Capabilities

(none — library services and existing CLI infrastructure are unchanged)

## Impact

- **New files**: `src/cli/commands/permission.ts`, `src/cli/commands/token.ts`
- **Modified files**: `src/cli/index.ts` (register new subcommands)
- **Dependencies**: no new dependencies — uses existing `citty`, `consola`, CLI infrastructure, and library services (`PermissionsService`, `TokenService`)
- **Requires active session**: all commands need a stored access token (same as session/invoice commands)
