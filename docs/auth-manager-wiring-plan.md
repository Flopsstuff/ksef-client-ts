# AuthManager Wiring Plan

## Problem

`AuthManager` and `DefaultAuthManager` are implemented. `RestClient` supports automatic 401 → refresh → retry. But `KSeFClient` doesn't create or wire an `AuthManager`, so the mechanism is dead code.

Currently every service method takes `accessToken` as an explicit parameter. There's no central token store and no automatic refresh.

## Current Auth Flow

```
User code:
  1. client.auth.getChallenge()
  2. client.auth.submitKsefTokenAuthRequest(payload)
  3. client.auth.getAuthStatus(ref, authToken)
  4. client.auth.getAccessToken(authToken) → { accessToken, refreshToken }
  5. client.invoices.getInvoice(ksefNumber, accessToken.token)  ← manual token passing
  6. ... token expires → 401 → error thrown, user must handle
```

## Target Auth Flow

```
User code:
  1. await client.login({ token, nip, env })   ← high-level helper
     — internally: challenge → encrypt → submit → poll status → redeem tokens
     — stores accessToken + refreshToken in AuthManager
  2. client.invoices.getInvoice(ksefNumber)     ← no token needed
  3. ... token expires → 401 → AuthManager.onUnauthorized()
     → calls auth.refreshAccessToken(refreshToken)
     → stores new accessToken → retries request transparently
```

## Implementation Tasks

### Task 1: Store tokens in DefaultAuthManager

Wire `DefaultAuthManager` into `KSeFClient`:

```ts
// In KSeFClient constructor:
const authManager = new DefaultAuthManager(
  async () => {
    // refreshFn — called on 401
    const refreshToken = authManager.getRefreshToken();
    if (!refreshToken) return null;
    const response = await this.auth.refreshAccessToken(refreshToken);
    authManager.setRefreshToken(undefined); // clear old, new one not returned by API
    return response.accessToken.token;
  }
);
```

`DefaultAuthManager` needs extending:
- Add `refreshToken` storage (`getRefreshToken()`, `setRefreshToken()`)
- `setAccessToken(token)` for external use (after login)

Pass `authManager` to `RestClient` via `buildRestClientConfig()`.

### Task 2: Remove explicit accessToken from service methods

All service methods currently take `accessToken` as a parameter:
```ts
getInvoice(ksefNumber: string, accessToken: string)
```

Change to:
```ts
getInvoice(ksefNumber: string)
```

`RestClient` now injects the token automatically from `AuthManager.getAccessToken()`. Services no longer need to call `.accessToken(token)` on `RestRequest`.

**Affected services:** all 13 (auth, activeSessions, onlineSession, batchSession, sessionStatus, invoices, permissions, tokens, certificates, limits, peppol, testData + CertificateFetcher).

**Backward compat:** Not needed — package not published yet.

### Task 3: Add high-level login methods to KSeFClient

```ts
class KSeFClient {
  async loginWithToken(token: string, nip: string): Promise<void> {
    // 1. getChallenge()
    // 2. crypto.init() + encryptKsefToken()
    // 3. submitKsefTokenAuthRequest()
    // 4. poll getAuthStatus() until complete
    // 5. getAccessToken() → store in AuthManager
  }

  async loginWithCertificate(certPem: string, keyPem: string, nip: string): Promise<void> {
    // 1. getChallenge()
    // 2. build + sign XAdES XML
    // 3. submitXadesAuthRequest()
    // 4. poll getAuthStatus() until complete
    // 5. getAccessToken() → store in AuthManager
  }

  async logout(): Promise<void> {
    // Clear tokens from AuthManager
  }
}
```

This extracts the multi-step auth ceremony from CLI into the client library. CLI becomes a thin wrapper.

### Task 4: Update CLI to use new login flow

CLI currently implements the full login ceremony itself. Refactor to delegate to `client.loginWithToken()` / `client.loginWithCertificate()`.

CLI session file (`~/.ksef/session.json`) still needed for persistence across CLI invocations. On startup, CLI reads stored tokens and calls `authManager.setAccessToken()`.

### Task 5: Update all CLI commands to stop passing accessToken

CLI commands currently read `accessToken` from session file and pass to service methods. After Task 2, remove all manual token passing.

### Task 6: Tests

- `DefaultAuthManager` extended: refresh token storage, set/get
- `KSeFClient.loginWithToken()`: mock transport, verify full ceremony
- Automatic 401 refresh: mock transport returning 401 → 200, verify refresh called
- Services without explicit token: verify AuthManager injects header

## Implementation Order

```
Task 1: DefaultAuthManager + wiring     (foundation)
Task 2: Remove accessToken from services (big refactor, all services)
Task 3: High-level login methods         (depends on 1+2)
Task 4: Update CLI login                 (depends on 3)
Task 5: Update CLI commands              (depends on 2)
Task 6: Tests                            (alongside each task)
```

Tasks 1+2 are the core change. Task 3 is the usability improvement. Tasks 4+5 are CLI cleanup.

## Scope

| Task | Files affected | Estimate |
|------|---------------|----------|
| 1. DefaultAuthManager + wiring | 3 (auth-manager.ts, client.ts, options.ts) | Small |
| 2. Remove accessToken from services | ~15 service files + CLI commands | Large |
| 3. High-level login methods | 1 (client.ts) | Medium |
| 4. Update CLI login | 1-2 CLI files | Small |
| 5. Update CLI commands | ~10 CLI files | Medium |
| 6. Tests | ~5 test files | Medium |

## Risk

- **RefreshToken lifecycle**: KSeF API returns `refreshToken` on initial login but NOT on refresh. Need to verify if the same refresh token stays valid or if refresh is one-shot.
- **Concurrent requests**: Multiple requests hitting 401 simultaneously could trigger multiple refresh calls. `DefaultAuthManager.onUnauthorized()` may need a mutex/dedup.
