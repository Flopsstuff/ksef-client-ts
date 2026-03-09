## Context

The CLI has 10 command groups (config, auth, session, invoice, permission, token, cert, qr, lighthouse, test-data) all following the same pattern: `defineCommand` + `withErrorHandler` + `getGlobalOpts`. Error handling exists in `src/cli/error-handler.ts` but only covers basic cases without contextual suggestions. There is no HTTP request logging, no health check command, and no shell completion support.

`consola` (already a dependency) supports log levels including `debug` (level 4). `citty` does NOT have built-in completion — completion scripts must be hand-written or generated manually.

## Goals / Non-Goals

**Goals:**
- `--verbose` flag across all commands that logs HTTP request/response details
- Smarter error messages with actionable hints for common failures
- `ksef doctor` command for quick health checks
- `ksef completion` command for shell completion scripts

**Non-Goals:**
- Man page generation (low value, `--help` is sufficient)
- `--debug` as separate from `--verbose` (one flag is enough)
- Automatic completion installation (user sources the script manually)
- HTTP request body logging (may contain sensitive data like tokens)

## Decisions

### D1: Verbose logging via consola log level

Set `consola.level = 4` (debug) when `--verbose` is passed. Add `consola.debug(...)` calls in `RestClient.sendRequest` to log: method, full URL, status code, response time. This keeps logging centralized in the HTTP layer rather than scattered across commands.

The `verbose` flag already exists in `GlobalOptions` but is unused. The wiring: `createClient`/`requireSession` in `client-factory.ts` will check `globalOpts.verbose` and set consola level. `RestClient` will use `consola.debug` — these calls are no-ops when level < 4.

**Alternative**: Custom logger injected into RestClient. Rejected — consola is already used everywhere and supports levels natively.

### D2: Error hints via a hint map in error-handler.ts

Extend `withErrorHandler` with a hint lookup: match error type/message patterns → append a suggestion line. No new abstractions — just `consola.info('Hint: ...')` after the error message.

Hint map:
- `KSeFApiError` with 401/403 → "Run `ksef auth login` to authenticate."
- `KSeFApiError` with 404 → "Check if the resource reference is correct."
- `KSeFRateLimitError` → "Retry after N seconds." (already exists, enhance with countdown)
- Network errors (fetch failed, ECONNREFUSED, ETIMEDOUT) → "Check network and environment with `ksef doctor`."
- "No active session" → "Run `ksef auth login` first." (already in requireSession, keep as-is)
- Missing config fields → "Run `ksef config set --env <env>` to configure."

**Alternative**: Structured error classes with `.hint` property. Rejected — over-engineering for string hints.

### D3: Doctor command — sequential checks with pass/fail output

`ksef doctor` runs a series of checks and reports results:
1. **Config**: Check if `~/.ksef/config.json` exists and is valid
2. **Environment**: Show resolved environment (test/demo/prod) and API URL
3. **Connectivity**: `HEAD` or `GET` to the lighthouse status endpoint (no auth needed, fast)
4. **Session**: Check if session exists and is not expired
5. **Certificates**: If cert files referenced in config exist and are readable (optional, skip if no certs)

Each check outputs a line: `✓ Config OK` or `✗ Session expired`. At the end, summary: "N/M checks passed."

No auth required for doctor — it uses `createClient` and checks what it can without logging in.

### D4: Completion scripts — static templates with command/flag lists

`ksef completion bash|zsh|fish` outputs a shell completion script to stdout. The user pipes it to a file or sources it directly (e.g. `eval "$(ksef completion bash)"`).

The scripts are static string templates embedded in the code with all known commands and their subcommands hard-coded. This is simpler and more reliable than runtime introspection of citty's command tree.

**Alternative**: Use a completion library like `omelette` or `tabtab`. Rejected — adds a dependency for something that's just 3 string templates.

### D5: Verbose flag propagation — via consola global level, not per-request

Setting `consola.level` globally at CLI entry (in `withErrorHandler` or `client-factory.ts`) means ALL consola.debug calls in the entire process become visible. This is intentional — verbose mode shows everything. No need to thread a verbose flag through RestClient constructor.

## Risks / Trade-offs

- **Completion scripts go stale**: When new commands are added, completion scripts must be updated manually.
  → Mitigation: Keep the command list as a constant array, easy to update. Add a comment reminder.

- **Verbose logging in production**: Users may accidentally pipe verbose output alongside JSON.
  → Mitigation: `consola.debug` goes to stderr, not stdout. JSON output (`--json`) goes to stdout via `console.log`. No conflict.

- **Doctor connectivity check may be slow**: Network timeout on failed connection.
  → Mitigation: Use a short timeout (5s) for the doctor connectivity check, independent of the configured timeout.
