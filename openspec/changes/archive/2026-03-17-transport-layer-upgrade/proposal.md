## Why

The HTTP transport layer (`RestClient`) has no retry logic, no proactive rate limiting, no automatic token refresh, and no presigned URL validation. Any transient failure (429, 5xx, network error) is immediately fatal. Both TypeScript reference implementations (`ksef-client-typescript` and `ksef-client-ts`) have these capabilities; our project is the only one missing all four (see `ref/ts-refs-comparison.md`, Architecture & Infrastructure section). This is the primary infrastructure gap blocking production use.

## What Changes

- **Pluggable transport**: Replace hardcoded `fetch()` call in `RestClient.sendRequest()` with a `TransportFn` type, defaulting to native fetch. Enables test mocking and custom HTTP backends.
- **Retry with backoff**: Add `RetryPolicy` with exponential backoff + jitter for 429, 5xx, and network errors. Respects `Retry-After` header on 429. Default: 3 retries.
- **Proactive rate limiting**: Add `RateLimitPolicy` using token bucket algorithm with global and per-endpoint quotas. Throttles requests before sending, preventing 429s.
- **Auth token refresh**: Add `AuthManager` interface for reactive token refresh on 401. On unauthorized response, attempts one token refresh and retries the request.
- **Presigned URL validation**: Add `PresignedUrlPolicy` to validate download URLs (HTTPS required, host whitelist, redirect parameter blocking) before following presigned URLs from KSeF API.
- **RestClient integration**: Wire all policies into `RestClient.sendRequest()` flow. Public API (`execute<T>()`, `executeRaw()`) signatures unchanged.
- **KSeFClient integration**: Accept transport config in `KSeFClientOptions`. Apply sensible defaults.
- **BREAKING**: `RestClient` constructor signature changes (accepts config object instead of just `ResolvedOptions`). Not a concern since the package is unpublished.

## Capabilities

### New Capabilities

- `http-transport`: Pluggable transport function type replacing hardcoded fetch. Defines `TransportFn` signature and `defaultTransport`.
- `http-retry`: Retry policy with exponential backoff + jitter. Covers retryable status codes (429/5xx), network errors, `Retry-After` header, max retries, delay caps.
- `http-rate-limiting`: Token bucket rate limiter with global RPS and per-endpoint quotas. Proactive throttling before requests are sent.
- `auth-manager`: Reactive auth token management. Injects auth headers, intercepts 401, attempts token refresh, retries once with new token.
- `presigned-url-policy`: Security validation for presigned download URLs. HTTPS enforcement, host whitelisting, redirect parameter blocking.

### Modified Capabilities

None. Existing specs are CLI-focused and unaffected by transport layer changes.

## Impact

- **Code**: `src/http/rest-client.ts` (major rewrite of `sendRequest()`), `src/http/rest-request.ts` (add `presigned` flag), `src/client.ts` (accept transport config), `src/config/options.ts` (extend options interface). 5 new files in `src/http/`.
- **APIs**: `RestClient` constructor changes (breaking, internal only). `KSeFClientOptions` gains optional transport fields. `execute()`/`executeRaw()` signatures unchanged.
- **Dependencies**: None. All implementations use native Node.js APIs (fetch, timers, crypto).
- **Tests**: ~6 new test files (~500 lines). Existing service tests unaffected (they mock at service level, not HTTP level).
