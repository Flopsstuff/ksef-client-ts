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

On success, `ksef auth login` prints the client IP KSeF observed during the challenge (as `Seen client IP: <ip>`). With `--json`, the IP is emitted under `clientIp` in the JSON payload. Use this value when configuring `AuthorizationPolicy.allowedIps` on subsequent requests.

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
ksef auth revoke-self-token       # Revoke the token used for the current login (then clear local state)
```

### Self-Revoke Token

```bash
ksef auth revoke-self-token [--keep-local] [--dry-run] [--json]
```

One-shot command for CI jobs and disposable hosts: after `ksef auth login --token $T`, `ksef auth revoke-self-token` revokes `$T` on the server and clears the local session and credentials. Reference-number lookup is automatic — cached during login when possible, otherwise discovered via the active-token list filtered by the caller's context (requires exactly one active match; ambiguous cases are refused).

- `--keep-local` — revoke server-side but keep local session (test scenarios).
- `--dry-run` — print the resolved reference and planned actions without revoking the token.
- `--json` — emit a structured status payload. On revoke: `{ status: 'revoked' | 'already-revoked', referenceNumber, source, localCleared }`. On dry-run: `{ status: 'dry-run', referenceNumber, source, wouldClearLocal }`. The `source` field is `'discovery'` when resolved from the live session token, `'cache-fallback'` when discovery failed and the locally cached reference was used instead, or `'none'` when neither yielded a value.
- An already-revoked token (server returns 404/409/410) produces a warning and still clears local state, so repeated calls are safe.

## Sessions

```bash
ksef session open                             # Open online session
ksef session close [ref]                      # Close session (current or by ref)
ksef session status [ref]                     # Check session status
ksef session list [--type online|batch]       # List sessions (tabular view shows Reference, Status, Created, Updated, Total, Success, Failed)
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

### Build XML from JSON or YAML

Wraps the programmatic `serializeInvoiceXml` pipeline for shell-driven workflows. Reads structured input, produces XML on stdout (or a file), and can optionally validate the output.

```bash
# JSON file → XML on stdout
ksef invoice build invoice.json -o faktura.xml

# Pipe from a transformer and on to send
jq -f transform.jq erp.json | ksef invoice build - --schema FA3 | ksef invoice send -

# YAML input with both validators
ksef invoice build invoice.yaml --validate --validate-xsd -o out.xml

# Dry-run: parse + summarise, no XML emitted
ksef invoice build invoice.json --dry-run --json

# Starter skeletons (fillable, pass --validate and --validate-xsd as-is)
ksef invoice build --template FA3 > skeleton.json
ksef invoice build --template PEF_KOR > credit-skeleton.json
```

| Flag | Description |
|------|-------------|
| `<input>` | Positional. Input file path or `-` for stdin. Required unless `--template` is passed. |
| `--schema <FA2\|FA3\|PEF\|PEF_KOR>` | Explicit target schema. When omitted, inferred from input (`Invoice` → PEF, `CreditNote` → PEF_KOR, `Naglowek.KodFormularza.systemCode` → FA2/FA3, default FA3). |
| `-o, --output <file>` | Write XML to a file. Omit or pass `-` for stdout. |
| `--pretty` | Pretty-print XML with 2-space indentation. |
| `--format <json\|yaml>` | Override input format. Default: infer from file extension (`.yml` / `.yaml` → YAML, else JSON). |
| `--validate` | Run the Zod invoice validator against the serialized XML; fail on structural errors. |
| `--validate-xsd` | Run XSD validation against the official KSeF schemas. Requires the optional `libxmljs2` peer dependency. |
| `--dry-run` | Parse input, infer schema, print a summary (schema + invoice number + sections + line count). Does not emit XML. |
| `--template <FA2\|FA3\|PEF\|PEF_KOR>` | Print a minimal fillable JSON skeleton and exit. |
| `--json` | Machine-readable output for `--dry-run` and for errors. |

**Exit codes** — unlike other CLI commands, `invoice build` uses a granular matrix for shell scripting:

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Unknown / fallback error |
| `2` | Input parse error (malformed JSON or YAML) |
| `3` | Structural (shape) validation error |
| `4` | XSD validation error (only with `--validate-xsd`, including missing `libxmljs2`) |
| `5` | IO error (filesystem / fd-limit failures: `ENOENT`, `EACCES`, `EPERM`, `EISDIR`, `ENOTDIR`, `ENOSPC`, `EROFS`, `EMFILE`, `ENFILE`, `EIO`, `EDQUOT`, `EBADF`, `EEXIST`, `ENAMETOOLONG`, `ELOOP`, `ETXTBSY`) |

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
| `--amountFrom <n>` | Minimum amount (negative values allowed) |
| `--amountTo <n>` | Maximum amount (negative values allowed) |
| `--amountType <type>` | Brutto (default), Netto, Vat |
| `--currency <code>` | Currency code (PLN, EUR, etc.) |
| `--page <n>` | Page offset (0-based) |
| `--size <n>` | Page size |

### Render a PDF

Turns an invoice or a UPO receipt into a print-ready PDF, entirely offline — nothing here calls KSeF. The document kind is detected from the file, so a receipt does not need `--upo`.

```bash
ksef invoice pdf faktura.xml                                  # → faktura.pdf, Polish labels
ksef invoice pdf faktura.xml --locale en+pl --out invoice.pdf # bilingual, explicit output path
ksef invoice pdf faktura.xml --qr --ksef-number <ksefNumber>  # with the KSeF Code I verification QR
ksef invoice pdf upo.xml --out upo.pdf                        # a receipt, detected as such
```

Rendering needs the optional `pdfmake` peer (`npm i "pdfmake@^0.2.20"`); without it the command exits with an install hint instead of writing a file.

| Flag | Description |
|------|-------------|
| `--template <name>` | Built-in template: `fa2-default`, `fa3-default`, `fa3-showcase`, `upo-4_2`, `upo-4_3`. Default: matched to the document's schema version |
| `--template-file <path>` | A custom JSON template instead of a built-in. Mutually exclusive with `--template` |
| `--locale <locale>` | `pl` (default), `en`, `uk`, or any two joined by `+` (`pl+uk`, `en+pl`) for side-by-side labels |
| `--out <path>` | Output path. Default: alongside the source, with `.pdf` |
| `--totals <mode>` | Tax breakdown above the amount due: `none`, `buckets` (as recorded, default), `summary` (computed), `both` |
| `--qr` | Embed the KSeF Code I QR, derived from the document |
| `--qr-url <url>` | Use this Code I URL verbatim instead of deriving one |
| `--qr-cert-url <url>` | Code II (offline certificate) URL — build it with `ksef qr certificate` |
| `--qr-links` | Print a clickable link under each QR code |
| `--ksef-number <nr>` | KSeF number to print. Without it the page is marked OFFLINE |
| `--env <env>` | Environment the QR verification host comes from: `test`, `demo`, `prod` |
| `--logo <path>` | Logo image for the header (PNG or JPEG — pdfmake draws no other format) |
| `--accent <hex>` | Accent colour for the title and headings (`#5AB595` or `#b04`) |
| `--notes <path>` | JSON file of extra sections: `[{ "head": "…", "body": "…" }, …]`; either half may be omitted |
| `--upo` | Treat the input as a UPO receipt instead of auto-detecting |
| `--json` | Report the result as JSON |

See [PDF Export](./pdf-export.md) for the template DSL, the built-in layouts, and the library API behind this command.

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

For `--type personal` and `--type entities-grants`, results can be filtered by a context identifier (NIP or a VAT-group subunit `InternalId`, 10-16 characters — typically 16):

```bash
ksef permission search --type entities-grants --context-type InternalId --context-value 7762811692-12345
ksef permission search --type personal        --context-type Nip        --context-value 1234567890
```

`InternalId` values must be 10-16 characters; invalid lengths fail client-side before the request is sent.

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

## Collective Identifiers

Group invoices issued by one seller under a single settlement reference. Requires an active session and one of the `InvoiceRead`, `InvoiceWrite`, or `CollectiveIdentifierManage` permissions. See [Collective Identifiers](/collective-identifiers).

```bash
ksef collective-identifier generate --ksef "<num1>,<num2>"      # Generate from KSeF numbers (2-500 by default)
ksef collective-identifier generate --file invoices.json        # Generate with per-invoice payment/description
ksef collective-identifier list --from 2026-07-01 [--to ...]    # List identifiers in the context
ksef collective-identifier by-ksef <ksefNumber>                 # Identifiers a given invoice belongs to
ksef collective-identifier invoices <numbers>                   # Invoices inside identifiers (comma-separated, max 10)
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
  --batch-max-size 5 --batch-max-attach-size 10 --batch-max-invoices 100000 \
  --collective-max-invoices 5000
ksef test-data restore-session-limits

# Certificate/enrollment limits
ksef test-data change-cert-limits --max-enrollments 10 --max-certificates 20
ksef test-data change-cert-limits --identifier-type Pesel --max-enrollments 5
ksef test-data restore-cert-limits

# Update certificate expiry (requires session)
ksef test-data update-certificate --serial 0123456789ABCDEF --valid-to 2026-12-31T23:59:59Z
```

### Rate limits (requires session)

Every category is required, and each takes `perSecond`, `perMinute`, and `perHour`. KSeF rejects the request if any category is missing. It also range-checks each category separately: `collectiveIdentifier` is capped at 10 per second, 60 per minute, and 120 per hour, well below the other categories.

```bash
ksef test-data set-rate-limits --limits '{
  "onlineSession": {"perSecond": 10, "perMinute": 60, "perHour": 200},
  "batchSession": {"perSecond": 10, "perMinute": 60, "perHour": 200},
  "invoiceSend": {"perSecond": 10, "perMinute": 60, "perHour": 200},
  "invoiceStatus": {"perSecond": 10, "perMinute": 60, "perHour": 200},
  "sessionList": {"perSecond": 10, "perMinute": 60, "perHour": 200},
  "sessionInvoiceList": {"perSecond": 10, "perMinute": 60, "perHour": 200},
  "sessionMisc": {"perSecond": 10, "perMinute": 60, "perHour": 200},
  "invoiceMetadata": {"perSecond": 10, "perMinute": 60, "perHour": 200},
  "invoiceExport": {"perSecond": 10, "perMinute": 60, "perHour": 200},
  "invoiceExportStatus": {"perSecond": 10, "perMinute": 60, "perHour": 200},
  "invoiceDownload": {"perSecond": 10, "perMinute": 60, "perHour": 200},
  "collectiveIdentifier": {"perSecond": 10, "perMinute": 60, "perHour": 120},
  "other": {"perSecond": 10, "perMinute": 60, "perHour": 200}
}'
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
| HTTP 400 | Review the error list above; fix the flagged fields and retry. |
| HTTP 401 | Your session may have expired. Run `ksef auth login` to re-authenticate. |
| HTTP 403 | Check your permissions for this operation. |
| HTTP 404 | Check if the resource reference is correct. |
| HTTP 410 | The operation has aged out. Re-submit the request if still relevant. |
| Rate limited | Retry after N seconds. |
| Network error | Run `ksef doctor` to diagnose connectivity issues. |

## Reading CLI Errors

Every server-returned failure is rendered with its full RFC 7807 Problem Details context so you can act on issues without re-running in verbose mode:

```text
✖ KSeF API error (HTTP 400): Invalid query payload
  └ Detail: Invalid query payload
  └ Errors:
    • [21105] Invoice number must not be empty
    • [21106] Buyer NIP has invalid checksum
      └ "NIP 1234567890"
  └ Trace ID: 68f4fa84-5a3d-4a9f-9f0e-a0c1234567ab
  └ Timestamp: 2026-04-18T14:22:11.457Z
ℹ Hint: Review the error list above; fix the flagged fields and retry.
```

| Field | What it tells you |
|-------|-------------------|
| `Detail` | Server-provided explanation of the failure |
| `Reason` (403 only) | Why access was denied (`missing-permissions`, `ip-not-allowed`, etc.) |
| `Required (any of)` / `Present` (403 only) | Which permissions are needed vs. which the current principal holds |
| `Errors` (400 only) | Structured per-field validation failures with their codes |
| `Trace ID` | Server-side correlation ID — quote this when filing support tickets |
| `Instance` | Request path that produced the error |
| `Timestamp` | Server time when the error occurred |

Passing `--json` on any command emits a machine-readable error payload on stdout instead of the pretty-printed form:

```json
{
  "error": {
    "name": "KSeFBadRequestError",
    "statusCode": 400,
    "message": "Invalid query payload",
    "detail": "Invalid query payload",
    "errors": [
      { "code": 21105, "description": "Invoice number must not be empty", "details": [] }
    ],
    "traceId": "68f4fa84-5a3d-4a9f-9f0e-a0c1234567ab",
    "timestamp": "2026-04-18T14:22:11.457Z"
  }
}
```

## Setup Wizard

Run `ksef setup` for an interactive guided setup — see [Setup Wizard](/setup-wizard) for details.

## Storage

| File | Purpose |
|------|---------|
| `~/.ksef/config.json` | Environment, NIP, output format, timeout |
| `~/.ksef/session.json` | Access token, refresh token, session refs, expiry |
| `~/.ksef/credentials.json` | Long-lived API token (created by setup wizard or manually) |

All files are created automatically on first use. Files containing secrets are written with mode `0600`.
