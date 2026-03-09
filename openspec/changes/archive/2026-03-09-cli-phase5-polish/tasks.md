## 1. Verbose logging

- [x] 1.1 Add `verbose` arg to `getGlobalOpts` in all command files (cert, qr, lighthouse, test-data, token, permission, invoice, session, auth) — ensure `verbose: args.verbose as boolean | undefined`
- [x] 1.2 In `client-factory.ts`, check `globalOpts.verbose` in `createClient` and `requireSession` — if truthy, set `consola.level = 4`
- [x] 1.3 Add `consola.debug` logging in `RestClient.sendRequest` — log method, full URL, status code, and response time (ms) after each request
- [x] 1.4 Verify `--verbose` works: run `ksef lighthouse status --verbose` and confirm debug lines appear on stderr

## 2. Error hints

- [x] 2.1 Enhance `withErrorHandler` in `error-handler.ts` — add hint logic after each error type: 401/403 → auth hint, 404 → reference hint, network errors → doctor hint
- [x] 2.2 Add `KSeFRateLimitError` hint with human-readable delay (already shows delay, ensure format is consistent)
- [x] 2.3 Verify hints display correctly: trigger a network error and confirm "Hint:" line appears after the error

## 3. Doctor command (`src/cli/commands/doctor.ts`)

- [x] 3.1 Create `doctor.ts` with config check — load config, display status (OK / not found / corrupted)
- [x] 3.2 Add connectivity check — call lighthouse status with 5s timeout, display reachable/unreachable
- [x] 3.3 Add session check — load session, check expiry, display status (active / expired / not stored)
- [x] 3.4 Add summary line — "N/M checks passed" with success/warning style
- [x] 3.5 Add `--json` output — structured JSON with all check results
- [x] 3.6 Export `doctorCommand` and register in `src/cli/index.ts`

## 4. Completion command (`src/cli/commands/completion.ts`)

- [x] 4.1 Define command tree constant — all top-level commands and their subcommands as a data structure
- [x] 4.2 Implement `bash` subcommand — generate bash completion script template with command tree
- [x] 4.3 Implement `zsh` subcommand — generate zsh completion script template with command tree
- [x] 4.4 Implement `fish` subcommand — generate fish completion script template with command tree
- [x] 4.5 Export `completionCommand` and register in `src/cli/index.ts`

## 5. Build and verify

- [x] 5.1 Run `yarn lint` — verify no type errors
- [x] 5.2 Run `yarn build` — verify no compilation errors
- [x] 5.3 Verify `ksef --help` lists `doctor` and `completion` commands
- [x] 5.4 Verify `ksef doctor --help` and `ksef completion --help` work
