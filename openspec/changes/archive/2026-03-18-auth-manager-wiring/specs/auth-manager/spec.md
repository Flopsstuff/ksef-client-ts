## ADDED Requirements

### Requirement: Refresh token storage
`DefaultAuthManager` SHALL store a refresh token alongside the access token. It SHALL expose `getRefreshToken(): string | undefined` and `setRefreshToken(token: string | undefined): void` methods. It SHALL also expose `setAccessToken(token: string | undefined): void` for external hydration.

#### Scenario: Store and retrieve refresh token
- **WHEN** `setRefreshToken("rt-abc")` is called
- **THEN** `getRefreshToken()` SHALL return `"rt-abc"`

#### Scenario: Clear refresh token
- **WHEN** `setRefreshToken(undefined)` is called
- **THEN** `getRefreshToken()` SHALL return `undefined`

#### Scenario: External access token hydration
- **WHEN** `setAccessToken("at-xyz")` is called
- **THEN** `getAccessToken()` SHALL return `"at-xyz"`

### Requirement: Concurrent 401 dedup
When multiple requests trigger `onUnauthorized()` concurrently, `DefaultAuthManager` SHALL coalesce them into a single `refreshFn` call. All concurrent callers SHALL await the same Promise. After the refresh completes (success or failure), subsequent `onUnauthorized()` calls SHALL start a new refresh.

#### Scenario: Two concurrent 401s trigger one refresh
- **WHEN** two requests call `onUnauthorized()` simultaneously
- **THEN** `refreshFn` SHALL be invoked exactly once
- **AND** both callers SHALL receive the same result

#### Scenario: Refresh failure propagates to all waiters
- **WHEN** three requests call `onUnauthorized()` simultaneously
- **AND** `refreshFn` rejects with an error
- **THEN** all three callers SHALL receive the same rejection

#### Scenario: New refresh after previous completes
- **WHEN** a first `onUnauthorized()` call completes successfully
- **AND** a new `onUnauthorized()` call is made afterward
- **THEN** `refreshFn` SHALL be invoked again (not cached from previous call)

### Requirement: Skip auth retry flag
`RestRequest` SHALL support a `skipAuthRetry()` method that marks the request to bypass the 401→refresh→retry mechanism. `RestClient` SHALL NOT call `authManager.onUnauthorized()` for requests with this flag set.

#### Scenario: Flagged request bypasses auth retry
- **WHEN** a request with `skipAuthRetry()` receives a 401 response
- **AND** an `AuthManager` is configured
- **THEN** the system SHALL NOT call `authManager.onUnauthorized()`
- **AND** the 401 SHALL proceed to `ensureSuccess` (throw `KSeFUnauthorizedError`)

#### Scenario: Unflagged request still triggers auth retry
- **WHEN** a request without `skipAuthRetry()` receives a 401 response
- **AND** an `AuthManager` is configured
- **THEN** the system SHALL call `authManager.onUnauthorized()` as before

## MODIFIED Requirements

### Requirement: DefaultAuthManager implementation
The system SHALL provide a `DefaultAuthManager` class that stores a current access token, an optional refresh token, and accepts a `refreshFn: () => Promise<string | null>` callback. On `onUnauthorized()`, it SHALL coalesce concurrent calls into a single `refreshFn` invocation, store the new token if non-null, and return it. It SHALL expose `setAccessToken()` and `setRefreshToken()` / `getRefreshToken()` for external token management.

#### Scenario: DefaultAuthManager stores and refreshes token
- **WHEN** `DefaultAuthManager` is created with a token `"initial"` and a refresh function
- **THEN** `getAccessToken()` SHALL return `"initial"`
- **AND** when `onUnauthorized()` is called and `refreshFn` returns `"refreshed"`
- **THEN** `getAccessToken()` SHALL return `"refreshed"` afterward

#### Scenario: DefaultAuthManager clears token on failed refresh
- **WHEN** `onUnauthorized()` is called and `refreshFn` returns `null`
- **THEN** `getAccessToken()` SHALL return `undefined` afterward

#### Scenario: DefaultAuthManager deduplicates concurrent refreshes
- **WHEN** `onUnauthorized()` is called twice before the first resolves
- **THEN** `refreshFn` SHALL be called exactly once

### Requirement: Reactive token refresh on 401
The system SHALL call `authManager.onUnauthorized()` when a 401 response is received, an `AuthManager` is configured, and the request does NOT have the `skipAuthRetry` flag set. If `onUnauthorized()` returns a new token (non-null string), the system SHALL retry the request exactly once with the new token. If it returns `null`, the system SHALL throw the 401 error.

#### Scenario: Successful token refresh
- **WHEN** a request receives a 401 response
- **AND** `authManager.onUnauthorized()` returns `"newToken456"`
- **THEN** the system SHALL retry the request with `Authorization: Bearer newToken456`
- **AND** the retry SHALL happen exactly once

#### Scenario: Failed token refresh
- **WHEN** a request receives a 401 response
- **AND** `authManager.onUnauthorized()` returns `null`
- **THEN** the system SHALL throw `KSeFUnauthorizedError`

#### Scenario: No infinite refresh loop
- **WHEN** a request receives a 401 response
- **AND** `authManager.onUnauthorized()` returns a new token
- **AND** the retried request also receives a 401
- **THEN** the system SHALL throw `KSeFUnauthorizedError` (no second refresh attempt)

#### Scenario: Skip auth retry prevents refresh
- **WHEN** a request with `skipAuthRetry` flag receives a 401 response
- **THEN** the system SHALL NOT call `authManager.onUnauthorized()`
- **AND** the system SHALL throw `KSeFUnauthorizedError`
