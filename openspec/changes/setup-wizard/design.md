## Context

The CLI currently requires 3+ separate commands to set up: `ksef config set --nip`, `ksef auth login-external --generate` / `--submit`, and optionally `ksef token generate`. Each requires knowing the right flags and order. The `ksef setup` wizard combines these into one guided flow.

The CLI uses citty for command definitions and consola for output. Consola 3.4.2 includes `consola.prompt()` with text, confirm, select, and multiselect types — sufficient for all wizard interactions. No new dependencies needed.

Existing store modules follow a consistent pattern: `~/.ksef/` directory, JSON files, `load/save/clear` function triplet. The new stores follow the same pattern.

## Goals / Non-Goals

**Goals:**
- Single `ksef setup` command that walks through NIP config, external signature auth, and optional token generation
- Reuse existing auth and token API logic — no duplication of protocol handling
- Share pending challenge persistence between `auth login-external` and `setup`
- Stored token as fallback for `auth login` (no `--token` flag needed after setup)

**Non-Goals:**
- Token-based auth in the wizard (only external signature — tokens require an existing token)
- Certificate/PKCS#12 auth in the wizard (setup targets users without local certs)
- Batch/non-interactive mode for `setup` (use individual commands for scripting)
- Reading or validating `pending-challenge.json` contents (write-only diagnostic artifact for now)

## Decisions

### 1. consola.prompt() for all interactive input

Use consola's built-in prompt system rather than adding inquirer/prompts/etc.

**Rationale:** consola 3.4.2 already supports text, confirm, select, multiselect with validation and cancel handling. Zero new dependencies. All prompts use `cancel: 'reject'` so Ctrl+C propagates as an error caught by `withErrorHandler`.

**Alternative considered:** inquirer — more features but adds a dependency for no benefit here.

### 2. Separate credentials store from config and session

Credentials store (`~/.ksef/credentials.json`, mode `0o600`) is distinct from:
- `config.json` — user preferences (env, NIP, output format), not secret
- `session.json` — short-lived access/refresh tokens from auth, mode `0o600`

**Rationale:** Long-lived API tokens have a different lifecycle than session tokens. Sessions expire and get refreshed; credentials persist until explicitly revoked. Separate files mean `clearSession()` (logout) doesn't destroy stored credentials, and file permissions can differ (credentials always `0o600`, config doesn't need it).

**Alternative considered:** Store token in config.json — mixes secrets with preferences, harder to set restrictive permissions without affecting config reads.

### 3. Extract pending-challenge-store as shared module

Move `PendingChallenge` interface, `savePendingChallenge()`, and `clearPendingChallenge()` from `auth.ts` into `src/cli/pending-challenge-store.ts`. Both `auth login-external` and `setup` import from the shared module.

**Rationale:** The wizard needs to save pending challenge metadata at the same point in the flow as `auth login-external --generate`. Duplicating the logic is worse than extracting it. The store remains write-only for now (diagnostic artifact on disk), but centralizing it makes future reads straightforward.

### 4. Wizard as a single citty command, not a subcommand group

`ksef setup` is one command, not `ksef setup init` / `ksef setup auth` / etc.

**Rationale:** The wizard is a linear flow, not a collection of independent operations. Users run it once. Subcommand structure adds navigation overhead for no benefit. The individual steps already exist as separate commands for advanced users.

### 5. Environment via CLI argument, not prompt

Environment is not an interactive prompt. It defaults to the current config value (prod if unconfigured) and can be overridden with `--env test`. The resolved value is saved to config alongside NIP.

**Rationale:** Environment is a one-time decision that rarely changes. Prompting for it adds friction to the happy path (most users want prod). Power users targeting test/demo already know the `--env` pattern from other commands. Consistent with how every other CLI command handles env.

### 6. Save config before auth attempt

NIP and environment are saved to `config.json` immediately after the user enters NIP (before the challenge request). This means even if auth fails or the user quits during signing, the config persists.

**Rationale:** Config values are non-secret and independently useful. A user who starts setup, fails auth, and then runs `ksef auth login-external --generate` manually should already have their NIP configured.

### 7. open-folder as a fire-and-forget utility

`openFolder()` returns `boolean` (success/fail), never throws. On failure, the wizard prints the path as fallback text.

**Rationale:** Opening a folder is a convenience, not a critical step. The user can navigate to `~/.ksef/` manually. Platform detection is imperfect (`xdg-open` may not be installed on minimal Linux), and the wizard must not fail because of it.

## Risks / Trade-offs

**[Challenge expiry during external signing]** → The user may take too long signing the XML externally. The wizard catches the API error on submit and offers to restart Phase 1 (new challenge). No state is lost because config was already saved.

**[consola.prompt() limitations]** → consola's prompt types are simpler than inquirer's. No autocomplete, no file picker. Sufficient for NIP entry, env selection, and permission multiselect. File path entry is plain text with `fs.existsSync()` validation.

**[Phase 2 failure after Phase 1 success]** → Token generation could fail (permissions issue, API error) after the user already authenticated. The session is already saved, so the user has a working auth. The wizard catches the error and suggests `ksef token generate` as manual fallback.

**[Re-login failure after token generation]** → The token was generated and saved, but re-login with it failed (e.g. network issue). The token is still valid and persisted in credentials store, the external signature session is still active. The wizard warns and suggests `ksef auth login` manually.

**[Platform-specific open-folder behavior]** → `xdg-open` behavior varies across Linux DEs. `start` on Windows needs empty title arg for paths with spaces. Both are handled in the implementation, but edge cases may exist on exotic setups. Failure is non-critical (fallback to printed path).
