## Why

`AuthManager` and `DefaultAuthManager` are implemented and `RestClient` supports automatic 401 refresh, but `KSeFClient` never creates or wires an `AuthManager` — making the entire mechanism dead code. Every service method requires an explicit `accessToken` parameter, and there is no central token store, no automatic refresh, and no high-level login API. Users must manually orchestrate a multi-step auth ceremony and thread tokens through every call.

Detailed analysis and risk assessment: [`docs/auth-manager-wiring-plan.md`](../../docs/auth-manager-wiring-plan.md)

## What Changes

- **BREAKING**: Remove explicit `accessToken` parameter from all service methods (except 3 AuthService methods that use operation/refresh tokens)
- Extend `DefaultAuthManager` with refresh token storage and concurrent 401 dedup
- Add `skipAuthRetry` flag to `RestRequest` to prevent refresh recursion
- Wire `AuthManager` into `KSeFClient` constructor via `buildRestClientConfig()`
- Add high-level `loginWithToken()`, `loginWithCertificate()`, `logout()` methods to `KSeFClient`
- Update CLI to delegate login ceremony to client and stop passing tokens manually

## Capabilities

### New Capabilities
- `client-login`: High-level login/logout on `KSeFClient` — orchestrates the multi-step auth ceremony (challenge, encrypt, submit, poll, redeem), stores tokens in `AuthManager`, and provides `loginWithToken()`, `loginWithCertificate()`, `logout()` methods. Also covers wiring `AuthManager` into `KSeFClient` and removing explicit `accessToken` from service method signatures.

### Modified Capabilities
- `auth-manager`: Extend `DefaultAuthManager` with refresh token storage (`getRefreshToken`/`setRefreshToken`), concurrent 401 dedup (shared Promise in `onUnauthorized`), and `skipAuthRetry` flag on `RestRequest` to prevent refresh-triggers-refresh recursion.

## Impact

- **Services** (~12 files): All service methods lose `accessToken` parameter; `RestRequest.accessToken()` calls removed. Three `AuthService` methods (`getAuthStatus`, `getAccessToken`, `refreshAccessToken`) keep explicit token params.
- **HTTP layer** (3 files): `auth-manager.ts` (dedup + refresh token), `rest-request.ts` (skipAuthRetry flag), `rest-client.ts` (check skipAuthRetry in 401 branch)
- **Client** (1 file): `client.ts` — wire `AuthManager`, add login/logout methods
- **CLI** (~12 files): Login commands delegate to client; all commands stop passing `accessToken`
- **Tests** (~5 files): New tests for dedup, login ceremony, auto-injection, skipAuthRetry
