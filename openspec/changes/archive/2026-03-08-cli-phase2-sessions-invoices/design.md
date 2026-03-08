## Context

Phase 1 CLI (config + auth) is implemented and establishes the patterns: `citty` defineCommand, `withErrorHandler` wrapper, `getGlobalOpts` helper, `createClient`/`requireSession` factories, `outputResult`/`outputTable`/`outputKeyValue` formatters. All underlying library services for sessions and invoices are complete (`OnlineSessionService`, `BatchSessionService`, `SessionStatusService`, `ActiveSessionsService`, `InvoiceDownloadService`).

Current `SessionData` stores `accessToken`, `refreshToken`, `sessionRef`, `expiresAt`, and `environment`. The `sessionRef` from auth is the authentication reference — session commands will need a separate online/batch session reference.

## Goals / Non-Goals

**Goals:**
- Thin CLI wrappers for session and invoice operations following Phase 1 patterns
- Implicit session reference (stored after `session open`, used by default in subsequent commands)
- File I/O for invoice send (read XML) and invoice get / UPO download (write to disk)
- Tabular output for list/query commands in pretty mode
- Spinners for long-running operations (session open, close, export)

**Non-Goals:**
- Invoice XML construction or validation (user provides valid XML)
- Encryption of invoice content in the CLI layer (handled by library crypto service)
- Batch session part splitting logic (user provides directory of XML files)
- Automatic pagination / fetching all pages (user uses `--page` / `--size`)
- Interactive prompts or wizards

## Decisions

### 1. Session reference storage: extend SessionData vs separate field

**Decision**: Add `onlineSessionRef` field to `SessionData` in types.ts.

After `ksef session open`, store the returned `referenceNumber` in `session.onlineSessionRef`. Commands like `session close`, `session status`, `session invoices`, `session failed`, `session upo` use this as default when no positional `[ref]` is provided.

**Why not a separate file**: Keeps one source of truth. Session ref is tightly coupled to the auth session — if auth session expires, the online session ref is also invalid.

**Alternative considered**: Separate `~/.ksef/online-session.json` — rejected, adds complexity for no real benefit.

### 2. Invoice send: encryption responsibility

**Decision**: CLI handles the full send pipeline: read XML file → compute hash/size → encrypt via `client.crypto` → call `onlineSession.sendInvoice()`.

This matches the auth login pattern where CLI orchestrates multi-step flows. The user provides raw XML, the CLI does the rest.

**Prerequisite**: `client.crypto.init()` must be called before send (to fetch KSeF public certs). CLI will call it automatically in the send command.

### 3. Batch send: directory mode

**Decision**: When `ksef invoice send <dir/>` is given a directory path, CLI opens a batch session, reads all `*.xml` files, sends them as parts, and closes the session.

This is a convenience wrapper. The batch flow: `batchSession.openSession()` → `batchSession.sendParts()` → `batchSession.closeSession()`.

**Alternative considered**: Require explicit `--batch` flag even for directories — rejected, path type (file vs dir) is unambiguous.

### 4. Invoice query filter mapping

**Decision**: Map CLI flags directly to `InvoiceQueryFilters` fields:

| CLI flag | Filter field |
|---|---|
| `--subject-type` | `subjectType` (default: `Subject1`) |
| `--from`, `--to` | `dateRange.from`, `dateRange.to` |
| `--date-type` | `dateRange.dateType` (default: `Invoicing`) |
| `--seller-nip` | `sellerNip` |
| `--buyer-nip` | `buyerIdentifier.type=Nip, value=<nip>` |
| `--amount-from`, `--amount-to` | `amount.from`, `amount.to` |
| `--amount-type` | `amount.type` (default: `Brutto`) |
| `--currency` | `currencyCodes` (single value → array) |
| `--page`, `--size` | `pageOffset`, `pageSize` query params |

`--from` is required (KSeF API requirement). Other filters are optional.

### 5. UPO download modes

**Decision**: Support three UPO retrieval methods via flags:

- `ksef session upo <ref>` — by session UPO reference
- `ksef session upo <ref> --ksef-number <num>` — by KSeF invoice number
- `ksef session upo <ref> --invoice-ref <iref>` — by invoice reference

All write XML to stdout by default, or to a file with `-o <path>`.

### 6. Command file structure

**Decision**: One file per command group, matching Phase 1 pattern:
- `src/cli/commands/session.ts` — all session subcommands
- `src/cli/commands/invoice.ts` — all invoice subcommands

Each file exports a single `defineCommand` with `subCommands`. The `getGlobalOpts` helper is duplicated per file (same as auth.ts pattern) rather than extracted — keeps each file self-contained.

### 7. Spinner usage

**Decision**: Use `consola.start()` / `consola.success()` for operations that hit the API. No custom polling loops — just show a message before and after the API call. If `--json` is set, suppress spinner output (only emit JSON).

## Risks / Trade-offs

**[Risk] Invoice encryption requires crypto init** → Mitigation: `invoice send` calls `client.crypto.init()` at the start. Clear error message if it fails (cert fetch issue).

**[Risk] Large batch directories** → Mitigation: No streaming or chunking in v1. If user has thousands of XMLs, they may hit memory limits. Document this limitation. Can be improved later.

**[Risk] Session ref stale after server-side expiry** → Mitigation: If a session command fails with a session-related API error, suggest running `ksef session status` or opening a new session.

**[Trade-off] No auto-pagination** → Simpler implementation, but users must manually paginate. Acceptable for CLI v1 — scripting users can loop with `--page`.

**[Trade-off] getGlobalOpts duplication** → Each command file has its own copy. Could extract to shared module, but adds import coupling for a 6-line function. Will extract if a third+ command file emerges (Phase 3).
