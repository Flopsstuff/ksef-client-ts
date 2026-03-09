## Why

CLI Phases 1-3 cover config, auth, sessions, invoices, permissions, and tokens. The remaining library services — certificates, QR codes, lighthouse, and test data — have no CLI wrappers yet. Adding them completes the CLI surface and makes the tool useful for certificate lifecycle management, invoice verification via QR, system health checks, and test environment setup — all without writing code.

## What Changes

- Add `ksef cert` command group: enroll certificates, check enrollment status, list/query certificates, revoke certificates, view certificate limits, generate self-signed test certs (wraps `CertificateApiService` + `CertificateService`)
- Add `ksef qr` command group: generate invoice verification QR codes (PNG/SVG/base64), generate certificate QR codes, print verification URLs (wraps `VerificationLinkService` + `QrCodeService`)
- Add `ksef lighthouse` command group: check KSeF system availability status, view system messages (wraps `LighthouseService`). No session required.
- Add `ksef test-data` command group: manage test subjects/persons, grant/revoke test permissions, adjust session/certificate/rate limits, block/unblock contexts (wraps `TestDataService`). Gated to test/demo environments only.
- Register all four command groups in `src/cli/index.ts`

## Capabilities

### New Capabilities
- `cli-cert`: CLI commands for certificate enrollment, status, listing, querying, revocation, limits, and local self-signed cert generation
- `cli-qr`: CLI commands for generating invoice/certificate QR codes (PNG/SVG/base64) and printing verification URLs
- `cli-lighthouse`: CLI commands for checking KSeF system status and viewing system messages (no auth required)
- `cli-test-data`: CLI commands for managing test environment data — subjects, persons, permissions, attachment permissions, session/certificate/rate limits, context blocking (gated to test/demo envs)

### Modified Capabilities
None. Existing CLI specs (cli-session, cli-invoice, cli-permission, cli-token) are not affected.

## Impact

- **New files**: `src/cli/commands/cert.ts`, `src/cli/commands/qr.ts`, `src/cli/commands/lighthouse.ts`, `src/cli/commands/test-data.ts`
- **Modified files**: `src/cli/index.ts` (register 4 new command groups)
- **Library services used**: `CertificateApiService`, `CertificateService` (crypto, static), `VerificationLinkService`, `QrCodeService` (static), `LighthouseService`, `TestDataService`
- **No new dependencies**: all library services and their deps (`qrcode`, `@peculiar/x509`, etc.) already exist
- **Environment gating**: `test-data` commands must refuse to run when `env=prod`
