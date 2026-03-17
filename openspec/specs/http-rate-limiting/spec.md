## ADDED Requirements

### Requirement: Global rate limiting via token bucket
The system SHALL enforce a global requests-per-second limit using a token bucket algorithm. The default global RPS SHALL be 10. The bucket starts full and refills at the configured rate.

#### Scenario: Requests within limit pass immediately
- **WHEN** the global bucket has available tokens
- **AND** a request calls `acquire()`
- **THEN** `acquire()` SHALL resolve immediately without delay

#### Scenario: Requests exceeding limit are delayed
- **WHEN** the global bucket has 0 tokens
- **AND** a request calls `acquire()`
- **THEN** `acquire()` SHALL wait until a token becomes available via refill

#### Scenario: Bucket refills over time
- **WHEN** the global bucket is empty at `globalRps: 10`
- **AND** 100ms passes
- **THEN** 1 token SHALL be available

### Requirement: Per-endpoint rate limiting
The system SHALL support optional per-endpoint RPS limits via `endpointLimits`. A request MUST pass both the global bucket and its endpoint-specific bucket (if configured). Per-endpoint buckets SHALL be created lazily on first use.

#### Scenario: Endpoint-specific limit
- **WHEN** `endpointLimits` includes `{ '/v2/online/Session/Send': 5 }`
- **AND** a request to `/v2/online/Session/Send` calls `acquire()`
- **THEN** both the global bucket and the endpoint bucket SHALL be checked

#### Scenario: Unknown endpoint uses global only
- **WHEN** a request to `/v2/some/other/endpoint` calls `acquire()`
- **AND** no endpoint limit is configured for that path
- **THEN** only the global bucket SHALL be checked

### Requirement: Concurrency safety
The system SHALL process `acquire()` calls in order via a sequential promise chain. Concurrent calls SHALL NOT drain more tokens than available.

#### Scenario: Concurrent acquire calls are serialized
- **WHEN** 5 concurrent `acquire()` calls are made
- **AND** only 3 tokens are available
- **THEN** 3 calls SHALL resolve immediately and 2 SHALL wait for refill

### Requirement: Rate limiting is optional
The system SHALL allow rate limiting to be disabled by passing `null` as the `RateLimitPolicy`.

#### Scenario: Null policy disables rate limiting
- **WHEN** `RestClient` is created with `rateLimitPolicy: null`
- **THEN** no rate limiting SHALL be applied and requests SHALL proceed without throttling

### Requirement: Rate limit acquire placement
The system SHALL call `acquire()` once before entering the retry loop. On 429 retries, the system SHALL re-acquire a token before the next attempt.

#### Scenario: Rate limit checked once before retry loop
- **WHEN** a request is sent and the first attempt returns 503
- **THEN** `acquire()` SHALL have been called exactly once (before the first attempt)

#### Scenario: Rate limit re-acquired on 429 retry
- **WHEN** a request receives a 429 response and is retried
- **THEN** `acquire()` SHALL be called again before the retry attempt

### Requirement: Default rate limit policy factory
The system SHALL export a `defaultRateLimitPolicy()` factory that returns a `RateLimitPolicy` with `globalRps: 10` and no endpoint limits.

#### Scenario: Default policy values
- **WHEN** `defaultRateLimitPolicy()` is called
- **THEN** it SHALL return a `RateLimitPolicy` with `globalRps: 10` and empty `endpointLimits`
