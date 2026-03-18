## Context

CLI currently exposes 112/123 API client methods. The 11 missing methods span 6 services — two entire services (`ActiveSessionsService`, `LimitsService`) have zero CLI coverage, and four existing CLI commands (`session`, `cert`, `permission`, `peppol`) are each missing 1-2 methods. All 11 methods already exist in the service layer with full types — this is purely a CLI wiring task.

CLI uses `citty` for command definition, `consola` for logging, and shared helpers (`outputResult`, `outputKeyValue`, `outputTable`, `withErrorHandler`) from `src/cli/output.ts` and `src/cli/error-handler.ts`. Every command follows the same pattern: `defineCommand` → `withErrorHandler` → `requireSession`/`createClient` → call service → format output.

## Goals / Non-Goals

**Goals:**
- Reach 100% CLI coverage of the API client (123/123 methods)
- Follow existing CLI patterns exactly — no new abstractions or refactors
- All new commands support `--json`, `--env`, `--verbose`, `--timeout` global options

**Non-Goals:**
- Refactoring existing CLI command structure
- Adding tests for CLI commands (existing commands don't have CLI-level tests either)
- Interactive/wizard-style commands
- Changing service layer or model types

## Decisions

### 1. Active sessions: nest under `session` vs new top-level `active-session`

**Decision:** Add `active` and `revoke` subcommands to the existing `ksef session` command group.

**Rationale:** Active sessions are conceptually related to session management. The `session` command already handles open/close/status/list/invoices. Adding `active` (list active sessions) and `revoke` (revoke by ref or `--current`) keeps the CLI surface flat. A separate top-level command would fragment session-related operations.

**Alternative considered:** `ksef active-session list|revoke` — rejected because it splits session operations across two command groups.

### 2. Limits: new top-level command

**Decision:** Create `ksef limits` as a new top-level command group with `context`, `subject`, and `rate` subcommands.

**Rationale:** Limits have no conceptual overlap with existing command groups. They're a distinct domain (`LimitsService`). Three subcommands map cleanly to the three service methods.

### 3. Peppol: new top-level command

**Decision:** Create `ksef peppol` as a new top-level command with a `providers` subcommand.

**Rationale:** Currently only one method (`queryProviders`), but the Peppol domain is distinct. Using a command group with a subcommand leaves room for future Peppol endpoints without restructuring.

### 4. Session invoice: subcommand vs flag on existing `invoices`

**Decision:** Add `ksef session invoice <invoiceRef>` as a separate subcommand (singular), distinct from the existing `ksef session invoices` (plural, lists all).

**Rationale:** The singular/plural naming convention makes the distinction clear: `invoices` lists all, `invoice` fetches one by ref. Using a `--ref` flag on `invoices` would overload the command and change its semantics when the flag is present.

### 5. Certificate additions: simple subcommands

**Decision:** Add `enrollment-data` and `retrieve` as subcommands to `ksef cert`.

**Rationale:** Direct mapping to service methods. `enrollment-data` is a simple GET, `retrieve` takes filter criteria similar to the existing `list` but with different semantics (retrieves full cert data vs. querying metadata).

### 6. Permission attachment-status: simple subcommand

**Decision:** Add `attachment-status` as a subcommand to `ksef permission`.

**Rationale:** Single GET endpoint, returns a boolean-like response. Simple key-value output.

## Risks / Trade-offs

- **`session` command growing large** — adding `active` + `revoke` + `invoice` brings it to 10 subcommands. → Acceptable; all are semantically related and the file stays manageable.
- **`revoke` ambiguity** — `ksef session revoke` could be confused with revoking the current KSeF session (which is `close`). → Mitigate with clear `--help` descriptions. `revoke` specifically means revoking an active authentication session, while `close` terminates the online API session.
