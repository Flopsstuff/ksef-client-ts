## Why

Currently `KSeFClient` only supports XAdES authentication with internally-managed private keys (PEM/PKCS#12 loaded into memory). Enterprise environments commonly use HSMs, qualified signature providers (EPUAP), or smart cards where private keys are non-extractable. These users cannot authenticate via XAdES at all today. All four reference implementations (lkow, smekcio, C#, Java) already expose unsigned XML export for external signing.

## What Changes

- Export a public `buildUnsignedAuthTokenRequestXml()` function that generates the auth request XML without signing it, supporting all four KSeF context identifier types (Nip, InternalId, NipVatUe, PeppolId)
- Enhance the existing `buildAuthTokenRequestXml()` to accept all context types (currently hardcoded to Nip only)
- Add an `authenticateWithExternalSignature()` workflow that orchestrates the external signing flow: challenge → unsigned XML → (user signs) → submit → poll → redeem
- Add CLI command `ksef auth login-external` for the external signing flow
- No breaking changes: existing `submitXadesAuthRequest()` already accepts pre-signed XML, existing `SignatureService.sign()` remains unchanged

## Capabilities

### New Capabilities

- `external-signing`: Public API for building unsigned XAdES auth request XML and orchestrating the external signing authentication flow (challenge → build XML → user signs externally → submit → poll → redeem)

### Modified Capabilities

_(none — existing auth service already accepts pre-signed XML via `submitXadesAuthRequest()`, no spec-level behavior changes needed)_

## Impact

- **Code**: `src/crypto/signature-service.ts` (export builder), `src/workflows/auth-workflow.ts` (new workflow), `src/cli/commands/auth.ts` (new subcommand), `src/models/auth/types.ts` (context identifier types)
- **Public API**: New exported function `buildUnsignedAuthTokenRequestXml()`, new workflow `authenticateWithExternalSignature()`
- **Dependencies**: None (uses existing `fast-xml-parser`, `xml-crypto`)
- **Breaking changes**: None
