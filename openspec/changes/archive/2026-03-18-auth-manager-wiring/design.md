## Context

`AuthManager` interface and `DefaultAuthManager` are implemented. `RestClient` already handles 401→refresh→retry when an `AuthManager` is configured. However, `KSeFClient` never instantiates or wires an `AuthManager`, so the mechanism is dead code.

Currently, every service method takes `accessToken` as an explicit parameter, and the CLI orchestrates the full multi-step login ceremony (challenge→encrypt→submit→redeem) itself.

See [auth-manager-wiring-plan.md](../../docs/auth-manager-wiring-plan.md) for the original analysis and risk assessment.

## Goals / Non-Goals

**Goals:**
- Wire `DefaultAuthManager` into `KSeFClient` so 401→refresh→retry works automatically
- Remove explicit `accessToken` parameter from service methods (central token store)
- Provide high-level `loginWithToken()` / `loginWithCertificate()` / `logout()` on `KSeFClient`
- Make the CLI a thin wrapper that delegates auth ceremony to the client library

**Non-Goals:**
- Persistent token storage in the client library (CLI keeps its own session file)
- Token proactive refresh before expiry (only reactive on 401)
- Multi-session support (one AuthManager per KSeFClient instance)
- Changes to the KSeF API transport layer (retry, rate limiting — already done)

## Decisions

### D1: AuthManager created inside KSeFClient constructor

**Decision:** `KSeFClient` constructor creates a `DefaultAuthManager` by default and passes it to `RestClient` via `buildRestClientConfig()`. The `AuthManager` instance is exposed as `client.authManager` (readonly) for CLI to hydrate tokens from session file. Users can optionally pass a custom `AuthManager` via `KSeFClientOptions.authManager` to override the default — useful for testing or non-standard auth strategies.

### D2: DefaultAuthManager gets refresh token storage + dedup

**Decision:** Extend `DefaultAuthManager` with:
- `refreshToken: string | undefined` (get/set)
- `setAccessToken(token)` for external hydration
- Shared Promise dedup in `onUnauthorized()` — concurrent 401s await the same refresh call

```ts
private refreshPromise: Promise<string | null> | null = null;

async onUnauthorized(): Promise<string | null> {
  if (this.refreshPromise) return this.refreshPromise;
  this.refreshPromise = this.refreshFn()
    .then(token => { this.token = token ?? undefined; return token; })
    .finally(() => { this.refreshPromise = null; });
  return this.refreshPromise;
}
```

**Why dedup:** Without it, N parallel requests hitting 401 trigger N `POST /auth/token/refresh` calls. Even if the API tolerates this, it wastes requests and risks rate limiting.

### D3: `skipAuthRetry` flag on RestRequest

**Decision:** Add `RestRequest.skipAuthRetry()` method (sets `_skipAuthRetry` boolean). `RestClient.sendRequest()` checks this flag before the 401→refresh branch:

```ts
if (response.status === 401 && this.authManager && attempt === 0 && !request.isSkipAuthRetry()) {
```

**Why:** `AuthService.refreshAccessToken()` sends its request through the same `RestClient`. If the refresh call itself returns 401, without this flag we'd enter infinite recursion: refresh→401→onUnauthorized→refresh→401→...

Only `AuthService.refreshAccessToken()` sets this flag.

**Alternative considered:** Use a separate `RestClient` without `AuthManager` for refresh calls. Rejected — duplicates configuration and complicates `AuthService` (would need two RestClient instances).

### D4: Three AuthService methods keep explicit token params

**Decision:** `getAuthStatus(ref, authToken)`, `getAccessToken(authToken)`, and `refreshAccessToken(refreshToken)` retain explicit token parameters and continue using `RestRequest.accessToken()`.

**Why:** These methods use special-purpose tokens (operation token from submit step, refresh token), NOT the session access token in AuthManager. The existing RestClient guard (`if (!headers['Authorization'])`) ensures the explicit header takes precedence over AuthManager injection.

All other service methods (~12 files) lose their `accessToken` parameter.

### D5: refreshFn wiring in KSeFClient

**Decision:** The `refreshFn` passed to `DefaultAuthManager` calls `this.auth.refreshAccessToken()` using the stored refresh token:

```ts
const authManager = new DefaultAuthManager(async () => {
  const rt = authManager.getRefreshToken();
  if (!rt) return null;
  const res = await this.auth.refreshAccessToken(rt);
  return res.accessToken.token;
});
```

**Key insight from API spec:** `POST /auth/token/refresh` returns only `accessToken` — no new `refreshToken`. The `refreshTokenValidUntil` field on `AuthenticationOperationStatusResponse` confirms the refresh token is long-lived and reusable. The refreshFn does NOT clear or rotate the refresh token.

### D6: High-level login methods on KSeFClient

**Decision:** Add three methods:

- `loginWithToken(token: string, nip: string): Promise<void>` — challenge→crypto.init()→encrypt→submit→redeem→store tokens
- `loginWithCertificate(certPem: string, keyPem: string, nip: string): Promise<void>` — challenge→sign XAdES→submit→redeem→store tokens
- `logout(): Promise<void>` — clear tokens from AuthManager

These methods do NOT poll `getAuthStatus()`. The current CLI login skips polling too (calls `getAccessToken` directly after submit). If polling becomes necessary, it can be added later.

**Alternative considered:** A single `login(options)` method with a discriminated union. Rejected — two explicit methods are clearer and avoid runtime type checks.

### D7: CLI hydration from session file

**Decision:** `requireSession()` in `client-factory.ts` creates a `KSeFClient` and then hydrates the `AuthManager` from the stored session:

```ts
const client = createClient(opts);
client.authManager.setAccessToken(session.accessToken);
client.authManager.setRefreshToken(session.refreshToken);
return { client, session };
```

CLI commands stop passing `session.accessToken` to service methods. The session file remains the persistence layer — `KSeFClient` itself is stateless across process invocations.

## Risks / Trade-offs

**[Refresh token expiry]** → The refresh token has a `validUntil` but we don't proactively check it. If expired, the refresh call returns 401/400, `onUnauthorized` returns null, and the original 401 is thrown. Mitigation: clear error message, user re-authenticates. Proactive expiry check is a non-goal for now.

**[Dedup edge case: refresh fails]** → If refreshFn throws, the shared Promise rejects for all waiters. All parallel requests fail with the same error. This is correct behavior — if refresh fails, all pending requests should fail.

**[CLI session file drift]** → After automatic refresh, the CLI session file still has the old `accessToken`. If the process exits and restarts, it hydrates with the stale token. Mitigation: CLI `requireSession` could save updated tokens on process exit, or accept that the next request will trigger another refresh. Since refresh token is reusable, this is acceptable.

**[Import cost of SignatureService]** → `loginWithCertificate` needs `SignatureService` which pulls in `xml-crypto`. Keep the dynamic import (`await import(...)`) to avoid loading XML crypto for token-based login.

## Open Questions

None — all risks analyzed and mitigated in the planning phase.
