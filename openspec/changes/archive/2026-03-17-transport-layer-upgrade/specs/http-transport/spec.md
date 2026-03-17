## ADDED Requirements

### Requirement: Pluggable transport function
The system SHALL accept an optional `TransportFn` that replaces the default `fetch` call. `TransportFn` SHALL have the signature `(url: string, init: RequestInit) => Promise<Response>`. When no transport is provided, the system SHALL use native `fetch`.

#### Scenario: Default transport uses native fetch
- **WHEN** `RestClient` is created without a custom transport
- **THEN** HTTP requests SHALL be made via native `fetch`

#### Scenario: Custom transport replaces fetch
- **WHEN** `RestClient` is created with a custom `TransportFn`
- **THEN** all HTTP requests SHALL be routed through the custom transport function
- **AND** the custom transport SHALL receive the fully-constructed URL and `RequestInit` (method, headers, body, signal)

#### Scenario: Mock transport in tests
- **WHEN** a test provides a mock `TransportFn` that returns a canned `Response`
- **THEN** no real network calls SHALL be made
- **AND** the mock SHALL receive the exact URL, method, headers, and body that `RestClient` would send

### Requirement: Transport receives timeout signal
The system SHALL pass an `AbortSignal` via `RequestInit.signal` to the transport function, configured from the client's timeout setting.

#### Scenario: Timeout propagated to transport
- **WHEN** `RestClient` has a timeout of 30000ms
- **THEN** the `RequestInit.signal` passed to the transport SHALL be an `AbortSignal.timeout(30000)`

### Requirement: Default transport export
The system SHALL export a `defaultTransport` constant that wraps native `fetch`.

#### Scenario: defaultTransport is importable
- **WHEN** a consumer imports `defaultTransport` from the transport module
- **THEN** it SHALL be a function matching the `TransportFn` signature
- **AND** calling it SHALL delegate to native `fetch`
