## ADDED Requirements

### Requirement: KSeFClient wires AuthManager
`KSeFClient` SHALL create a `DefaultAuthManager` in its constructor and pass it to `RestClient`. The `refreshFn` SHALL use the stored refresh token to call `AuthService.refreshAccessToken()` and return the new access token. The `AuthManager` instance SHALL be exposed as `client.authManager` (readonly).

#### Scenario: AuthManager is wired on construction
- **WHEN** a `KSeFClient` is constructed
- **THEN** its `RestClient` SHALL have an `AuthManager` configured
- **AND** `client.authManager` SHALL be a `DefaultAuthManager` instance

#### Scenario: refreshFn calls refresh endpoint
- **WHEN** `authManager.onUnauthorized()` is triggered
- **AND** `authManager.getRefreshToken()` returns a valid token
- **THEN** the system SHALL call `POST /auth/token/refresh` with that token
- **AND** store the returned access token in `AuthManager`

#### Scenario: refreshFn returns null when no refresh token
- **WHEN** `authManager.onUnauthorized()` is triggered
- **AND** `authManager.getRefreshToken()` returns `undefined`
- **THEN** the system SHALL return `null` (no refresh possible)

### Requirement: Login with KSeF token
`KSeFClient` SHALL provide `loginWithToken(token: string, nip: string): Promise<void>` that performs the full auth ceremony: request challenge, initialize crypto, encrypt token, submit auth request, redeem access/refresh tokens, and store them in `AuthManager`.

#### Scenario: Successful token login
- **WHEN** `client.loginWithToken("my-token", "1234567890")` is called
- **THEN** the system SHALL call `auth.getChallenge()`
- **AND** call `crypto.init()` if not already initialized
- **AND** encrypt the token using `crypto.encryptKsefToken()`
- **AND** call `auth.submitKsefTokenAuthRequest()` with the encrypted token and NIP
- **AND** call `auth.getAccessToken()` with the operation token
- **AND** store `accessToken` and `refreshToken` in `AuthManager`

#### Scenario: Login fails on challenge
- **WHEN** `auth.getChallenge()` throws an error
- **THEN** `loginWithToken()` SHALL propagate the error
- **AND** `AuthManager` SHALL remain empty (no tokens stored)

### Requirement: Login with certificate
`KSeFClient` SHALL provide `loginWithCertificate(certPem: string, keyPem: string, nip: string): Promise<void>` that performs the XAdES auth ceremony: request challenge, sign with certificate, submit auth request, redeem access/refresh tokens, and store them in `AuthManager`.

#### Scenario: Successful certificate login
- **WHEN** `client.loginWithCertificate(cert, key, "1234567890")` is called
- **THEN** the system SHALL call `auth.getChallenge()`
- **AND** sign the challenge using `SignatureService.sign()`
- **AND** call `auth.submitXadesAuthRequest()` with the signed XML
- **AND** call `auth.getAccessToken()` with the operation token
- **AND** store `accessToken` and `refreshToken` in `AuthManager`

#### Scenario: SignatureService is dynamically imported
- **WHEN** `loginWithCertificate()` is called
- **THEN** `SignatureService` SHALL be loaded via dynamic `import()` (not statically imported)

### Requirement: Logout
`KSeFClient` SHALL provide `logout(): Promise<void>` that clears all tokens from `AuthManager`.

#### Scenario: Logout clears tokens
- **WHEN** `client.logout()` is called
- **THEN** `authManager.getAccessToken()` SHALL return `undefined`
- **AND** `authManager.getRefreshToken()` SHALL return `undefined`

### Requirement: Service methods use automatic token injection
All service methods (except three `AuthService` methods) SHALL NOT accept an `accessToken` parameter. The `Authorization` header SHALL be injected automatically by `RestClient` from `AuthManager`.

#### Scenario: Service method without explicit token
- **WHEN** `client.invoices.getInvoice("FA/123")` is called
- **AND** `authManager.getAccessToken()` returns `"at-abc"`
- **THEN** the request SHALL include header `Authorization: Bearer at-abc`

#### Scenario: AuthService methods keep explicit tokens
- **WHEN** `client.auth.getAuthStatus(ref, authToken)` is called
- **THEN** the request SHALL use the explicit `authToken` in the `Authorization` header
- **AND** `AuthManager` SHALL NOT override it

#### Scenario: AuthService refreshAccessToken uses skipAuthRetry
- **WHEN** `client.auth.refreshAccessToken(refreshToken)` is called
- **THEN** the request SHALL have the `skipAuthRetry` flag set
- **AND** SHALL use the explicit `refreshToken` in the `Authorization` header
