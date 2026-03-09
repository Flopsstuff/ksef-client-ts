## Context

CLI Phases 1-3 established the patterns: each command file exports a top-level `defineCommand` with `subCommands`, uses `withErrorHandler`, `requireSession`/`createClient` from `client-factory.ts`, and formats output via `output.ts` helpers (`outputTable`, `outputKeyValue`, `outputResult`, `outputSuccess`, `outputWarning`). Global options (`--env`, `--json`, `--timeout`, `--nip`) are repeated per subcommand via `getGlobalOpts()`.

All library services for Phase 4 are already implemented:
- `CertificateApiService` (API CRUD) + `CertificateService` (static, self-signed gen) + `CryptographyService` (CSR gen)
- `VerificationLinkService` (invoice/cert URLs) + `QrCodeService` (static, PNG/SVG/base64)
- `LighthouseService` (raw fetch, no auth)
- `TestDataService` (17 methods, no auth for subject/person ops, auth for limits/context ops)

## Goals / Non-Goals

**Goals:**
- Wrap all remaining library services as CLI commands following established patterns
- `ksef cert` — full certificate lifecycle (generate local cert, enroll via API, check status, list, revoke, view limits)
- `ksef qr` — generate QR codes and print verification URLs for invoices and certificates
- `ksef lighthouse` — check system status and messages without authentication
- `ksef test-data` — manage test environment state, gated to non-production environments
- All commands support `--json` for machine-readable output

**Non-Goals:**
- Interactive prompts or wizards (cert generation collects params via flags only)
- QR code display in terminal (output is file-based or base64 string)
- Polling/waiting for enrollment status completion (user calls `cert status` manually)
- Tab completion or man pages (Phase 5)

## Decisions

### D1: Certificate generation flow — two-step local+remote

`ksef cert generate` creates a self-signed certificate + private key locally (via `CertificateService.generateSelfSignedCertificate`). `ksef cert enroll` submits a CSR to KSeF API (requires generating CSR via `CryptographyService.generateCsr` then calling `CertificateApiService.enroll`). These are separate commands because the user may want to generate certs without enrolling, or enroll an externally-created CSR.

**Alternative**: Single `cert create` command that generates + enrolls. Rejected because it couples local and remote operations, and some users bring their own certs/CSRs.

### D2: QR output defaults to file, with stdout fallback

`ksef qr invoice` and `ksef qr certificate` default to writing PNG to a file (`-o <path>`). If no `-o` is given, output base64-encoded PNG to stdout (useful for piping). `--format svg` switches to SVG output. `ksef qr url` only prints the URL string (no image).

**Alternative**: Always output to stdout as base64. Rejected because file output is the common case for QR codes, and binary PNG to stdout is not useful.

### D3: Lighthouse commands skip authentication

`LighthouseService` uses raw `fetch()` against the lighthouse URL (no RestClient, no access token). CLI commands `ksef lighthouse status` and `ksef lighthouse messages` use `createClient` only to resolve the environment URL — they do NOT call `requireSession`. This means they work without logging in.

### D4: Test-data environment gating — fail fast on prod

`ksef test-data` commands check the resolved environment before executing. If `env === 'prod'`, throw an error immediately: "Test data commands are only available in test/demo environments." This is a CLI-level guard — the API would also reject it, but failing early gives a better UX.

### D5: Test-data command structure — flat subcommands

The `TestDataService` has 17 methods across 7 categories (subjects, persons, permissions, attachments, session-limits, cert-limits, rate-limits, context). Rather than nested sub-sub-commands (`test-data subject create`), use flat compound names: `test-data create-subject`, `test-data remove-subject`, etc. This avoids citty's nested subcommand complexity and keeps `--help` output scannable.

**Alternative**: Nested groups (`test-data subject [create|remove]`). Rejected because citty doesn't support 3-level nesting cleanly, and these commands are rarely used (test env setup only).

### D6: Cert generate writes files to --out directory

`ksef cert generate` writes `cert.pem` and `key.pem` to the directory specified by `--out` (defaults to current directory). It also prints the SHA-256 fingerprint. The `--type` flag selects personal vs company-seal certificate. `--cn`, `--org`, `--country` etc. set X.500 subject fields.

### D7: QR certificate command requires private key file

`ksef qr certificate` needs the private key for signing. It reads from `--key <path>` (PEM file). This follows the same pattern as `ksef auth login --key`.

## Risks / Trade-offs

- **Test-data surface area**: 17 service methods = 17 subcommands. This is large but acceptable since test-data is a power-user feature. The flat naming keeps it manageable.
  → Mitigation: Good `--help` descriptions. Group related commands visually in help output.

- **CSR generation requires crypto init**: `CryptographyService.generateCsr()` needs `await client.crypto.init()` first (fetches KSeF public certs). The CLI must call this before enrollment.
  → Mitigation: `ksef cert enroll` calls `client.crypto.init()` internally before generating CSR.

- **File I/O in QR and cert commands**: Writing files introduces failure modes (permissions, existing files).
  → Mitigation: Use `fs.writeFile` with clear error messages. Don't overwrite without `--force`.
