# CLI Reference

The `ksef` CLI is a thin wrapper over the `ksef-client-ts` library. Each command maps directly to a client method and formats output for the terminal.

## Installation

```bash
# Clone and link locally
git clone https://github.com/Flopsstuff/ksef-client-ts.git
cd ksef-client-ts
yarn install && yarn build && yarn link
```

## Quick Start

```bash
# 1. Configure environment and NIP
ksef config set --env test --nip 1234567890

# 2. Authenticate with a KSeF token
ksef auth login --token "$KSEF_TOKEN"

# 3. Open a session, send an invoice, close the session
ksef session open
ksef invoice send invoice.xml
ksef session close
```

## Global Options

These flags are available on most subcommands:

| Flag | Description |
|------|-------------|
| `--env test\|demo\|prod` | Override environment (ignores config) |
| `--json` | Output raw JSON (for scripting) |
| `--verbose` | Show HTTP request/response details (method, URL, status, timing) |
| `--timeout <ms>` | Override request timeout |
| `--nip <nip>` | Override NIP (ignores config) |

## Configuration

Config is stored in `~/.ksef/config.json`.

```bash
ksef config set --env test          # Set environment
ksef config set --nip 1234567890    # Set default NIP
ksef config set --output pretty     # Set output format (pretty|json)
ksef config set --timeout 60000     # Set request timeout (ms)
ksef config show                    # Show current config
ksef config reset                   # Reset to defaults
```

Default values: `environment=test`, `output=pretty`, `timeout=30000`.

## Authentication

Session data is stored in `~/.ksef/session.json`. Most commands require an active session.

### Token Authentication

```bash
ksef auth login --token <ksef-token> --nip <nip>
```

The login flow is fully automated: get challenge, encrypt token, submit auth request, redeem access token.

### Certificate Authentication (XAdES)

```bash
ksef auth login --cert cert.pem --key key.pem
```

Signs the challenge with XAdES and submits. Both `--cert` and `--key` are required.

### Other Auth Commands

```bash
ksef auth challenge               # Request an authorization challenge
ksef auth status <ref>            # Check auth operation status
ksef auth refresh                 # Refresh access token (requires refreshToken)
ksef auth whoami                  # Show current session info
ksef auth logout                  # Clear stored session
```

## Sessions

```bash
ksef session open                             # Open online session
ksef session close [ref]                      # Close session (current or by ref)
ksef session status [ref]                     # Check session status
ksef session list [--type online|batch]       # List sessions
ksef session invoices [ref] [--pageSize N]    # List session invoices
ksef session failed [ref] [--pageSize N]      # List failed invoices
ksef session upo <sessionRef>                 # Download UPO (official receipt)
```

### UPO Download

Requires one of `--upoRef`, `--ksefNumber`, or `--invoiceRef` to identify the document:

```bash
ksef session upo <sessionRef> --ksefNumber <num> -o receipt.xml
```

If `-o` is omitted, output is printed to stdout.

## Invoices

### Send a Single Invoice

Requires an open online session:

```bash
ksef invoice send invoice.xml
```

### Send a Batch (Directory)

Automatically creates a temporary batch session, sends all `*.xml` files, and closes the session:

```bash
ksef invoice send ./invoices/
```

### Download and Query

```bash
ksef invoice get <ksefNumber> [-o file.xml]     # Download invoice XML
ksef invoice query --from 2025-01-01             # Query invoice metadata
ksef invoice export --from 2025-01-01            # Start async export
ksef invoice export-status <ref>                 # Check export status
```

### Query Filters

| Flag | Description |
|------|-------------|
| `--from <date>` | Start date (YYYY-MM-DD), **required** |
| `--to <date>` | End date |
| `--subjectType <type>` | Subject1, Subject2, Subject3, SubjectAuthorized |
| `--dateType <type>` | Issue, Invoicing (default), PermanentStorage |
| `--sellerNip <nip>` | Filter by seller NIP |
| `--buyerNip <nip>` | Filter by buyer NIP |
| `--amountFrom <n>` | Minimum amount |
| `--amountTo <n>` | Maximum amount |
| `--amountType <type>` | Brutto (default), Netto, Vat |
| `--currency <code>` | Currency code (PLN, EUR, etc.) |
| `--page <n>` | Page offset (0-based) |
| `--size <n>` | Page size |

## Permissions

### Grant Permissions

```bash
# Grant to a person
ksef permission grant person \
  --identifier <pesel> --identifierType Pesel \
  --permissions InvoiceRead,InvoiceWrite \
  --firstName Jan --lastName Kowalski \
  --description "Accountant access"

# Grant to an entity
ksef permission grant entity \
  --targetNip <nip> --permissions InvoiceRead \
  --fullName "Firma Sp. z o.o." \
  --description "Partner access"

# Grant authorization
ksef permission grant authorization \
  --targetNip <nip> --permissions InvoiceRead,InvoiceWrite \
  --fullName "Biuro Rachunkowe" \
  --description "Accounting office"
```

Supported grant types: `person`, `entity`, `authorization`, `indirect`, `subunit`, `eu-entity-admin`, `eu-entity-representative`. Each type requires specific flags — the CLI will report missing fields.

### Other Permission Commands

```bash
ksef permission revoke <grantId>                              # Revoke a grant
ksef permission revoke <grantId> --authorization              # Revoke an authorization grant
ksef permission search --type personal                        # Search own permissions
ksef permission search --type persons [--identifier <val>]    # Search person permissions
ksef permission search --type entities                        # Search entity permissions
ksef permission status <ref>                                  # Check operation status
```

Search types: `personal`, `persons`, `subunits`, `entities`, `entities-grants`, `subordinate-entities`, `authorizations`, `eu-entities`.

## Tokens

```bash
ksef token generate --permissions InvoiceRead,InvoiceWrite    # Generate a new token
ksef token generate --permissions InvoiceRead --description "Read-only" --validTo 2026-12-31

ksef token list [--status Active,Pending]                     # List tokens
ksef token get <ref>                                          # Get token details
ksef token revoke <ref>                                       # Revoke a token
```

::: warning
The token value is displayed only once during generation. It cannot be retrieved later.
:::

## Certificates

### Generate a Self-Signed Certificate

For testing — generates a certificate and private key locally:

```bash
ksef cert generate --type personal \
  --cn "Jan Kowalski" --given-name Jan --surname Kowalski \
  --serial-number PNOPL-12345678901 --out ./certs

ksef cert generate --type company-seal \
  --cn "Firma Seal" --org "Firma Sp. z o.o." \
  --org-identifier VATPL-1234567890 --method ECDSA --out ./certs
```

### Certificate Management (requires session)

```bash
ksef cert enroll --cert cert.pem --name "My Cert" --type Authentication
ksef cert status <ref>                           # Check enrollment status
ksef cert list [--type Authentication|Offline]   # List certificates
ksef cert revoke <serial> [--reason "text"]      # Revoke certificate
ksef cert limits                                 # Show enrollment limits
```

## QR Codes

### Generate Invoice QR Code

```bash
ksef qr invoice --nip 1234567890 --date 2025-06-15 --hash "abc...==" -o qr.png
ksef qr invoice --nip 1234567890 --date 2025-06-15 --hash "abc...==" --format svg -o qr.svg
ksef qr invoice --nip 1234567890 --date 2025-06-15 --hash "abc...==" --format svg --label "Invoice #1"
```

### Generate Certificate QR Code

```bash
ksef qr certificate \
  --context-type onip --context-id 1234567890 \
  --seller-nip 1234567890 --cert-serial ABC123 \
  --hash "abc...==" --key key.pem -o cert-qr.png
```

### Print Verification URL Only

```bash
ksef qr url --nip 1234567890 --date 2025-06-15 --hash "abc...=="
```

## Lighthouse (System Status)

No authentication required. Available only in `test` and `prod` environments (DEMO does not have a lighthouse endpoint). Defaults to `prod`.

```bash
ksef lighthouse status                           # Check prod (default)
ksef lighthouse status --env test                # Check test environment
ksef lighthouse messages                         # View system messages
```

## Test Data

Available only in `test` and `demo` environments. Most commands do not require authentication.

```bash
# Subjects and persons
ksef test-data create-subject --nip 1234567890
ksef test-data remove-subject --nip 1234567890
ksef test-data create-person --nip 1234567890 --pesel 12345678901 --first-name Jan --last-name Kowalski
ksef test-data remove-person --nip 1234567890 --pesel 12345678901

# Permissions (test-only bypass)
ksef test-data grant-permissions --nip 1234567890 --target-nip 9876543210
ksef test-data revoke-permissions --nip 1234567890 --target-nip 9876543210

# Attachments
ksef test-data enable-attachment --nip 1234567890
ksef test-data disable-attachment --nip 1234567890

# Limits (requires session)
ksef test-data change-session-limits --max-invoices 1000
ksef test-data restore-session-limits
ksef test-data change-cert-limits --enrollment-limit 10 --certificate-limit 20
ksef test-data restore-cert-limits

# Rate limits (requires session)
ksef test-data set-rate-limits --rate 100 --burst 200
ksef test-data restore-rate-limits
ksef test-data set-production-rate-limits --rate 50 --burst 100
ksef test-data restore-production-rate-limits

# Context blocking (requires session)
ksef test-data block-context --reason "maintenance"
ksef test-data unblock-context
```

## Doctor (Health Check)

Diagnose configuration and connectivity issues:

```bash
ksef doctor                                      # Run all checks
ksef doctor --json                               # Structured JSON output
ksef doctor --env prod                           # Check specific environment
```

Checks performed:
1. **Config** — `~/.ksef/config.json` exists and is valid
2. **Connectivity** — KSeF API reachable (lighthouse endpoint, 5s timeout)
3. **Session** — stored session exists and is not expired

## Shell Completion

Generate completion scripts for your shell:

```bash
# Bash
eval "$(ksef completion bash)"

# Zsh
eval "$(ksef completion zsh)"

# Fish
ksef completion fish | source
```

To persist, add the `eval` line to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.).

## Error Hints

The CLI provides contextual hints after common errors:

| Error | Hint |
|-------|------|
| HTTP 401/403 | Run `ksef auth login` to authenticate. |
| HTTP 404 | Check if the resource reference is correct. |
| Network error | Run `ksef doctor` to diagnose connectivity issues. |
| Rate limited | Retry after N seconds. |

## Storage

| File | Purpose |
|------|---------|
| `~/.ksef/config.json` | Environment, NIP, output format, timeout |
| `~/.ksef/session.json` | Access token, refresh token, session refs, expiry |

Both files are created automatically on first use.
