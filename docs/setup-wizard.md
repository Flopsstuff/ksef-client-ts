# Setup Wizard

The `ksef setup` command is an interactive wizard that guides you through configuring and authenticating the KSeF CLI in a single session.

## Quick Start

```bash
ksef setup
```

Or specify the environment explicitly:

```bash
ksef setup --env test
```

## What It Does

The wizard runs two phases:

1. **Configuration & Authentication** — saves your NIP and environment, then authenticates with KSeF
2. **Token Generation** (optional) — creates a long-lived API token for future use

After completion, you have a fully configured CLI ready to send invoices and manage permissions.

## Requirements

- Interactive terminal (TTY) — the wizard uses prompts and cannot run in CI/CD pipelines
- For non-interactive environments, use `ksef auth login-external` and `ksef token generate` directly

## Phase 1: Configuration & Authentication

### NIP and Environment

The wizard prompts for your NIP (10-digit Polish tax identification number) and validates it using the NIP checksum algorithm.

The environment is resolved in this order:

1. `--env` argument (if provided)
2. Current value from `~/.ksef/config.json`
3. Default: `prod`

Config is saved to `~/.ksef/config.json` immediately, before authentication starts — so even if auth fails, your NIP and environment are persisted.

### Authentication: Test Environment

When running against the **test** environment, the wizard offers a quick authentication path using a self-signed certificate:

```
? Test environment detected. Use self-signed certificate for quick auth? (Y/n)
```

If you accept, the wizard generates a self-signed company seal certificate on the fly and authenticates via XAdES — no external signing steps needed. This works because the KSeF test environment does not verify the certificate chain.

::: warning
Self-signed certificate auth is only available for the **test** environment. The demo and production environments require a valid qualified signature.
:::

### Authentication: Demo & Production

For demo and production environments (or if you decline self-signed auth on test), the wizard uses the **external signature flow**:

1. Requests an authorization challenge from KSeF
2. Builds an unsigned `AuthTokenRequest` XML and saves it to `~/.ksef/auth.xml`
3. Opens the `~/.ksef/` folder in your file manager
4. Displays signing instructions:

```
┌─────────────────────────────────────────────────────────┐
│ Sign the XML file using a qualified signature:          │
│                                                         │
│   1. Open: https://podpis.gov.pl/podpisz-dokument-...  │
│   2. Upload: ~/.ksef/auth.xml                           │
│   3. Sign with your qualified signature                 │
│   4. Download the signed XML file                       │
└─────────────────────────────────────────────────────────┘
```

1. Prompts for the path to the signed XML file
2. Submits the signed XML to KSeF and completes authentication

If authentication fails (e.g., expired challenge or invalid signature), the wizard offers to retry with a fresh challenge.

::: tip
The challenge expires after **10 minutes**. Sign and provide the signed file promptly.
:::

## Phase 2: Token Generation

After successful authentication, the wizard asks whether to generate a long-lived API token:

```
? Generate a long-lived API token? (Y/n)
```

If you accept:

1. **Select permissions** — multiselect from available token permission types:
   - `InvoiceRead` — Read invoices
   - `InvoiceWrite` — Send invoices
   - `CredentialsRead` — View permissions
   - `CredentialsManage` — Manage permissions
   - `EnforcementOperations` — Enforcement actions
   - `SubunitManage` — Manage subunits
   - `Introspection` — Self-invoicing introspection

2. **Enter a description** — free-text label for the token (default: "CLI setup token")

3. The wizard generates the token, saves it to `~/.ksef/credentials.json`, and re-authenticates using the new token so your session is immediately backed by it.

::: warning
The token value is stored locally in `~/.ksef/credentials.json`. It is displayed only during generation and cannot be retrieved from KSeF later. Keep it safe.
:::

If you skip token generation, your session remains active from Phase 1 authentication. You can always generate a token later with `ksef token generate`.

## Completion Summary

At the end, the wizard displays a summary:

```
┌──────────────────────────────────────────────────┐
│ Setup complete!                                  │
│                                                  │
│   Environment: test                              │
│   NIP: 1234567890                                │
│   Session: active                                │
│   Token: saved                                   │
│                                                  │
│ Quick start:                                     │
│   ksef invoice send <file>  — Send an invoice    │
│   ksef session open         — Open a session     │
│   ksef auth whoami          — Check session       │
└──────────────────────────────────────────────────┘
```

## Existing Sessions

If an existing session or saved token is detected, the wizard asks for confirmation before overwriting:

```
? An existing session or token was found. Overwrite? (y/N)
```

Declining cancels the wizard without modifying any stored data.

## Storage

The wizard creates or updates these files in `~/.ksef/`:

| File | Purpose | Created by |
|------|---------|------------|
| `config.json` | NIP, environment, output format | Phase 1 (config) |
| `session.json` | Access token, refresh token, expiry | Phase 1 (auth) |
| `credentials.json` | Long-lived API token | Phase 2 (if generated) |
| `auth.xml` | Unsigned XML for external signing | Phase 1 (external auth only) |

All files containing secrets (`session.json`, `credentials.json`) are written with mode `0600` (owner-only read/write).

## Non-Interactive Alternative

For CI/CD or scripting, use the individual commands instead:

```bash
# Configure
ksef config set --nip 1234567890 --env prod

# Authenticate (token-based)
ksef auth login --token "$KSEF_TOKEN"

# Or authenticate (external signing, two steps)
ksef auth login-external --generate --nip 1234567890 --output unsigned.xml
# ... sign externally ...
ksef auth login-external --submit --input signed.xml --nip 1234567890

# Generate token (optional)
ksef token generate --permissions InvoiceRead,InvoiceWrite
```
