## 1. Extend DefaultAuthManager

- [x] 1.1 Add `refreshToken` field with `getRefreshToken()` / `setRefreshToken()` to `DefaultAuthManager` (`src/http/auth-manager.ts`)
- [x] 1.2 Add `setAccessToken(token)` method to `DefaultAuthManager`
- [x] 1.3 Implement concurrent dedup in `onUnauthorized()` — shared Promise pattern
- [x] 1.4 Update `AuthManager` interface: add `setAccessToken`, `getRefreshToken`, `setRefreshToken`
- [x] 1.5 Update tests in `tests/unit/http/auth-manager.test.ts`: refresh token storage, dedup, failed refresh propagation

## 2. Add skipAuthRetry to RestRequest and RestClient

- [x] 2.1 Add `skipAuthRetry()` method and `_skipAuthRetry` field to `RestRequest` (`src/http/rest-request.ts`)
- [x] 2.2 Add `isSkipAuthRetry()` getter to `RestRequest`
- [x] 2.3 Update `RestClient.sendRequest()` 401 branch to check `!request.isSkipAuthRetry()` (`src/http/rest-client.ts:86`)
- [x] 2.4 Set `skipAuthRetry()` on the request in `AuthService.refreshAccessToken()` (`src/services/auth.ts:52`)
- [x] 2.5 Add test in `tests/unit/http/rest-client.test.ts`: skipAuthRetry flag bypasses 401 refresh

## 3. Wire AuthManager into KSeFClient

- [x] 3.1 Create `DefaultAuthManager` in `KSeFClient` constructor with `refreshFn` that calls `auth.refreshAccessToken()` (`src/client.ts`)
- [x] 3.2 Expose `authManager` as readonly property on `KSeFClient`
- [x] 3.3 Pass `authManager` to `RestClient` via `buildRestClientConfig()`
- [x] 3.4 Add `authManager` to `KSeFClientOptions` type if user wants to provide custom implementation (`src/config/options.ts`)

## 4. Remove accessToken from service methods

- [x] 4.1 `ActiveSessionsService` — remove `accessToken` param, remove `.accessToken()` calls (`src/services/active-sessions.ts`)
- [x] 4.2 `BatchSessionService` — remove `accessToken` param (`src/services/batch-session.ts`)
- [x] 4.3 `CertificateApiService` — remove `accessToken` param from all 7 methods (`src/services/certificates.ts`)
- [x] 4.4 `InvoiceDownloadService` — remove `accessToken` param from all 4 methods (`src/services/invoice-download.ts`)
- [x] 4.5 `LimitsService` — remove `accessToken` param from all 3 methods (`src/services/limits.ts`)
- [x] 4.6 `OnlineSessionService` — remove `accessToken` param from all 3 methods (`src/services/online-session.ts`)
- [x] 4.7 `PeppolService` — remove `accessToken` param (`src/services/peppol.ts`)
- [x] 4.8 `PermissionsService` — remove `accessToken` param from all ~18 methods (`src/services/permissions.ts`)
- [x] 4.9 `SessionStatusService` — remove `accessToken` param from all 8 methods (`src/services/session-status.ts`)
- [x] 4.10 `TestDataService` — remove `accessToken` param from all 10 methods (`src/services/test-data.ts`)
- [x] 4.11 `TokenService` — remove `accessToken` param from all 4 methods (`src/services/tokens.ts`)
- [x] 4.12 Verify `AuthService` keeps explicit token params on `getAuthStatus`, `getAccessToken`, `refreshAccessToken` — no changes needed

## 5. Add high-level login methods to KSeFClient

- [x] 5.1 Implement `loginWithToken(token, nip)` on `KSeFClient` — challenge, crypto.init, encrypt, submit, redeem, store tokens
- [x] 5.2 Implement `loginWithCertificate(certPem, keyPem, nip)` on `KSeFClient` — challenge, sign XAdES (dynamic import), submit, redeem, store tokens
- [x] 5.3 Implement `logout()` on `KSeFClient` — clear access + refresh tokens
- [ ] 5.4 Add tests: `loginWithToken` with mocked transport, verify full ceremony sequence
- [ ] 5.5 Add tests: `logout` clears tokens

## 6. Update CLI

- [x] 6.1 Update `requireSession()` in `src/cli/client-factory.ts` to hydrate `authManager` from session data
- [x] 6.2 Refactor `ksef auth login` to delegate to `client.loginWithToken()` / `client.loginWithCertificate()` (`src/cli/commands/auth.ts`)
- [x] 6.3 Update `ksef auth refresh` to use `authManager` or keep current approach (manual refresh + session save)
- [x] 6.4 Remove `session.accessToken` passing from `src/cli/commands/invoice.ts`
- [x] 6.5 Remove `session.accessToken` passing from `src/cli/commands/session.ts`
- [x] 6.6 Remove `session.accessToken` passing from `src/cli/commands/permission.ts`
- [x] 6.7 Remove `session.accessToken` passing from `src/cli/commands/token.ts`
- [x] 6.8 Remove `session.accessToken` passing from `src/cli/commands/cert.ts`
- [x] 6.9 Remove `session.accessToken` passing from `src/cli/commands/test-data.ts`

## 7. Build and verify

- [x] 7.1 Run `yarn build` — verify no TypeScript errors
- [x] 7.2 Run `yarn test` — verify all existing tests pass
- [x] 7.3 Run `yarn lint` — verify no type errors
