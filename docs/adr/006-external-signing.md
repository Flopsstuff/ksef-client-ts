# ADR-006: External Signing Architecture

- **Date:** 2026-03-28
- **Status:** Accepted

## Context

KSeF XAdES authentication requires submitting a signed XML document. The original `buildAuthTokenRequestXml()` was tightly coupled with internal signing — it lived in `client.ts`, only supported `Nip` context identifiers, and was not designed for public consumption. Users with HSMs, EPUAP, or smart cards had no way to authenticate.

Most plumbing already existed: `AuthService.submitXadesAuthRequest()` accepts any pre-signed XML, and `ContextIdentifier` with all 4 types is defined in `src/models/common.ts`.

## Decisions

### Callback-based workflow, not two-step API

```typescript
interface ExternalSignatureAuthOptions {
  contextIdentifier: ContextIdentifier;
  signXml: (unsignedXml: string) => Promise<string> | string;
  pollOptions?: PollOptions;
}
```

The `signXml` callback receives unsigned XML and returns signed XML. This keeps orchestration (challenge -> build -> sign -> submit -> poll -> redeem) in one place while delegating signing to the caller.

**Rejected:** Two-step API (step 1: get challenge + XML, step 2: submit signed XML) — exposes intermediate state and forces the caller to manage the flow manually. Users who want full control can call individual methods directly.

**Rejected:** Only exposing the builder without a workflow — orchestration (polling, token redemption, auth manager setup) is non-trivial to replicate.

### XML builder extracted to `src/crypto/auth-xml-builder.ts`

Moved out of `client.ts` into its own module under `src/crypto/`. The function generates XML related to authentication cryptography — it belongs with the crypto layer, not the client facade.

The old `buildAuthTokenRequestXml()` stays in `client.ts` as a backward-compatible wrapper.

### CLI as two-phase command

Phase 1 (`--generate`): Gets challenge, builds unsigned XML, writes to stdout or `--output` file, saves reference number to temp state.

Phase 2 (`--submit`): Reads signed XML from stdin or `--input` file, submits, polls, redeems tokens.

This matches how external signing works in practice: generate -> sign out-of-band (possibly on a different machine, HSM console) -> submit.

**Rejected:** Single interactive command that waits for input — external signing is often asynchronous.

### Full context identifier support

The new `buildUnsignedAuthTokenRequestXml()` supports all 4 context identifier types (`Nip`, `InternalId`, `NipVatUe`, `PeppolId`), mapping `ContextIdentifier.type` to the XML element name.

## Risks

- **Challenge expiration** — KSeF challenges have a short TTL. If external signing takes too long, the challenge expires. CLI prints a warning. No mitigation beyond documentation.
- **XML format sensitivity** — External signing tools may reformat XML (whitespace, encoding). The challenge digest is computed from exact XML content. Only the `ds:Signature` element should be appended.
- **Context identifier XML mapping** — Element names (`<Nip>`, `<InternalId>`) haven't changed across KSeF API versions. Low risk.
