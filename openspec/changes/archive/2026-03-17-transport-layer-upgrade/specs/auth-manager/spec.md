## ADDED Requirements

### Requirement: Auth header injection
The system SHALL inject an `Authorization: Bearer <token>` header before each request when an `AuthManager` is configured and `getAccessToken()` returns a non-undefined value.

#### Scenario: Token injected into request
- **WHEN** `AuthManager.getAccessToken()` returns `"abc123"`
- **THEN** the request SHALL include header `Authorization: Bearer abc123`

#### Scenario: No token available
- **WHEN** `AuthManager.getAccessToken()` returns `undefined`
- **THEN** no `Authorization` header SHALL be injected by the auth manager

#### Scenario: Request already has auth header
- **WHEN** a `RestRequest` already has an `Authorization` header set via `.accessToken()`
- **AND** an `AuthManager` is configured
- **THEN** the request's explicit header SHALL take precedence over the auth manager's token

### Requirement: Reactive token refresh on 401
The system SHALL call `authManager.onUnauthorized()` when a 401 response is received and an `AuthManager` is configured. If `onUnauthorized()` returns a new token (non-null string), the system SHALL retry the request exactly once with the new token. If it returns `null`, the system SHALL throw the 401 error.

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

### Requirement: 401 not retried without AuthManager
The system SHALL NOT retry 401 responses when no `AuthManager` is configured. 401 SHALL NOT be in the default `retryableStatusCodes`.

#### Scenario: 401 without AuthManager
- **WHEN** a request receives a 401 response
- **AND** no `AuthManager` is configured
- **THEN** the system SHALL throw `KSeFUnauthorizedError` immediately

### Requirement: AuthManager interface
The system SHALL define an `AuthManager` interface with two methods: `getAccessToken(): string | undefined` and `onUnauthorized(): Promise<string | null>`.

#### Scenario: Interface contract
- **WHEN** a class implements `AuthManager`
- **THEN** it MUST provide `getAccessToken()` returning the current token or `undefined`
- **AND** it MUST provide `onUnauthorized()` returning a promise of a new token or `null`

### Requirement: DefaultAuthManager implementation
The system SHALL provide a `DefaultAuthManager` class that stores a current token and accepts a `refreshFn: () => Promise<string | null>` callback. On `onUnauthorized()`, it SHALL call `refreshFn`, store the new token if non-null, and return it.

#### Scenario: DefaultAuthManager stores and refreshes token
- **WHEN** `DefaultAuthManager` is created with a token `"initial"` and a refresh function
- **THEN** `getAccessToken()` SHALL return `"initial"`
- **AND** when `onUnauthorized()` is called and `refreshFn` returns `"refreshed"`
- **THEN** `getAccessToken()` SHALL return `"refreshed"` afterward

#### Scenario: DefaultAuthManager clears token on failed refresh
- **WHEN** `onUnauthorized()` is called and `refreshFn` returns `null`
- **THEN** `getAccessToken()` SHALL return `undefined` afterward
