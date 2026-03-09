## Why

CLI Phases 1-4 deliver full command coverage but lack developer experience polish. There is no `--verbose` flag to debug HTTP issues, error messages don't suggest next steps (e.g. "run `ksef auth login`"), there is no health check command, and no shell completions. These are the last items before the CLI is production-ready.

## What Changes

- Add `--verbose` global flag to log HTTP request/response details (method, URL, status, timing) via consola debug level
- Enhance error handler with contextual hints: auth errors suggest `ksef auth login`, missing config suggests `ksef config set`, rate limit shows retry countdown, network errors suggest checking env/connectivity
- Add `ksef doctor` command: verify config exists, test API connectivity, check session validity, check certificate validity (if certs exist)
- Add shell completion generation: `ksef completion bash|zsh|fish` outputs completion script to stdout

## Capabilities

### New Capabilities
- `cli-verbose`: `--verbose` global flag that enables HTTP request/response logging across all commands
- `cli-error-hints`: Enhanced error messages with contextual hints and suggestions for common failure modes
- `cli-doctor`: `ksef doctor` command that checks config, connectivity, session, and certificate health
- `cli-completion`: `ksef completion` command that generates shell completion scripts for bash/zsh/fish

### Modified Capabilities
None. Existing specs are not affected — these are cross-cutting enhancements and new commands.

## Impact

- **Modified files**: `src/cli/error-handler.ts` (hints), `src/cli/types.ts` (verbose in GlobalOptions), `src/http/rest-client.ts` (optional verbose logging), `src/cli/index.ts` (register doctor + completion), every command file (add `verbose` to global args)
- **New files**: `src/cli/commands/doctor.ts`, `src/cli/commands/completion.ts`
- **No new dependencies**: citty has built-in completion support, consola has debug log level
- **No breaking changes**
