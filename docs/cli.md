# CLI Reference

The `ksef` CLI is a thin wrapper over the `ksef-client-ts` library. Each command maps directly to a client method and formats output for the terminal.

## Installation

```bash
npm install -g ksef-client-ts
```

Or with yarn:

```bash
yarn global add ksef-client-ts
```

## Quick Start

```bash
# 1. Run the interactive setup wizard
ksef setup

# 2. Open a session, send an invoice, close the session
ksef session open
ksef invoice send invoice.xml
ksef session close
```

The setup wizard guides you through environment selection, NIP configuration, and authentication. See [Setup Wizard](/setup-wizard) for details.

For manual configuration:

```bash
ksef config set --nip 1234567890 --env prod
ksef auth login --token "$KSEF_TOKEN"
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

Default values: `environment=prod`, `output=pretty`, `timeout=30000`.

## Authentication

Session data is stored in `~/.ksef/session.json`. Most commands require an active session.

### Token Authentication

```bash
ksef auth login --token <ksef-token> --nip <nip>
```

The login flow is fully automated: get challenge, encrypt token, submit auth request, redeem access token.

### Certificate Authentication (XAdES)

```bash
ksef auth login --cert cert.pem --key key.pem --nip <nip>
```

Signs an AuthTokenRequest XML with XAdES and submits. `--cert`, `--key`, and `--nip` are all required.

### Other Auth Commands

```bash
ksef auth challenge               # Request an authorization challenge
ksef auth status <ref>            # Check auth operation status
ksef auth refresh                 # Refresh access token (requires refreshToken)
ksef auth whoami                  # Show current session info (exit 1 if no session or expired)
ksef auth logout                  # Clear stored session
```

## Sessions

```bash
ksef session open                             # Open online session
ksef session close [ref]                      # Close session (current or by ref)
ksef session status [ref]                     # Check session status
ksef session list [--type online|batch]       # List sessions
ksef session invoices [ref] [--pageSize N]    # List session invoices
ksef session invoice <invoiceRef> [--ref R]   # Get single invoice status
ksef session failed [ref] [--pageSize N]      # List failed invoices
ksef session upo <sessionRef>                 # Download UPO (official receipt)
ksef session active [--pageSize N]            # List active authentication sessions
ksef session revoke <ref>                     # Revoke an active session by reference
ksef session revoke --current                 # Revoke the current active session
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
# Grant to a physical person (osoba fizyczna, identified by PESEL)
ksef permission grant --type person \
  --identifier <pesel> --identifierType Pesel \
  --permissions InvoiceRead,InvoiceWrite \
  --firstName Jan --lastName Kowalski \
  --description "Accountant access"

# Grant to a legal entity (podmiot, identified by NIP)
ksef permission grant --type entity \
  --targetNip <nip> --permissions InvoiceRead \
  --fullName "Firma Sp. z o.o." \
  --description "Partner access"

# Grant to an entity with delegation rights (zakres uprawnień)
ksef permission grant --type entity \
  --targetNip <nip> --permissions InvoiceRead,InvoiceWrite \
  --fullName "Biuro Rachunkowe Sp. z o.o." \
  --description "Accounting office" --canDelegate

# Grant authorization scope (upoważnienie — SelfInvoicing, TaxRepresentative, etc.)
ksef permission grant --type authorization \
  --targetNip <nip> --permissions SelfInvoicing \
  --fullName "Biuro Rachunkowe" \
  --description "Self-invoicing authorization"
```

Supported grant types: `person`, `entity`, `authorization`, `indirect`, `subunit`, `eu-entity-admin`, `eu-entity-representative`. Each type requires specific flags — the CLI will report missing fields.

Add `--canDelegate` to allow the subject to further delegate permissions to their own employees (corresponds to "Zakres uprawnień" in the KSeF web portal).

### Other Permission Commands

```bash
ksef permission revoke <grantId>                              # Revoke a grant
ksef permission revoke <grantId> --authorization              # Revoke an authorization grant
ksef permission search --type personal                        # Search own permissions
ksef permission search --type persons [--identifier <val>]    # Search granted permissions (persons AND entities)
ksef permission search --type entities                        # Search entity roles (CourtBailiff, etc.)
ksef permission status <ref>                                  # Check operation status
ksef permission attachment-status                              # Check if attachments are allowed
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
ksef cert enrollment-data                        # Get enrollment data template
ksef cert retrieve --serial <serial1>,<serial2>  # Retrieve certificates by serial numbers
```

## Limits

View effective KSeF API limits for the current context. Requires an active session.

```bash
ksef limits context                              # Context limits (invoice size, count per session type)
ksef limits subject                              # Subject limits (max enrollments, certificates)
ksef limits rate                                 # API rate limits (per-category table)
```

## Peppol

Query Peppol integration data.

```bash
ksef peppol providers [--page N] [--pageSize N]  # List Peppol providers
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

## Offline Invoices

Generate, store, and submit offline invoices. See [Offline Mode](/offline-mode) for details.

```bash
ksef offline generate invoice.xml --nip 1234567890       # Generate with KOD I
ksef offline generate invoice.xml --key key.pem \
  --cert-serial 01F20A --nip 1234567890                  # Generate with KOD I + KOD II
ksef offline list                                        # List stored invoices
ksef offline list --status GENERATED --expiring           # Filter by status/expiry
ksef offline status <id>                                 # Show invoice details
ksef offline submit --all                                # Submit all pending to KSeF
ksef offline submit id1,id2                              # Submit specific invoices
ksef offline correct <id> corrected.xml                  # Technical correction
ksef offline delete <id>                                 # Delete from store
ksef offline delete --expired                            # Delete all expired
```

All commands support `--store-dir` to override the default `~/.ksef/offline/` directory.

## Lighthouse (System Status)

No authentication required. Available only in `test` and `prod` environments (DEMO does not have a lighthouse endpoint). Defaults to `prod`.

```bash
ksef lighthouse status                           # Check prod (default)
ksef lighthouse status --env test                # Check test environment
ksef lighthouse messages                         # View system messages
```

## Test Data

Test environment data management. **Only available on `--env test`** — all commands refuse execution on demo and production environments. Most commands do not require authentication; limits and context commands require an active session.

### Subjects and persons

```bash
ksef test-data create-subject --nip 1234567890 --type EnforcementAuthority --description "Test subject"
ksef test-data remove-subject --nip 1234567890
ksef test-data create-person --nip 1234567890 --pesel 12345678901 --description "Test person"
ksef test-data create-person --nip 1234567890 --pesel 12345678901 --description "Test" --bailiff --deceased
ksef test-data remove-person --nip 1234567890
```

### Permissions (test-only bypass)

```bash
ksef test-data grant-permissions --context-nip 1234567890 --identifier 9876543210 \
  --identifier-type Nip --permissions "Read,Write"
ksef test-data revoke-permissions --context-nip 1234567890 --identifier 9876543210 \
  --identifier-type Nip
```

### Attachments

```bash
ksef test-data enable-attachment --nip 1234567890
ksef test-data disable-attachment --nip 1234567890 --end-date 2025-12-31
```

### Limits (requires session)

```bash
# Session limits (online and batch)
ksef test-data change-session-limits \
  --online-max-size 5 --online-max-attach-size 10 --online-max-invoices 100000 \
  --batch-max-size 5 --batch-max-attach-size 10 --batch-max-invoices 100000
ksef test-data restore-session-limits

# Certificate/enrollment limits
ksef test-data change-cert-limits --max-enrollments 10 --max-certificates 20
ksef test-data change-cert-limits --identifier-type Pesel --max-enrollments 5
ksef test-data restore-cert-limits
```

### Rate limits (requires session)

```bash
ksef test-data set-rate-limits --limits '{"category":"InvoiceSend","perSecond":10,"perMinute":100,"perHour":1000}'
ksef test-data restore-rate-limits
ksef test-data set-production-rate-limits
```

### Context blocking (requires session)

```bash
ksef test-data block-context --context-value 1234567890 --context-type Nip
ksef test-data unblock-context --context-value 1234567890 --context-type Nip
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

## Setup Wizard

Run `ksef setup` for an interactive guided setup — see [Setup Wizard](/setup-wizard) for details.

## Storage

| File | Purpose |
|------|---------|
| `~/.ksef/config.json` | Environment, NIP, output format, timeout |
| `~/.ksef/session.json` | Access token, refresh token, session refs, expiry |
| `~/.ksef/credentials.json` | Long-lived API token (created by setup wizard or manually) |

All files are created automatically on first use. Files containing secrets are written with mode `0600`.
