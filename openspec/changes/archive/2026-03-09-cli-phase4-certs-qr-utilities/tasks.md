## 1. Certificate commands (`src/cli/commands/cert.ts`)

- [x] 1.1 Create `cert.ts` with `getGlobalOpts` helper and global args pattern
- [x] 1.2 Implement `generate` subcommand — self-signed cert via `CertificateService.generateSelfSignedCertificate`, write `cert.pem`/`key.pem` to `--out` dir, display fingerprint, handle `--force` overwrite check
- [x] 1.3 Implement `enroll` subcommand — read PEM from `--cert`, call `client.crypto.init()`, then `CertificateApiService.enroll`, display reference number
- [x] 1.4 Implement `status` subcommand — `CertificateApiService.getEnrollmentStatus` by ref, display key-value output
- [x] 1.5 Implement `list` subcommand — `CertificateApiService.query` with filters (`--serial`, `--name`, `--type`, `--status`, `--expires-after`), pagination, table output
- [x] 1.6 Implement `revoke` subcommand — `CertificateApiService.revoke` by serial with optional `--reason`
- [x] 1.7 Implement `limits` subcommand — `CertificateApiService.getLimits`, display key-value output
- [x] 1.8 Export `certCommand` with all subcommands

## 2. QR commands (`src/cli/commands/qr.ts`)

- [x] 2.1 Create `qr.ts` with `getGlobalOpts` helper
- [x] 2.2 Implement `invoice` subcommand — build URL via `VerificationLinkService.buildInvoiceVerificationUrl`, generate QR via `QrCodeService` (PNG default, SVG with `--format svg`, label with `--label`), write to `-o` or base64 to stdout
- [x] 2.3 Implement `certificate` subcommand — read private key from `--key`, build signed URL via `VerificationLinkService.buildCertificateVerificationUrl`, generate QR, write to file or stdout
- [x] 2.4 Implement `url` subcommand — build and print invoice verification URL only
- [x] 2.5 Export `qrCommand` with all subcommands

## 3. Lighthouse commands (`src/cli/commands/lighthouse.ts`)

- [x] 3.1 Create `lighthouse.ts` — use `createClient` (no `requireSession`) to get `LighthouseService`
- [x] 3.2 Implement `status` subcommand — `LighthouseService.getStatus`, display key-value output
- [x] 3.3 Implement `messages` subcommand — `LighthouseService.getMessages`, table output, handle empty with warning
- [x] 3.4 Export `lighthouseCommand` with all subcommands

## 4. Test-data commands (`src/cli/commands/test-data.ts`)

- [x] 4.1 Create `test-data.ts` with environment gating helper that throws on `prod`
- [x] 4.2 Implement `create-subject` and `remove-subject` subcommands (no auth required)
- [x] 4.3 Implement `create-person` and `remove-person` subcommands (no auth required)
- [x] 4.4 Implement `grant-permissions` and `revoke-permissions` subcommands (no auth required)
- [x] 4.5 Implement `enable-attachment` and `disable-attachment` subcommands (no auth required)
- [x] 4.6 Implement `change-session-limits` and `restore-session-limits` subcommands (require session)
- [x] 4.7 Implement `change-cert-limits` and `restore-cert-limits` subcommands (require session)
- [x] 4.8 Implement `set-rate-limits` and `restore-rate-limits` subcommands (require session)
- [x] 4.9 Implement `set-production-rate-limits` and `restore-production-rate-limits` subcommands (require session)
- [x] 4.10 Implement `block-context` and `unblock-context` subcommands (require session)
- [x] 4.11 Export `testDataCommand` with all 18 subcommands

## 5. Registration and integration

- [x] 5.1 Register `certCommand`, `qrCommand`, `lighthouseCommand`, `testDataCommand` in `src/cli/index.ts`
- [x] 5.2 Verify `ksef --help` lists all new command groups
- [x] 5.3 Verify `ksef cert --help`, `ksef qr --help`, `ksef lighthouse --help`, `ksef test-data --help` list their subcommands

## 6. Build and lint

- [x] 6.1 Run `yarn build` — verify no compilation errors
- [x] 6.2 Run `yarn lint` — verify no type errors
