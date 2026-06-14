# ADR-002: Auth Token Management

- **Date:** 2026-03-18
- **Status:** Accepted

## Context

`AuthManager` interface and `DefaultAuthManager` were implemented as part of the transport layer upgrade, but `KSeFClient` never wired them in — the mechanism was dead code. Every service method took `accessToken` as an explicit parameter, and the CLI orchestrated the full multi-step login ceremony itself.

## Decisions

### AuthManager created in KSeFClient constructor

`KSeFClient` creates a `DefaultAuthManager` by default and passes it to `RestClient`. Exposed as `client.authManager` (readonly) for CLI to hydrate tokens from session file. Users can pass a custom `AuthManager` via options.

### Refresh token is reusable (not rotated)

**Key insight from KSeF API:** `POST /auth/token/refresh` returns **only** `accessToken` — no new `refreshToken`. The `refreshTokenValidUntil` field confirms the refresh token is long-lived. The `refreshFn` does NOT clear or rotate the refresh token.

### Concurrent 401 dedup via shared Promise

Without dedup, N parallel requests hitting 401 trigger N `POST /auth/token/refresh` calls. Even if the API tolerates this, it wastes requests and risks rate limiting.

```typescript
private refreshPromise: Promise<string | null> | null = null;

async onUnauthorized(): Promise<string | null> {
  if (this.refreshPromise) return this.refreshPromise;
  this.refreshPromise = this.refreshFn()
    .then(token => { this.token = token ?? undefined; return token; })
    .finally(() => { this.refreshPromise = null; });
  return this.refreshPromise;
}
```

### skipAuthRetry flag prevents refresh recursion

`AuthService.refreshAccessToken()` sends its request through the same `RestClient`. Without a flag, a 401 on the refresh call itself creates infinite recursion: refresh -> 401 -> onUnauthorized -> refresh -> 401...

`RestRequest.skipAuthRetry()` sets a boolean checked before the 401 branch. Only `AuthService.refreshAccessToken()` sets this flag.

**Rejected:** Separate `RestClient` without `AuthManager` for refresh calls — duplicates configuration and complicates `AuthService`.

### Three methods keep explicit token params

`getAuthStatus(ref, authToken)`, `getAccessToken(authToken)`, and `refreshAccessToken(refreshToken)` retain explicit token parameters. These use special-purpose tokens (operation token from submit step, refresh token), NOT the session access token in AuthManager.

The existing RestClient guard (`if (!headers['Authorization'])`) ensures the explicit header takes precedence over AuthManager injection. All other ~12 service files lose their `accessToken` parameter.

### High-level login methods on KSeFClient

- `loginWithToken(token, nip)` — challenge -> crypto.init() -> encrypt -> submit -> redeem -> store tokens
- `loginWithCertificate(certPem, keyPem, nip)` — challenge -> sign XAdES -> submit -> redeem -> store tokens
- `logout()` — clear tokens from AuthManager

Two explicit methods rather than `login(options)` with discriminated union — clearer, no runtime type checks.

### CLI hydration from session file

`requireSession()` creates `KSeFClient` then hydrates AuthManager from stored session. CLI commands stop passing `session.accessToken` to service methods. The session file remains the persistence layer — `KSeFClient` is stateless across process invocations.

## Risks

- **Refresh token expiry** — Not proactively checked. If expired, refresh call fails, `onUnauthorized` returns null, original 401 is thrown. User re-authenticates.
- **CLI session file drift** — After automatic refresh, session file still has old `accessToken`. Next restart triggers another refresh. Acceptable since refresh token is reusable.
- **SignatureService import cost** — `loginWithCertificate` uses dynamic `await import(...)` to avoid loading xml-crypto for token-based login.
