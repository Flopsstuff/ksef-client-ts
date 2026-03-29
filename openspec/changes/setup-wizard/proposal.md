## Why

Users currently need to run multiple separate CLI commands to get started with KSeF: configure NIP, authenticate via external signature (two-step process), then generate an API token. This is error-prone and undocumented. A guided interactive wizard combines everything into a single `ksef setup` command — the first interactive command in the CLI.

## What Changes

- New `ksef setup` command — interactive wizard that walks the user through NIP configuration, external signature authentication, and optional API token generation in one flow
- New credentials store — long-lived API tokens stored separately from config in `~/.ksef/credentials.json` (mode `0o600`)
- New cross-platform folder opener utility — opens `~/.ksef/` after saving unsigned XML so the user can find it for signing
- Extract pending challenge store from `auth.ts` into a shared module — reusable by both `auth login-external` and `setup`
- `auth login` gains fallback to stored credentials — when `--token` is not provided, reads from credentials store

## Capabilities

### New Capabilities
- `cli-setup-wizard`: Interactive onboarding wizard (`ksef setup`) with two phases: external signature auth and optional token generation
- `credentials-store`: Persistent storage for long-lived CLI credentials (`~/.ksef/credentials.json`), separate from config and session
- `open-folder`: Cross-platform folder opener utility (macOS/Linux/Windows)

### Modified Capabilities
- `external-signing`: Extract pending challenge persistence into a shared store module (no requirement changes, implementation-only refactor)
- `cli-token`: `auth login` falls back to credentials store when `--token` not provided

## Impact

- **New files**: `src/cli/commands/setup.ts`, `src/cli/credentials-store.ts`, `src/cli/pending-challenge-store.ts`, `src/cli/utils/open-folder.ts`
- **Modified files**: `src/cli/commands/auth.ts` (extract pending challenge, add credentials fallback), `src/cli/index.ts` (register setup command)
- **Dependencies**: None — `consola` 3.4.2 already provides all needed prompt types (text, confirm, select, multiselect)
- **API surface**: New public CLI command only; no library API changes
