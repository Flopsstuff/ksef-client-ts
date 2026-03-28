## 1. Auth XML Builder

- [x] 1.1 Create `src/crypto/auth-xml-builder.ts` with `AuthTokenRequestXmlOptions` type and `buildUnsignedAuthTokenRequestXml()` function supporting all 4 context identifier types (Nip, InternalId, NipVatUe, PeppolId)
- [x] 1.2 Refactor `buildAuthTokenRequestXml()` in `src/client.ts` to delegate to `buildUnsignedAuthTokenRequestXml()` (backward-compatible wrapper)
- [x] 1.3 Write unit tests for `buildUnsignedAuthTokenRequestXml()`: all 4 context types, custom subjectIdentifierType, XML escaping, well-formedness, XML declaration presence

## 2. External Signing Workflow

- [x] 2.1 Add `ExternalSignatureAuthOptions` type to `src/workflows/auth-workflow.ts` with `contextIdentifier`, `signXml` callback, `verifyCertificateChain`, `enforceXadesCompliance`, and `pollOptions`
- [x] 2.2 Implement `authenticateWithExternalSignature()` workflow: challenge → build XML → signXml callback → submit → poll → redeem → set tokens on authManager
- [x] 2.3 Write unit tests for `authenticateWithExternalSignature()`: successful flow, async callback, callback error propagation, options forwarding

## 3. Public API Exports

- [x] 3.1 Export `buildUnsignedAuthTokenRequestXml` and `AuthTokenRequestXmlOptions` from `src/index.ts`
- [x] 3.2 Export `authenticateWithExternalSignature` and `ExternalSignatureAuthOptions` from `src/index.ts`
- [x] 3.3 Verify exports resolve correctly via `yarn build` and checking declaration output

## 4. CLI Command

- [x] 4.1 Add `ksef auth login-external` subcommand in `src/cli/commands/auth.ts` with `--generate` and `--submit` phases, `--nip`, `--env`, `--context-type`, `--output`, `--input` options
- [x] 4.2 Implement generate phase: get challenge, build unsigned XML, write to stdout or `--output` file, print metadata to stderr
- [x] 4.3 Implement submit phase: read signed XML from stdin or `--input` file, submit, poll, store credentials
- [x] 4.4 Write unit tests for CLI command: generate to stdout, generate to file, submit from file, non-Nip context type

## 5. Integration Verification

- [x] 5.1 Run full test suite (`yarn test`) to verify no regressions
- [x] 5.2 Verify `buildAuthTokenRequestXml()` backward compatibility — existing auth workflow tests still pass unchanged
