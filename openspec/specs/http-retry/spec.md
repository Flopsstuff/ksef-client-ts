## ADDED Requirements

### Requirement: Retry on server errors
The system SHALL retry requests that receive HTTP status codes in the retryable set. The default retryable set SHALL be `[429, 500, 502, 503, 504]`. The retryable set SHALL be configurable.

#### Scenario: Retry on 503
- **WHEN** a request receives a 503 response
- **THEN** the system SHALL retry the request up to `maxRetries` times

#### Scenario: Retry on 429
- **WHEN** a request receives a 429 response
- **THEN** the system SHALL retry the request up to `maxRetries` times

#### Scenario: No retry on 400
- **WHEN** a request receives a 400 response
- **THEN** the system SHALL NOT retry and SHALL throw immediately

#### Scenario: No retry on 404
- **WHEN** a request receives a 404 response
- **THEN** the system SHALL NOT retry and SHALL throw immediately

#### Scenario: Custom retryable status codes
- **WHEN** `retryableStatusCodes` is configured as `[429, 500, 502, 503, 504, 409]`
- **AND** a request receives a 409 response
- **THEN** the system SHALL retry the request

### Requirement: Retry on network errors
The system SHALL retry requests that fail with network errors when `retryNetworkErrors` is `true` (default). Network errors include `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `UND_ERR_CONNECT_TIMEOUT`, and `AbortError` (fetch timeout).

#### Scenario: Retry on ECONNRESET
- **WHEN** a request fails with `ECONNRESET`
- **AND** `retryNetworkErrors` is `true`
- **THEN** the system SHALL retry the request

#### Scenario: Retry on fetch timeout (AbortError)
- **WHEN** a request fails with `AbortError` due to timeout
- **AND** `retryNetworkErrors` is `true`
- **THEN** the system SHALL retry the request

#### Scenario: No retry on network errors when disabled
- **WHEN** a request fails with `ECONNRESET`
- **AND** `retryNetworkErrors` is `false`
- **THEN** the system SHALL NOT retry and SHALL throw immediately

### Requirement: Retry all HTTP methods
The system SHALL retry all HTTP methods (GET, POST, PUT, DELETE) without idempotency checks. KSeF API POST operations are idempotent by design.

#### Scenario: POST request is retried on 503
- **WHEN** a POST request receives a 503 response
- **THEN** the system SHALL retry the POST request

#### Scenario: DELETE request is retried on 500
- **WHEN** a DELETE request receives a 500 response
- **THEN** the system SHALL retry the DELETE request

### Requirement: Exponential backoff with jitter
The system SHALL calculate retry delay using the formula: `min(baseDelayMs * 2^attempt + random(0, baseDelayMs), maxDelayMs)`. Default values: `baseDelayMs: 500`, `maxDelayMs: 30000`.

#### Scenario: First retry delay
- **WHEN** the first retry is calculated with `baseDelayMs: 500`
- **THEN** the delay SHALL be between 500ms and 1000ms (500 * 2^0 + jitter)

#### Scenario: Second retry delay
- **WHEN** the second retry is calculated with `baseDelayMs: 500`
- **THEN** the delay SHALL be between 1000ms and 1500ms (500 * 2^1 + jitter)

#### Scenario: Delay capped at maxDelayMs
- **WHEN** the calculated delay exceeds `maxDelayMs: 30000`
- **THEN** the actual delay SHALL be `30000`ms

### Requirement: Retry-After header on 429
The system SHALL use the `Retry-After` header value instead of the calculated backoff delay when a 429 response includes this header. `Retry-After` SHALL be parsed as seconds (integer) or HTTP-date.

#### Scenario: Retry-After as seconds
- **WHEN** a 429 response includes `Retry-After: 5`
- **THEN** the system SHALL wait 5 seconds before retrying

#### Scenario: Retry-After as HTTP-date
- **WHEN** a 429 response includes `Retry-After` as an HTTP-date 10 seconds in the future
- **THEN** the system SHALL wait approximately 10 seconds before retrying

#### Scenario: 429 without Retry-After
- **WHEN** a 429 response does not include a `Retry-After` header
- **THEN** the system SHALL use the standard exponential backoff formula

### Requirement: Max retries limit
The system SHALL stop retrying after `maxRetries` attempts (default: 3). After exhausting retries, the system SHALL throw the last error received.

#### Scenario: Retries exhausted
- **WHEN** a request fails 4 times (1 initial + 3 retries) with `maxRetries: 3`
- **THEN** the system SHALL throw the error from the last attempt

#### Scenario: Success on retry
- **WHEN** a request fails twice with 503 then succeeds on the third attempt
- **THEN** the system SHALL return the successful response

### Requirement: Default retry policy factory
The system SHALL export a `defaultRetryPolicy()` factory that returns: `{ maxRetries: 3, baseDelayMs: 500, maxDelayMs: 30_000, retryableStatusCodes: [429, 500, 502, 503, 504], retryNetworkErrors: true }`.

#### Scenario: Default policy values
- **WHEN** `defaultRetryPolicy()` is called
- **THEN** it SHALL return a `RetryPolicy` with the specified default values
