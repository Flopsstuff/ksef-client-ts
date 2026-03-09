# KSeF CLI Tool — Implementation Plan

## Overview

Thin CLI wrapper over `KSeFClient` library. Each command maps directly to a client method, formats output for terminal. All business logic stays in the library.

## Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| CLI framework | `citty` (UnJS) | Lightweight, tree-shakeable, TS-native |
| Output formatting | `consola` (UnJS) | Colored output, log levels, spinners |
| Tables | `cli-table3` | ASCII tables for list output |
| Config storage | JSON file `~/.ksef/config.json` | Simple, no extra deps |
| Session persistence | JSON file `~/.ksef/session.json` | Token caching between calls |
| Binary name | `ksef` | Short, memorable |

## Project Structure

```
src/
├── cli/
│   ├── index.ts              # [DONE] Entry point, top-level command registration
│   ├── types.ts              # [DONE] CliConfig, SessionData, GlobalOptions
│   ├── config-store.ts       # [DONE] Config read/write (~/.ksef/config.json)
│   ├── session-store.ts      # [DONE] Session/token persistence (~/.ksef/session.json)
│   ├── output.ts             # [DONE] Formatting helpers (tables, JSON, pretty)
│   ├── client-factory.ts     # [DONE] Create KSeFClient from stored config
│   ├── error-handler.ts      # [DONE] withErrorHandler wrapper
│   │
│   └── commands/
│       ├── config.ts         # [DONE] ksef config [set|show|reset]
│       ├── auth.ts           # [DONE] ksef auth [challenge|login|status|logout|refresh|whoami]
│       ├── session.ts        # [DONE] ksef session [open|close|status|list|invoices|failed|upo]
│       ├── invoice.ts        # [DONE] ksef invoice [send|get|query|export|export-status]
│       ├── permission.ts     # [DONE] ksef permission [grant|revoke|search|status]
│       ├── token.ts          # [DONE] ksef token [generate|list|get|revoke]
│       ├── cert.ts           # [DONE] ksef cert [generate|enroll|status|list|revoke|limits]
│       ├── qr.ts             # [DONE] ksef qr [invoice|certificate|url]
│       ├── lighthouse.ts     # [DONE] ksef lighthouse [status|messages]
│       ├── test-data.ts      # [DONE] ksef test-data [18 subcommands]
│       ├── doctor.ts         # [DONE] ksef doctor (config, connectivity, session checks)
│       └── completion.ts     # [DONE] ksef completion [bash|zsh|fish]
```

## Config File (`~/.ksef/config.json`)

```json
{
  "environment": "test",
  "nip": "1234567890",
  "output": "pretty",
  "timeout": 100000
}
```

## Session File (`~/.ksef/session.json`)

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "sessionRef": "...",
  "expiresAt": "2026-03-07T12:00:00Z"
}
```

Auto-refresh token if expired. Clear on `ksef auth logout`.

---

## Commands

### Phase 1: Config & Auth — DONE

**1.1 `ksef config`** — DONE

```
ksef config set --env test|demo|prod    # Set environment
ksef config set --nip 1234567890        # Set default NIP
ksef config set --output pretty|json    # Set output format
ksef config show                        # Show current config
ksef config reset                       # Reset to defaults
```

**1.2 `ksef auth`** — DONE

```
ksef auth challenge                             # Get auth challenge
ksef auth login --token <ksef-token>            # Authenticate with KSeF token
ksef auth login --cert <cert.pem> --key <key.pem>  # Authenticate with certificate (XAdES)
ksef auth status <ref>                          # Check auth operation status
ksef auth logout                                # Clear stored session
ksef auth refresh                               # Refresh access token
ksef auth whoami                                # Show current session info
```

Login flow (automated):
1. Get challenge
2. Sign/submit auth request
3. Poll status until complete
4. Redeem token → store access + refresh tokens

---

### Phase 2: Sessions & Invoices — DONE

**2.1 `ksef session`** — DONE

```
ksef session open                                # Open online session (uses stored config)
ksef session open --batch                        # Open batch session
ksef session close [ref]                         # Close session (current or by ref)
ksef session status [ref]                        # Session status
ksef session list [--type online|batch]          # List sessions
ksef session invoices [ref] [--page N]           # List session invoices
ksef session failed [ref] [--page N]             # List failed invoices
ksef session upo <ref> [--invoice-ref <iref>]    # Download UPO
```

**2.2 `ksef invoice`** — DONE

```
ksef invoice send <file.xml>                     # Send single invoice
ksef invoice send <dir/>                         # Send all XMLs in directory (batch)
ksef invoice get <ksef-number> [-o file.xml]     # Download invoice by KSeF number
ksef invoice query [filters...]                  # Query invoice metadata
  --from <date> --to <date>                      #   date range
  --seller-nip <nip>                             #   seller NIP
  --buyer-nip <nip>                              #   buyer NIP
  --amount-from <n> --amount-to <n>              #   amount range
  --currency <PLN|EUR|...>                       #   currency
  --page <n> --size <n>                          #   pagination
ksef invoice export [filters...]                 # Start invoice export
ksef invoice export-status <ref>                 # Check export status
```

---

### Phase 3: Permissions & Tokens — DONE

**3.1 `ksef permission`** — DONE

```
ksef permission grant person --nip <nip> --pesel <pesel> [--read] [--write]
ksef permission grant entity --nip <nip> --target-nip <nip> [--read] [--write]
ksef permission grant indirect --nip <nip> --target-nip <nip>
ksef permission revoke <permission-ref>
ksef permission search [--type person|entity|subunit|authorization]
ksef permission status <ref>
```

**3.2 `ksef token`** — DONE

```
ksef token generate [--description <desc>]       # Generate new KSeF token
ksef token list                                  # List tokens
ksef token get <ref>                             # Get token details
ksef token revoke <ref>                          # Revoke token
```

---

### Phase 4: Certificates, QR, Utilities — DONE

**4.1 `ksef cert`** — DONE

```
ksef cert generate --out <dir>                   # Generate self-signed cert + key (for test)
ksef cert enroll --cert <cert.pem>               # Submit certificate enrollment
ksef cert status <ref>                           # Check enrollment status
ksef cert list                                   # List certificates
ksef cert revoke <serial>                        # Revoke certificate
ksef cert limits                                 # Show certificate limits
```

**4.2 `ksef qr`** — DONE

```
ksef qr invoice <ksef-number> [-o qr.png] [--size 300]     # Generate invoice QR
ksef qr certificate <params...> [-o qr.png]                 # Generate certificate QR
ksef qr url <ksef-number>                                    # Print verification URL only
```

**4.3 `ksef lighthouse`** — DONE

```
ksef lighthouse status                           # System availability status
ksef lighthouse messages                         # System messages
```

**4.4 `ksef test-data`** (only for test/demo environments) — DONE

```
ksef test-data subjects [list|create|delete]
ksef test-data persons [list|create|delete]
ksef test-data permissions [list|create|delete]
ksef test-data limits [list|set|reset]
```

---

### Phase 5: Polish — DONE

**5.1 `ksef doctor`** — DONE

```
ksef doctor                              # Run all health checks (config, connectivity, session)
ksef doctor --json                       # Output check results as JSON
```

**5.2 `ksef completion`** — DONE

```
ksef completion bash                     # Generate bash completion script
ksef completion zsh                      # Generate zsh completion script
ksef completion fish                     # Generate fish completion script
```

**5.3 `--verbose` flag** — DONE

All commands accept `--verbose` to log HTTP request/response details (method, URL, status, timing) to stderr via `consola.debug`.

**5.4 Error hints** — DONE

Contextual hints after errors: 401/403 → auth hint, 404 → reference hint, network → doctor hint, rate-limit → retry delay.

---

## Implementation Phases

### Phase 1: Scaffold + Config + Auth — DONE
- [x] CLI entry point with `citty`
- [x] Config management (`~/.ksef/`)
- [x] Session store (token persistence)
- [x] `auth` commands (full login flow)
- [x] `--help` for all commands
- [x] `--json` global flag for machine-readable output
- [x] Error handler (`withErrorHandler`)
- [x] Client factory (`createClient`, `requireSession`)

### Phase 2: Sessions + Invoices — DONE
- [x] Session open/close/status/list/invoices/failed/upo
- [x] Invoice send (single + batch)
- [x] Invoice download/query/export
- [x] UPO download

### Phase 3: Permissions + Tokens — DONE
- [x] Permission grant/revoke/search/status
- [x] Token generate/list/get/revoke

### Phase 4: Certs + QR + Utilities — DONE
- [x] Certificate commands (generate, enroll, status, list, revoke, limits)
- [x] QR code generation (invoice, certificate, url — PNG/SVG/base64)
- [x] Lighthouse status and messages (no auth required)
- [x] Test data commands (18 subcommands, gated to test/demo env)

### Phase 5: Polish — DONE
- [x] Tab completion (bash/zsh/fish) — `ksef completion bash|zsh|fish`
- [x] `--verbose` flag (log HTTP method, URL, status, timing via consola.debug)
- [x] Error messages with contextual hints (auth, 404, network, rate-limit)
- [x] `ksef doctor` — check config, connectivity, session validity

---

## package.json Changes

```json
{
  "bin": {
    "ksef": "./dist/cli.js"
  },
  "scripts": {
    "build:cli": "tsup src/cli/index.ts --format esm --outDir dist --entry.cli=src/cli/index.ts"
  }
}
```

## Global Flags

| Flag | Description |
|---|---|
| `--env test\|demo\|prod` | Override environment (ignores config) |
| `--json` | Output raw JSON (for scripting) |
| `--verbose` | Show HTTP request/response details |
| `--no-color` | Disable colored output |
| `--timeout <ms>` | Override request timeout |
| `--nip <nip>` | Override NIP (ignores config) |

## Error Handling

- `KSeFApiError` → formatted error with status code, exception details, hint
- `KSeFRateLimitError` → message with retry-after countdown
- Network errors → connectivity check hint
- Auth errors → suggest `ksef auth login`
- Missing config → suggest `ksef config set`

## Dependencies (additional for CLI)

| Package | Purpose |
|---|---|
| `citty` | CLI framework |
| `consola` | Colored output, spinners |
| `cli-table3` | ASCII tables |

All lightweight, total ~50KB.
