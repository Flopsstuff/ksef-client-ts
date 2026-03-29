## 1. Shared stores extraction

- [ ] 1.1 Create `src/cli/pending-challenge-store.ts` — extract `PendingChallenge` interface, `savePendingChallenge()`, `clearPendingChallenge()` from `src/cli/commands/auth.ts`
- [ ] 1.2 Update `src/cli/commands/auth.ts` — import from `pending-challenge-store.ts`, remove inline definitions
- [ ] 1.3 Create `src/cli/credentials-store.ts` — `CliCredentials` interface, `loadCredentials()`, `saveCredentials()`, `clearCredentials()` with `~/.ksef/credentials.json` (mode `0o600`)
- [ ] 1.4 Tests for `pending-challenge-store.ts` and `credentials-store.ts`

## 2. Auth login credentials fallback

- [ ] 2.1 Update `src/cli/commands/auth.ts` login command — fall back to `loadCredentials().token` when `--token` not provided (explicit `--token` takes precedence, `--p12`/`--cert`+`--key` unaffected)
- [ ] 2.2 Tests for credentials fallback in login command

## 3. Cross-platform folder opener

- [ ] 3.1 Create `src/cli/utils/open-folder.ts` — `openFolder(path)` using `open`/`xdg-open`/`start` per platform, returns boolean, never throws
- [ ] 3.2 Tests for `open-folder.ts`

## 4. Setup wizard command

- [ ] 4.1 Create `src/cli/commands/setup.ts` — command definition with `--env` arg, TTY check, `withErrorHandler` wrapper
- [ ] 4.2 Implement Phase 1 config — welcome banner, existing session check, NIP prompt with `isValidNip()` validation, env from arg/config, save config before auth
- [ ] 4.3 Implement Phase 1 auth — get challenge, build unsigned XML, save to `~/.ksef/auth.xml`, save pending challenge, open folder, print signing instructions, prompt for signed XML path (tilde expansion, exists validation)
- [ ] 4.4 Implement Phase 1 submit — read signed XML, submit, poll auth status, redeem tokens, save session, clear pending challenge. Handle challenge expiry with restart offer
- [ ] 4.5 Implement Phase 2 — confirm prompt, permissions multiselect, description text prompt, generate token, save to credentials store, re-login with generated token, save new session
- [ ] 4.6 Implement completion summary — display env, NIP, auth status, token presence, quick-start command examples

## 5. Registration and integration

- [ ] 5.1 Register `setupCommand` in `src/cli/index.ts`

## 6. Testing

- [ ] 6.1 Tests for setup wizard — TTY rejection, NIP validation, env default/override, config persistence, Phase 1 flow, Phase 2 flow with re-login, Phase 2 skip, error recovery scenarios
- [ ] 6.2 Run full test suite (`yarn test`) — all existing + new tests pass
- [ ] 6.3 Build check (`yarn build`) — compiles without errors
