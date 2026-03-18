## 1. New CLI command: Active Sessions (in session.ts)

- [x] 1.1 Add `active` subcommand to `src/cli/commands/session.ts` — calls `ActiveSessionsService.getActiveSessions()`, displays table (Reference, Start Date, Auth Method, Status, Is Current), supports `--page-size` and pagination token
- [x] 1.2 Add `revoke` subcommand to `src/cli/commands/session.ts` — accepts positional `<ref>` or `--current` flag, calls `revokeSession(ref)` or `revokeCurrentSession()`, errors if neither provided
- [x] 1.3 Register `active` and `revoke` in the `sessionCommand` subCommands object

## 2. New CLI command: Limits

- [x] 2.1 Create `src/cli/commands/limits.ts` with `context` subcommand — calls `LimitsService.getContextLimits()`, displays online/batch limits as key-value pairs
- [x] 2.2 Add `subject` subcommand — calls `LimitsService.getSubjectLimits()`, displays enrollment/certificate limits (show "Unlimited" for null values)
- [x] 2.3 Add `rate` subcommand — calls `LimitsService.getRateLimits()`, displays table with columns: Category, Per Second, Per Minute, Per Hour
- [x] 2.4 Export `limitsCommand` and register in `src/cli/index.ts`

## 3. New CLI command: Peppol

- [x] 3.1 Create `src/cli/commands/peppol.ts` with `providers` subcommand — calls `PeppolService.queryProviders()`, displays table (Identifier, Name, Description, Created), supports `--page`/`--page-size`, shows "more results" message when `hasMore` is true
- [x] 3.2 Export `peppolCommand` and register in `src/cli/index.ts`

## 4. Additions to existing cert command

- [x] 4.1 Add `enrollment-data` subcommand to `src/cli/commands/cert.ts` — calls `CertificateApiService.getEnrollmentData()`, displays all non-null fields as key-value pairs
- [x] 4.2 Add `retrieve` subcommand to `src/cli/commands/cert.ts` — accepts `--serial` (comma-separated), calls `CertificateApiService.retrieve()`, displays table (Serial, Name, Type), errors if no serials provided
- [x] 4.3 Register `enrollment-data` and `retrieve` in the `certCommand` subCommands object

## 5. Addition to existing session command

- [x] 5.1 Add `invoice` subcommand (singular) to `src/cli/commands/session.ts` — accepts positional `<invoiceRef>` and optional `--ref <sessionRef>` (falls back to stored ref), calls `SessionStatusService.getSessionInvoice()`, displays key-value output
- [x] 5.2 Register `invoice` in the `sessionCommand` subCommands object

## 6. Addition to existing permission command

- [x] 6.1 Add `attachment-status` subcommand to `src/cli/commands/permission.ts` — calls `PermissionsService.getAttachmentStatus()`, displays "Attachments: Allowed" or "Attachments: Not Allowed"
- [x] 6.2 Register `attachment-status` in the `permissionCommand` subCommands object

## 7. Verification

- [x] 7.1 Run `yarn build` to verify compilation with no type errors
- [x] 7.2 Run `yarn test` to verify no regressions
- [x] 7.3 Verify `ksef --help` shows new `limits` and `peppol` commands
- [x] 7.4 Verify `ksef session --help` shows `active`, `revoke`, and `invoice` subcommands
- [x] 7.5 Verify `ksef cert --help` shows `enrollment-data` and `retrieve` subcommands
- [x] 7.6 Verify `ksef permission --help` shows `attachment-status` subcommand
