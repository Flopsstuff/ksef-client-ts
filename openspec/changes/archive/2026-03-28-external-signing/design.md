## Context

KSeF XAdES authentication requires submitting a signed XML document. Today our `buildAuthTokenRequestXml()` is tightly coupled with internal signing — it lives in `client.ts`, only supports `Nip` context identifiers, and is not designed for public consumption. The signing and submission are bundled in `authenticateWithCertificate()`.

The good news: most plumbing already exists. `AuthService.submitXadesAuthRequest()` accepts any pre-signed XML. `ContextIdentifier` with all 4 types (`Nip`, `InternalId`, `NipVatUe`, `PeppolId`) is already defined in `src/models/common.ts`. We just need to expose the unsigned XML builder and add a workflow for the external signing flow.

## Goals / Non-Goals

**Goals:**

- Expose a public, well-typed function to build unsigned KSeF auth request XML with all context identifier types
- Provide an `authenticateWithExternalSignature()` workflow that handles challenge → poll → redeem, leaving only the signing step to the caller
- Add CLI `ksef auth login-external` that writes unsigned XML to stdout/file for piping to external signing tools
- Keep full backward compatibility with existing `buildAuthTokenRequestXml()` callers

**Non-Goals:**

- Integrating with specific HSM/EPUAP/smart card SDKs — the user handles signing
- Enveloping signature mode (only enveloped is used by KSeF)
- `AuthorizationPolicy` support in the XML builder (not present in reference impls for XAdES flow, only for token auth)
- Modifying `SignatureService` — it already works standalone for users who want to sign in-process

## Decisions

### D1: Extract XML builder to `src/crypto/auth-xml-builder.ts`

Move `buildAuthTokenRequestXml()` out of `client.ts` into its own module under `src/crypto/`. The function generates XML related to authentication cryptography — it belongs with the crypto layer, not the client facade.

**Alternative considered:** `src/xml/auth-request.ts` — rejected because we'd create a new `src/xml/` directory for a single file. The `src/crypto/` directory already contains signature-related code. UPO parsing lives in `src/xml/` but that's a separate parsing concern.

**Alternative considered:** Keep in `client.ts` and just export — rejected because `client.ts` should remain the facade. The builder is a utility, not a client concern.

### D2: New `buildUnsignedAuthTokenRequestXml()` with full context identifier support

```typescript
export interface AuthTokenRequestXmlOptions {
  challenge: string;
  contextIdentifier: ContextIdentifier;  // reuse existing type
  subjectIdentifierType?: XadesSubjectIdentifierType;  // defaults to 'certificateSubject'
}

export function buildUnsignedAuthTokenRequestXml(options: AuthTokenRequestXmlOptions): string;
```

The XML builder maps `ContextIdentifier.type` to the XML element name (`<Nip>`, `<InternalId>`, `<NipVatUe>`, `<PeppolId>`), matching the KSeF auth token XML schema.

**Alternative considered:** Separate parameters (challenge, nip, type) like the current function — rejected because the options object is more extensible and matches `ContextIdentifier` from `common.ts`.

### D3: Keep old `buildAuthTokenRequestXml()` as a thin wrapper

The existing `buildAuthTokenRequestXml(challenge, nip, subjectIdentifierType)` stays in `client.ts` as a backward-compatible wrapper that delegates to the new function. It's used by `authenticateWithCertificate()` in the auth workflow. No breaking changes.

### D4: Callback-based external signing workflow

```typescript
export interface ExternalSignatureAuthOptions {
  contextIdentifier: ContextIdentifier;
  signXml: (unsignedXml: string) => Promise<string> | string;
  verifyCertificateChain?: boolean;
  enforceXadesCompliance?: boolean;
  pollOptions?: PollOptions;
}

export async function authenticateWithExternalSignature(
  client: KSeFClient,
  options: ExternalSignatureAuthOptions,
): Promise<AuthResult>;
```

The `signXml` callback receives the unsigned XML and returns signed XML. This keeps the workflow orchestration (challenge → build → sign → submit → poll → redeem) in one place while delegating the actual signing to the caller.

**Alternative considered:** Two-step API (step 1: get challenge + XML, step 2: submit signed XML) — rejected because it exposes intermediate state and forces the caller to manage the flow manually. Users who want full control can already call `auth.getChallenge()` + `buildUnsignedAuthTokenRequestXml()` + `auth.submitXadesAuthRequest()` directly.

**Alternative considered:** Only exposing the builder without a workflow — insufficient because the orchestration (polling, token redemption, auth manager setup) is non-trivial to replicate.

### D5: CLI `ksef auth login-external` as two-phase command

Phase 1 (`--generate`): Gets challenge, builds unsigned XML, writes to stdout or `--output` file, saves reference number to temp state.

Phase 2 (`--submit`): Reads signed XML from stdin or `--input` file, submits, polls, redeems tokens.

This matches how external signing tools work in practice: generate → sign out-of-band → submit.

**Alternative considered:** Single interactive command that waits for user input — rejected because external signing is often done asynchronously (different machine, HSM console, etc.).

### D6: Re-export from package entry point

`buildUnsignedAuthTokenRequestXml` and `authenticateWithExternalSignature` are exported from `src/index.ts` as public API. The `AuthTokenRequestXmlOptions` and `ExternalSignatureAuthOptions` types are also exported.

## Risks / Trade-offs

**[Challenge expiration]** → KSeF challenges have a short TTL. If the user takes too long to sign externally, the challenge expires. Mitigation: Document the time constraint. The CLI `--generate` phase prints a warning about the expiration window.

**[XML format sensitivity]** → External signing tools may reformat the XML (whitespace, encoding). KSeF is sensitive to the exact XML content because the challenge digest is computed from it. Mitigation: Document that the signed XML must preserve the original document content; only the `ds:Signature` element should be appended.

**[Context identifier XML mapping]** → The KSeF auth XML schema uses element names (`<Nip>`, `<InternalId>`) not attribute-based type discrimination. If KSeF adds new context types in the future, the builder needs updating. Mitigation: low risk — these types haven't changed across API versions.
