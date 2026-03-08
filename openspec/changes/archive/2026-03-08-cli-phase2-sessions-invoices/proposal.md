## Why

Phase 1 of the CLI (config + auth) is complete. Users can authenticate with KSeF but cannot yet perform core operations: managing sessions and working with invoices. Sessions and invoices are the primary use cases for KSeF interaction -- without them the CLI has no practical value beyond authentication. The underlying library services (`OnlineSessionService`, `BatchSessionService`, `SessionStatusService`, `InvoiceDownloadService`) are fully implemented and tested, so the CLI just needs thin command wrappers.

## What Changes

- Add `ksef session` command group with subcommands: `open`, `close`, `status`, `list`, `invoices`, `failed`, `upo`
- Add `ksef invoice` command group with subcommands: `send`, `get`, `query`, `export`, `export-status`
- Session open supports both online and batch modes (`--batch` flag)
- Invoice send supports single XML file and directory batch send
- Invoice query supports rich filtering (date range, NIP, amount, currency, pagination)
- UPO download as a session subcommand
- Progress spinners (via consola) for long-running operations (session open/close, export)
- All commands respect global flags (`--json`, `--env`, `--nip`, `--verbose`, `--timeout`)
- Session reference is stored in `session-store` after `session open` for use by subsequent commands

## Capabilities

### New Capabilities
- `cli-session`: CLI commands for KSeF session management (open, close, status, list, invoices, failed, upo). Wraps `OnlineSessionService`, `BatchSessionService`, `SessionStatusService`, and `ActiveSessionsService`.
- `cli-invoice`: CLI commands for KSeF invoice operations (send, get, query, export, export-status). Wraps `InvoiceDownloadService` and session invoice methods. Includes file I/O for XML send and download.

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **New files**: `src/cli/commands/session.ts`, `src/cli/commands/invoice.ts`
- **Modified files**: `src/cli/index.ts` (register new command groups), `src/cli/types.ts` (extend `SessionData` with `sessionRef` tracking), `src/cli/session-store.ts` (store/retrieve session reference)
- **Dependencies**: No new dependencies. Uses existing `citty`, `consola`, `cli-table3`.
- **Library services used**: `OnlineSessionService`, `BatchSessionService`, `SessionStatusService`, `ActiveSessionsService`, `InvoiceDownloadService`
- **File system**: Invoice send reads XML files from disk; invoice get/UPO writes files to disk
