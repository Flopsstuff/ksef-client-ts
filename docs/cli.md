# CLI Reference

The `ksef` CLI is a thin wrapper over the `ksef-client-ts` library. Each command maps directly to a client method and formats output for the terminal.

## Installation

```bash
# Global install
npm install -g ksef-client-ts

# Or link locally during development
yarn build && yarn link
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

## Storage

| File | Purpose |
|------|---------|
| `~/.ksef/config.json` | Environment, NIP, output format, timeout |
| `~/.ksef/session.json` | Access token, refresh token, session refs, expiry |

Both files are created automatically on first use.
