## Context

KSeF API v2.5/v2.6 added field-level contract changes across four operations (auth-token, online
session, batch session, invoice export) plus an optional response-warning header. The OpenAPI spec is
already refreshed to v2.6.0 on this branch (`yarn check-api` confirms route coverage is unchanged —
all additions are fields, not endpoints).

Current state relevant to the design:

- `CertificateFetcher` (`src/crypto/certificate-fetcher.ts`) fetches `/security/public-key-certificates`,
  caches two PEMs. It picks the symmetric cert as the **first** match by `usage` (no validity check) and
  the ksef-token cert as the **earliest** by `validFrom`. Neither tracks `publicKeyId`. This is the
  rotation footgun the change must fix.
- `EncryptionInfo` (`src/models/common.ts`) is `{ encryptedSymmetricKey, initializationVector }`, consumed
  by online/batch session open and invoice export. The auth-token request carries its own encrypted blob.
- `RestClient.execute()` (`src/http/rest-client.ts`) already returns `headers`; its 400 branch parses
  Problem Details and a few legacy error codes. No system-warning surfacing, no 21470 handling.
- Batch packaging uses `yazl` (zip) via `BatchFileBuilder`; `stream-batch-upload` capability already
  specs stream-based ZIP splitting. No tar support.
- `buildUnsignedAuthTokenRequestXml` hardcodes the `auth/token/2.0` namespace.
- `FormType` (`src/models/invoices/types.ts`) is `'FA' | 'PEF' | 'RR' | 'FA_RR'`.

## Goals / Non-Goals

**Goals:**
- Make encryption rotation-safe and forward-compatible: send `publicKeyId`, select certs by validity
  window, recover from `21470` without caller intervention.
- Add `Zip | TarGz` compression to batch and export with `Zip` as the unchanged default.
- Surface `X-System-Warning` without affecting operation results.
- Move the auth-token XML to schema 2.1.
- Remove the deprecated `RR` query form type.

**Non-Goals:**
- Emitting an IP-allowlist (`AllowedIps`) block in the auth-token request — schema 2.1 relaxes the IP
  regex, but we expose no API surface for IP-restricted tokens today. Namespace bump only.
- Generic retry-on-21470 inside `RestClient` (see Decision 3 — it must live where encryption is rebuilt).
- Reworking the existing Problem Details / error hierarchy beyond adding one error code.
- ECIES, PDF export, resumable sessions, metadata-query truncation paging (tracked separately in backlog).

## Decisions

### 1. `publicKeyId` is read from the API, never computed

The cert-list response now returns `publicKeyId` (SHA-256 of `SubjectPublicKeyInfo`, Base64, 44 chars)
and `certificateId` per certificate. We store the chosen cert's `publicKeyId` alongside its cached PEM
and attach it to `EncryptionInfo` / the auth-token request. We do **not** derive the hash ourselves.
*Rationale:* the value is authoritative from KSeF; computing it would duplicate logic and risk encoding
mismatches. *Alternative considered:* compute from DER — rejected as needless.

### 2. Rotation-safe certificate selection (newest valid per usage)

`CertificateFetcher.fetchCertificates()` is rewritten: for each usage (`SymmetricKeyEncryption`,
`KsefTokenEncryption`), filter to certs where `validFrom ≤ now < validTo`, then pick the one with the
**latest** `validFrom`. Cache `{ pem, publicKeyId }` per usage. *Rationale:* matches C#/Java/Py refs and
the rotation model (overlapping validity windows). *Alternatives:* keep "first by usage" (current — broken
under rotation) or "earliest validFrom" (current token behavior — picks the about-to-expire cert). Both
rejected. *Edge case:* if no cert is currently valid, fall back to the newest by `validFrom` and let the
server reject — surfacing a clear error beats silently sending nothing.

### 3. `21470` recovery lives at the encryption call-sites, not in `RestClient`

A new error code `21470` ("key id unknown or revoked") maps to a typed error in `RestClient`'s 400
branch. Recovery (refresh certs + retry once) is wrapped around the **operations that build
`EncryptionInfo`** — session-open, export, token-auth — because only they can re-encrypt with the new
key; `RestClient` cannot rebuild the payload. The wrapper: catch the typed error → `fetcher.refresh()`
→ rebuild encryption → retry exactly once → rethrow on second failure. *Rationale:* a generic transport
retry would replay a stale ciphertext and loop. *Trade-off:* a small amount of retry glue per call-site
(or one shared helper) instead of one central hook.

### 4. `TarGz` via `tar-stream` + native gzip

Add a `CompressionType = 'Zip' | 'TarGz'` option threaded into batch packaging and export requests.
Zip stays the default. For TarGz, produce a tar archive with `tar-stream` (pure-JS, streaming, widely
used) piped through `node:zlib.createGzip`. *Rationale:* the `stream-batch-upload` capability is already
stream-based; `tar-stream` keeps that property and avoids hand-rolling tar header/checksum math (the
Java ref hand-rolled it and it's error-prone). We already ship `yazl`/`yauzl`, so one more small archive
dep is consistent. *Alternative considered:* hand-rolled tar writer (~50 lines) — rejected for
maintenance cost and checksum-edge-case risk; revisit only if we want zero new deps. **This is the one
new runtime dependency in the change.**

### 5. `X-System-Warning` as an optional `onSystemWarning` callback

`RestClient` options gain `onSystemWarning?: (warning: string) => void`. After a response, if the
`X-System-Warning` header is present, invoke it with the raw header value (format
`[code]: message | …`); if no callback is configured, log at warn level via the existing logger. The
raw string is passed through unparsed. *Rationale:* warnings are advisory and forward-looking; callers
who care can parse, the rest get a log line. *Alternative considered:* parse into structured
`{code,message}[]` — deferred; the format isn't worth a parser until a caller needs it.

### 6. Auth-token XML defaults to schema 2.1, unconditionally

Bump the namespace constant to `http://ksef.mf.gov.pl/auth/token/2.1`. No config flag. *Rationale:*
KSeF accepts both 2.0 and 2.1; 2.1 is the current schema and the only difference that matters to us is
the namespace (we don't emit IP fields). A flag would be dead configuration. *Alternative:* make it
configurable — rejected as YAGNI.

### 7. Removing `RR` is a breaking type change (acceptable at 0.x minor)

`FormType` drops `'RR'`. *Rationale:* spec removed `InvoiceQueryFormType.RR`; keeping it invites sending
a value the server no longer accepts. The unrelated document **system code** `value: 'RR'` in
`document-structures` (`FA_RR_1_LEGACY`/`_TRANSITION`) stays untouched. `scripts/generate-invoice-schemas.mjs`
must drop its two `schemat_RR(1)` XSD entries (the files were deleted by `sync-schemas`).

## Risks / Trade-offs

- **21470 retry loop** → single retry with `refresh()` dedup; second failure rethrows. Refresh is
  idempotent and already exists on the fetcher.
- **New `tar-stream` dependency** → pure-JS, no native bindings (keeps Deno/edge compat just won at
  v0.8.0); pin and audit. If undesirable, the hand-rolled fallback is the escape hatch.
- **Breaking `FormType`** → call out in CHANGELOG; the literal `'RR'` is the only removed value and it's
  deprecated upstream. Type-check (`yarn lint`) surfaces any internal use at build time.
- **Cert selection with clock skew** → "valid now" uses local time; a slightly skewed clock near a
  rotation boundary could pick the wrong cert. Mitigation: the 21470 recovery path self-heals by
  refreshing and retrying.
- **One usage per cert (new API shape)** → selection filters per usage independently, so a cert with a
  single usage is handled the same as the old dual-usage cert; `usage.includes(...)` still works.

## Migration Plan

No data migration. Rollout is a normal release (v0.9.0). The only breaking surface is the `FormType`
literal `'RR'`; documented in CHANGELOG. Rollback = revert the release; no persistent state changes.

## Open Questions

- Confirm the exact wire field name/casing for `compressionType` and `publicKeyId` against the refreshed
  `docs/open-api.json` chunks before finalizing model fields (resolve during specs/tasks).
- Whether the `21470` recovery wrapper should be a single shared helper or inlined per call-site — decide
  during implementation based on how similar the three call-sites end up looking.
