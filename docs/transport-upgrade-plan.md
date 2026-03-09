# Transport Layer Upgrade Plan

## Decisions Summary

| # | Question | Decision |
|---|----------|----------|
| 1 | Retry scope | 429 + 5xx + network errors + configurable status codes |
| 2 | Retry count | 3 (default) |
| 3 | Rate limiter | Token bucket with per-endpoint quotas |
| 4 | Proxy | Not needed (deferred) |
| 5 | Keepalive | Fetch defaults |
| 6 | Transport | Native fetch + optional transport interface (`transport?: TransportFn`) |
| 7 | Config | Separate `RetryPolicy` / `RateLimitPolicy` objects passed to `RestClient` |
| 8 | API surface | `execute()` / `executeRaw()` signatures unchanged, retry/rate limiting transparent |
| 9 | Backoff | Exponential backoff + jitter: `min(base * 2^attempt + random, maxDelay)` |
| 10 | Scope | Transport + AuthManager + PresignedUrlPolicy |
| 11 | AuthManager | Reactive — retry with token refresh on 401 |
| 12 | Presigned URL | HTTPS + host whitelist + redirect parameter check |
| 13 | Presigned URL location | Separate `PresignedUrlPolicy` passed to `RestClient`, applied to presigned-flagged requests |

## Architecture Overview

```
RestClient (updated)
  ├── transport: TransportFn          — pluggable fetch (default: native fetch)
  ├── retryPolicy: RetryPolicy        — retry config + backoff strategy
  ├── rateLimitPolicy: RateLimitPolicy — token bucket (global + per-endpoint)
  ├── authManager?: AuthManager       — reactive token refresh on 401
  ├── presignedUrlPolicy?: PresignedUrlPolicy — URL validation for downloads
  ├── execute<T>()                    — unchanged signature
  └── executeRaw()                    — unchanged signature
```

## Implementation Tasks

### Task 1: Transport interface

**Files:** `src/http/transport.ts`

Define pluggable transport function type:

```ts
export type TransportFn = (url: string, init: RequestInit) => Promise<Response>;

export const defaultTransport: TransportFn = (url, init) => fetch(url, init);
```

Update `RestClient` constructor to accept optional `transport`:

```ts
constructor(options: ResolvedOptions, config?: {
  transport?: TransportFn;
  retryPolicy?: RetryPolicy;
  rateLimitPolicy?: RateLimitPolicy;
  authManager?: AuthManager;
  presignedUrlPolicy?: PresignedUrlPolicy;
})
```

**Tests:** mock transport for all HTTP tests (no real fetch calls).

---

### Task 2: RetryPolicy + backoff with jitter

**Files:** `src/http/retry-policy.ts`

```ts
export interface RetryPolicy {
  maxRetries: number;             // default: 3
  baseDelayMs: number;            // default: 500
  maxDelayMs: number;             // default: 30_000
  retryableStatusCodes: number[]; // default: [429, 500, 502, 503, 504]
  retryNetworkErrors: boolean;    // default: true
}
```

Backoff formula: `min(baseDelayMs * 2^attempt + random(0, baseDelayMs), maxDelayMs)`

Special 429 handling: if `Retry-After` header present, use that value instead of calculated delay.

Retry logic wraps `transport()` call inside `RestClient.sendRequest()`. On each attempt:
1. Check rate limiter (Task 3) — wait if needed
2. Call transport
3. On retryable error → calculate delay → sleep → next attempt
4. On 401 + authManager present → attempt token refresh → one more retry (Task 4)
5. On success or non-retryable error → return/throw

Network errors to catch: `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `UND_ERR_CONNECT_TIMEOUT`, `AbortError` (fetch timeout).

Export `defaultRetryPolicy()` factory with sensible defaults.

**Tests:**
- Retries on 500, 502, 503, 504
- Retries on 429 with Retry-After
- Retries on network errors (ECONNRESET, timeout)
- Retries on custom status codes
- No retry on 400, 401 (without authManager), 403, 404
- Respects maxRetries limit
- Backoff delay increases exponentially
- Jitter adds randomness
- maxDelayMs caps the delay

---

### Task 3: RateLimitPolicy — token bucket

**Files:** `src/http/rate-limit-policy.ts`

```ts
export interface RateLimitConfig {
  globalRps: number;                        // default: 10 (requests per second)
  endpointLimits?: Record<string, number>;  // e.g. { '/v2/online/Session/Send': 5 }
}

export class RateLimitPolicy {
  constructor(config: RateLimitConfig);
  async acquire(endpoint: string): Promise<void>;  // waits if bucket empty
}
```

Token bucket implementation:
- Each bucket has `tokens` (starts full), `maxTokens`, `refillRate` (tokens/sec)
- `acquire()` checks tokens > 0; if not, calculates wait time and sleeps
- Global bucket + per-endpoint buckets (created lazily)
- Thread-safe via sequential promise chain (no concurrent drain)

Export `defaultRateLimitPolicy()` factory. Allow `null` to disable.

**Tests:**
- Global rate limiting works
- Per-endpoint rate limiting works
- Requests wait when bucket empty
- Bucket refills over time
- Unknown endpoints use global bucket only
- `null` policy disables rate limiting

---

### Task 4: AuthManager — reactive token refresh

**Files:** `src/http/auth-manager.ts`

```ts
export interface AuthManager {
  getAccessToken(): string | undefined;
  onUnauthorized(): Promise<string | null>;  // attempt refresh, return new token or null
}
```

Integration with retry loop in `RestClient`:
1. Before each request, inject `Authorization` header from `authManager.getAccessToken()`
2. On 401 response, call `authManager.onUnauthorized()`
3. If returns new token → retry the request once with new token
4. If returns null → throw `KSeFAuthStatusError` as before

Default implementation `DefaultAuthManager`:

```ts
export class DefaultAuthManager implements AuthManager {
  constructor(private refreshFn: () => Promise<string | null>);
  // stores current token, calls refreshFn on 401
}
```

**Tests:**
- Injects auth header
- On 401 calls onUnauthorized
- Retries with new token on successful refresh
- Throws on failed refresh (null)
- Only retries once for auth (no infinite loop)

---

### Task 5: PresignedUrlPolicy

**Files:** `src/http/presigned-url-policy.ts`

```ts
export interface PresignedUrlPolicy {
  allowedHosts: string[];     // e.g. ['*.s3.amazonaws.com', '*.ksef.mf.gov.pl']
  requireHttps: boolean;      // default: true
  blockRedirectParams: boolean; // default: true — block URLs with redirect/callback params
}
```

Validation checks:
1. **HTTPS required** — reject `http://` URLs
2. **Host whitelist** — match against allowed hosts (support wildcard `*.domain.com`)
3. **Redirect params** — reject URLs containing params like `redirect`, `callback`, `return_url`, `next`

Integration: `RestRequest` gets a `presigned: boolean` flag. In `RestClient`, before sending presigned requests, validate URL through policy. Throw `KSeFValidationError` on failure.

Export `defaultPresignedUrlPolicy()` with KSeF-specific defaults.

**Tests:**
- Rejects HTTP URLs
- Rejects unknown hosts
- Allows whitelisted hosts
- Wildcard matching works
- Blocks redirect parameters
- Passes valid presigned URLs
- Throws KSeFValidationError with descriptive message

---

### Task 6: RestClient integration

**Files:** `src/http/rest-client.ts` (update existing)

Update `sendRequest()` flow:

```
sendRequest(request)
  1. If presigned → validate URL via PresignedUrlPolicy
  2. rateLimitPolicy.acquire(endpoint)
  3. retry loop (maxRetries):
     a. inject auth header (if authManager)
     b. call transport(url, init)
     c. on success → return
     d. on 401 + authManager → refresh token → retry once
     e. on retryable error → calculate backoff → sleep → continue
     f. on non-retryable error → throw
  4. throw last error (retries exhausted)
```

Public API unchanged: `execute<T>()`, `executeRaw()`.

Constructor accepts config object (Task 1). Policies are required — `RestClient` always has retry and rate limiting. No backward compat needed (package not published yet).

**Tests:**
- With RetryPolicy → retries work
- With RateLimitPolicy → rate limiting works
- With AuthManager → token injection + refresh
- With PresignedUrlPolicy → URL validation on presigned requests
- Full integration: all policies together

---

### Task 7: KSeFClient integration

**Files:** `src/client.ts` (update existing)

- `KSeFClient` constructor accepts transport config
- Creates `RestClient` with all policies (defaults applied)
- Creates `AuthManager` wired to auth service refresh endpoint
- Passes to all services

No backward compat needed — package is not published yet. All config is required at construction time with sensible defaults.

```ts
export interface KSeFClientOptions {
  // ... existing options ...
  retry?: Partial<RetryPolicy>;         // merged with defaults
  rateLimit?: Partial<RateLimitConfig>; // merged with defaults
  transport?: TransportFn;              // default: native fetch
  presignedUrlHosts?: string[];         // additional allowed hosts
}
```

---

### Task 8: Update RestRequest

**Files:** `src/http/rest-request.ts` (update existing)

Add `presigned(flag?: boolean)` method to fluent builder:

```ts
request.get('/download/url').presigned().build();
```

Services that download from presigned URLs use this flag.

---

## Implementation Order

```
Task 1: Transport interface          (foundation)
Task 2: RetryPolicy + backoff        (core resilience)
Task 3: RateLimitPolicy              (proactive protection)
Task 5: PresignedUrlPolicy           (security)
Task 4: AuthManager                  (auth resilience)
Task 8: RestRequest.presigned()      (builder update)
Task 6: RestClient integration       (wire everything together)
Task 7: KSeFClient integration       (expose to users)
```

Tasks 1-5 are independent and can be implemented in parallel.
Task 6 depends on all of 1-5.
Task 7 depends on 6 and 8.

## Estimated Scope

| Task | New files | Lines (est.) |
|------|-----------|-------------|
| 1. Transport interface | 1 | ~20 |
| 2. RetryPolicy | 1 | ~120 |
| 3. RateLimitPolicy | 1 | ~100 |
| 4. AuthManager | 1 | ~60 |
| 5. PresignedUrlPolicy | 1 | ~80 |
| 6. RestClient update | 0 (edit) | +100 |
| 7. KSeFClient update | 0 (edit) | +30 |
| 8. RestRequest update | 0 (edit) | +10 |
| **Tests** | ~6 files | ~500 |
| **Total** | 5 new + 3 edits | ~1,020 |

## Reference Implementations

- Retry + backoff: `ref/ksef-client-ts/src/client/` (lkow, exponential + jitter)
- Token bucket: `ref/ksef-client-ts/src/client/` (lkow, per-endpoint quotas)
- Presigned URL validation: `ref/ksef-client-typescript/src/client/` (host whitelist)
- AuthManager: `ref/ksef-client-typescript/src/client/` (auto refresh with leeway)
