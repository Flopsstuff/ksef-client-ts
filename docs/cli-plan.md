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
│       ├── session.ts        # ksef session [open|close|status|list]
│       ├── invoice.ts        # ksef invoice [send|get|query|export|export-status]
│       ├── permission.ts     # ksef permission [grant|revoke|search|status]
│       ├── token.ts          # ksef token [generate|list|get|revoke]
│       ├── cert.ts           # ksef cert [enroll|list|revoke|status]
│       ├── qr.ts             # ksef qr [invoice|certificate]
│       ├── lighthouse.ts     # ksef lighthouse [status|messages]
│       └── test-data.ts      # ksef test-data [...]
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

### Phase 2: Sessions & Invoices

**2.1 `ksef session`**

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

**2.2 `ksef invoice`**

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

### Phase 3: Permissions & Tokens

**3.1 `ksef permission`**

```
ksef permission grant person --nip <nip> --pesel <pesel> [--read] [--write]
ksef permission grant entity --nip <nip> --target-nip <nip> [--read] [--write]
ksef permission grant indirect --nip <nip> --target-nip <nip>
ksef permission revoke <permission-ref>
ksef permission search [--type person|entity|subunit|authorization]
ksef permission status <ref>
```

**3.2 `ksef token`**

```
ksef token generate [--description <desc>]       # Generate new KSeF token
ksef token list                                  # List tokens
ksef token get <ref>                             # Get token details
ksef token revoke <ref>                          # Revoke token
```

---

### Phase 4: Certificates, QR, Utilities

**4.1 `ksef cert`**

```
ksef cert generate --out <dir>                   # Generate self-signed cert + key (for test)
ksef cert enroll --cert <cert.pem>               # Submit certificate enrollment
ksef cert status <ref>                           # Check enrollment status
ksef cert list                                   # List certificates
ksef cert revoke <serial>                        # Revoke certificate
ksef cert limits                                 # Show certificate limits
```

**4.2 `ksef qr`**

```
ksef qr invoice <ksef-number> [-o qr.png] [--size 300]     # Generate invoice QR
ksef qr certificate <params...> [-o qr.png]                 # Generate certificate QR
ksef qr url <ksef-number>                                    # Print verification URL only
```

**4.3 `ksef lighthouse`**

```
ksef lighthouse status                           # System availability status
ksef lighthouse messages                         # System messages
```

**4.4 `ksef test-data`** (only for test/demo environments)

```
ksef test-data subjects [list|create|delete]
ksef test-data persons [list|create|delete]
ksef test-data permissions [list|create|delete]
ksef test-data limits [list|set|reset]
```

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

### Phase 2: Sessions + Invoices
- [ ] Session open/close/status
- [ ] Invoice send (single + batch)
- [ ] Invoice download/query/export
- [ ] Progress spinners for long operations
- [ ] UPO download

### Phase 3: Permissions + Tokens
- [ ] Permission grant/revoke/search
- [ ] Token CRUD
- [ ] Status polling with spinner

### Phase 4: Certs + QR + Utilities
- [ ] Certificate commands
- [ ] QR code generation (file output)
- [ ] Lighthouse status
- [ ] Test data commands (gated to test/demo env)

### Phase 5: Polish
- [ ] Tab completion (bash/zsh/fish)
- [ ] Man page generation
- [ ] `--verbose` / `--debug` flags (log HTTP requests)
- [ ] Error messages with hints/suggestions
- [ ] `ksef doctor` — check config, connectivity, cert validity

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
