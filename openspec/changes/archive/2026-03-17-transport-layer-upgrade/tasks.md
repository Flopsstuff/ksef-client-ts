## 1. Transport Interface

- [x] 1.1 Create `src/http/transport.ts` with `TransportFn` type and `defaultTransport` export
- [x] 1.2 Write tests for `defaultTransport` (verifies it delegates to fetch)

## 2. Retry Policy

- [x] 2.1 Create `src/http/retry-policy.ts` with `RetryPolicy` interface and `defaultRetryPolicy()` factory
- [x] 2.2 Implement `calculateBackoff()` function (exponential + jitter formula)
- [x] 2.3 Implement `parseRetryAfter()` function (seconds and HTTP-date parsing)
- [x] 2.4 Implement `isRetryableError()` function (status code check + network error detection)
- [x] 2.5 Write tests: retries on 500, 502, 503, 504
- [x] 2.6 Write tests: retries on 429 with/without Retry-After header
- [x] 2.7 Write tests: retries on network errors (ECONNRESET, ECONNREFUSED, ETIMEDOUT, AbortError)
- [x] 2.8 Write tests: no retry on 400, 403, 404
- [x] 2.9 Write tests: maxRetries limit exhausted, success on retry
- [x] 2.10 Write tests: backoff increases exponentially, jitter adds randomness, maxDelayMs caps delay

## 3. Rate Limit Policy

- [x] 3.1 Create `src/http/rate-limit-policy.ts` with `RateLimitConfig` interface, `RateLimitPolicy` class, `defaultRateLimitPolicy()` factory
- [x] 3.2 Implement token bucket: `tokens`, `maxTokens`, `refillRate`, time-based refill
- [x] 3.3 Implement `acquire(endpoint)`: global bucket check + lazy per-endpoint bucket check
- [x] 3.4 Implement sequential promise chain for concurrency safety
- [x] 3.5 Write tests: requests within limit pass immediately
- [x] 3.6 Write tests: requests exceeding limit are delayed, bucket refills over time
- [x] 3.7 Write tests: per-endpoint limits checked alongside global
- [x] 3.8 Write tests: unknown endpoints use global only
- [x] 3.9 Write tests: concurrent acquire calls are serialized
- [x] 3.10 Write tests: null policy disables rate limiting

## 4. Auth Manager

- [x] 4.1 Create `src/http/auth-manager.ts` with `AuthManager` interface
- [x] 4.2 Implement `DefaultAuthManager` class (stores token, calls refreshFn)
- [x] 4.3 Write tests: getAccessToken returns stored token
- [x] 4.4 Write tests: onUnauthorized calls refreshFn, stores new token on success, clears on null
- [x] 4.5 Write tests: token injection into request headers
- [x] 4.6 Write tests: 401 triggers refresh → retry once with new token
- [x] 4.7 Write tests: 401 after refresh → throws (no infinite loop)
- [x] 4.8 Write tests: 401 without AuthManager → throws immediately

## 5. Presigned URL Policy

- [x] 5.1 Create `src/http/presigned-url-policy.ts` with `PresignedUrlPolicy` interface and `defaultPresignedUrlPolicy()` factory
- [x] 5.2 Implement HTTPS enforcement check
- [x] 5.3 Implement host whitelist check with wildcard matching (`*.domain.com`)
- [x] 5.4 Implement redirect parameter blocking (redirect, callback, return_url, next)
- [x] 5.5 Implement private IP rejection (IPv4 loopback/private/link-local, IPv6 loopback/private/link-local)
- [x] 5.6 Write tests: rejects HTTP URLs, accepts HTTPS, HTTP allowed when disabled
- [x] 5.7 Write tests: exact host match, wildcard match, non-matching host rejected, wildcard does not match bare domain
- [x] 5.8 Write tests: redirect params rejected, clean URLs accepted, blocking disabled
- [x] 5.9 Write tests: private IPs rejected (127.x, 10.x, 192.168.x, ::1), public IPs accepted, rejection disabled
- [x] 5.10 Write tests: KSeFValidationError thrown with descriptive message

## 6. RestRequest Update

- [x] 6.1 Add `_presigned` flag and `presigned()` method to `RestRequest` fluent builder
- [x] 6.2 Add `isPresigned()` getter to `RestRequest`
- [x] 6.3 Write tests: presigned flag defaults to false, set via builder method

## 7. RestClient Integration

- [x] 7.1 Update `RestClient` constructor to accept config object (transport, retryPolicy, rateLimitPolicy, authManager, presignedUrlPolicy)
- [x] 7.2 Rewrite `sendRequest()`: presigned validation → rate limit acquire → retry loop (transport call, auth refresh on 401, backoff on retryable, re-acquire on 429)
- [x] 7.3 Extract auth header injection logic (authManager.getAccessToken → header, respect explicit accessToken)
- [x] 7.4 Write tests: retry integration (mock transport returning failures then success)
- [x] 7.5 Write tests: rate limiting integration (mock transport, verify acquire called)
- [x] 7.6 Write tests: auth manager integration (401 → refresh → retry with new token)
- [x] 7.7 Write tests: presigned URL validation integration (presigned flag → policy checked)
- [x] 7.8 Write tests: full integration (all policies wired together)
- [x] 7.9 Update existing RestClient tests for new constructor signature

## 8. KSeFClient Integration

- [x] 8.1 Extend `KSeFClientOptions` with `retry`, `rateLimit`, `transport`, `presignedUrlHosts` fields
- [x] 8.2 Update `resolveOptions()` to merge transport config with defaults
- [x] 8.3 Update `KSeFClient` constructor to create `RestClient` with all policy instances
- [x] 8.4 Write tests: KSeFClient creates RestClient with default policies
- [x] 8.5 Write tests: KSeFClient passes custom config through to RestClient

## 9. Barrel Exports and Cleanup

- [x] 9.1 Update `src/http/index.ts` to export new modules (transport, retry-policy, rate-limit-policy, auth-manager, presigned-url-policy)
- [x] 9.2 Verify `yarn build` succeeds with no type errors
- [x] 9.3 Verify `yarn test` passes (all existing + new tests)
