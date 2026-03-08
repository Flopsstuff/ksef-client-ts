## Context

CLI Phases 1-2 are complete (config, auth, session, invoice). All commands follow the same pattern: `defineCommand` from citty, `withErrorHandler` wrapper, `requireSession` for auth, `outputResult`/`outputTable`/`outputKeyValue` for output, global flags (--env, --json, --timeout, --nip).

The library already has fully implemented `PermissionsService` (7 grant types, 2 revoke methods, 8 query methods, operation status) and `TokenService` (generate, query, get, revoke). The CLI just needs to wrap these.

## Goals / Non-Goals

**Goals:**
- Provide CLI access to all `PermissionsService` and `TokenService` operations
- Follow established CLI patterns exactly (same structure as session.ts/invoice.ts)
- Support both human-readable (pretty) and machine-readable (--json) output

**Non-Goals:**
- No builders usage in CLI — the existing fluent builders (`PersonPermissionGrantBuilder` etc.) are for programmatic use; CLI will construct request objects directly from flags
- No interactive prompts — all parameters via flags/positional args
- No permission type validation in CLI — the API will reject invalid combinations

## Decisions

### 1. Permission grant as a single `grant` subcommand with `--type` flag

The `PermissionsService` has 7 separate grant methods (person, entity, authorization, indirect, subunit, eu-entity-admin, eu-entity-representative). Rather than 7 subcommands:

```
ksef permission grant --type person --identifier <pesel> --permissions InvoiceRead,InvoiceWrite
ksef permission grant --type entity --nip <nip> --permissions InvoiceRead
ksef permission grant --type authorization --nip <nip> --permissions InvoiceRead
```

**Rationale**: Reduces command proliferation. The `--type` flag selects which service method to call. Each type has different required flags — errors at runtime if missing.

**Alternative considered**: Nested subcommands (`ksef permission grant person ...`). Rejected — citty doesn't support 3-level nesting cleanly, and it makes --help harder to discover.

### 2. Permission search as a single `search` subcommand with `--type` flag

Same approach as grant. The 8 query methods map to `--type personal|persons|subunits|entities|entities-grants|subordinate-entities|authorizations|eu-entities`.

```
ksef permission search --type personal
ksef permission search --type persons --identifier <pesel>
```

### 3. Permission revoke with `--authorization` flag for authorization grants

Two revoke methods exist: `revokeCommonGrant` and `revokeAuthorizationGrant`. Default is common; use `--authorization` flag to call the authorization variant.

```
ksef permission revoke <grant-id>
ksef permission revoke <grant-id> --authorization
```

### 4. Token permissions as comma-separated `--permissions` flag

```
ksef token generate --permissions InvoiceRead,InvoiceWrite --description "CI/CD token"
```

Permissions are split by comma and passed as array to `KsefTokenRequest.permissions`.

### 5. Table output for list/search commands

Permission search results → table with columns: identifier, type, permissions, dates.
Token list → table with columns: reference, description, status, permissions, created.

## Risks / Trade-offs

- **Many flags on `permission grant`**: Different grant types need different flags (--identifier, --identifier-type, --nip, --target-nip, etc). Users must know which flags apply to which type. → Mitigation: clear --help text per type, runtime validation with helpful error messages.
- **Permission type strings are case-sensitive**: Users must type `InvoiceRead` not `invoiceread`. → Mitigation: document valid values in --help. Could add case-normalization later if needed.
