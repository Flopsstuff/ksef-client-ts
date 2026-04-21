# HTTP Resilience Layer

Deep dive into the HTTP transport layer that handles retries, rate limiting, authentication, and security validation. This layer sits between service methods and the network, providing transparent resilience for every API call.

---

## Overview

Every request from a KSeF service passes through `RestClient` (`src/http/rest-client.ts`), which orchestrates five pluggable policies in a fixed order:

```text
Service call
  │
  ▼
RestClient.sendRequest()
  │
  ├── 1. Presigned URL Validation   (src/http/presigned-url-policy.ts)
  │      Reject unsafe URLs before any network I/O
  │
  ├── 2. Rate Limit Acquire          (src/http/rate-limit-policy.ts)
  │      Wait for a token from the global + endpoint buckets
  │
  ├── 3. Circuit Breaker Check       (src/http/circuit-breaker-policy.ts; opt-in)
  │      If open and within cooldown → throw KSeFCircuitOpenError
  │      Otherwise pass through; record success/failure after the request
  │
  ├── 4. Retry Loop                  (src/http/retry-policy.ts)
  │   │
  │   ├── doRequest() ──► transport(url, init) ──► network
  │   │
  │   ├── On 401 (first attempt only):
  │   │     └── AuthManager.onUnauthorized() ──► refresh token ──► retry once
  │   │
  │   ├── On retryable status (429, 5xx):
  │   │     ├── Calculate delay (Retry-After or exponential backoff)
  │   │     ├── Sleep
  │   │     ├── Re-acquire rate limit token (429 only)
  │   │     └── Continue loop
  │   │
  │   └── On network error (ECONNRESET, ETIMEDOUT, ...):
  │         ├── Calculate backoff delay
  │         ├── Sleep
  │         └── Continue loop
  │
  ▼
RestClient.ensureSuccess()
  │
  ├── 429 → KSeFRateLimitError
  ├── 401 → KSeFUnauthorizedError
  ├── 403 → KSeFForbiddenError
  └── other → KSeFApiError
```

The order matters:

1. **Presigned URL validation** runs first because there is no point acquiring a rate limit token or retrying a request to a malicious URL.
2. **Rate limit acquire** runs once, before the retry loop, so retries don't consume additional rate limit tokens (except on 429, where a re-acquire is needed because the server rejected the request).
3. **Circuit breaker check** runs after rate-limit acquire and before the retry loop. An open circuit short-circuits with `KSeFCircuitOpenError` — the retry loop never starts, so a single outage consumes one retry budget instead of one-per-request. After the retry loop finishes, the breaker records a success or failure based on the final outcome. 429 and 401 responses never count as failures.
4. **Auth refresh** runs inside the retry loop but only on the first attempt and only for 401 responses. If refresh succeeds, the request is retried once with the new token. If it fails, the 401 propagates.
5. **Error dispatch** happens after the retry loop is exhausted. The body is read once and parsed per status code in a fixed priority: 429 > 401 > 403 > generic.

---

## Files

All source files are in `src/http/`:

| File | Role |
|------|------|
| `rest-client.ts` | Central orchestrator. Wires all policies together in `sendRequest()`. |
| `retry-policy.ts` | Retry policy interface, exponential backoff with jitter, `Retry-After` parsing. |
| `rate-limit-policy.ts` | Token bucket rate limiter with global + per-endpoint buckets. |
| `circuit-breaker-policy.ts` | Opt-in circuit breaker: opens after N consecutive network/5xx failures, probes after cooldown. |
| `auth-manager.ts` | `AuthManager` interface + `DefaultAuthManager` with dedup refresh. |
| `presigned-url-policy.ts` | Presigned URL security validation (SSRF, private IP, redirect params). |
| `rest-request.ts` | Fluent request builder (`GET`/`POST`/`PUT`/`DELETE`, headers, query, body). |
| `rest-response.ts` | Generic typed response wrapper (`body`, `headers`, `statusCode`). |
| `route-builder.ts` | Prepends API version prefix (`/v2/`) to endpoint paths. |
| `routes.ts` | All KSeF API endpoint paths as `const` object. |
| `transport.ts` | `TransportFn` type alias + `defaultTransport` (native `fetch`). |
| `ksef-feature.ts` | `X-KSeF-Feature` header constants (`UpoVersion`, `ENFORCE_XADES_COMPLIANCE`). |
| `index.ts` | Barrel re-exports. |

---

## RestClient

**File:** `src/http/rest-client.ts`

The central class of the HTTP layer. Every service (e.g., `AuthService`, `OnlineSessionService`) holds a `RestClient` instance and calls one of three execute methods:

| Method | Returns | Use case |
|--------|---------|----------|
| `execute<T>(request)` | `RestResponse<T>` (parsed JSON) | Most API calls |
| `executeVoid(request)` | `void` | Calls that return no body (e.g., `DELETE`) |
| `executeRaw(request)` | `RestResponse<ArrayBuffer>` | Binary downloads (UPO, invoice XML) |

All three call `sendRequest()` internally, which runs the full policy pipeline.

### Request lifecycle in sendRequest()

```typescript
// src/http/rest-client.ts, lines 71-131
private async sendRequest(request: RestRequest): Promise<Response> {
  // 1. Presigned URL validation (synchronous, throws on failure)
  // 2. Rate limit acquire (async, waits for token)
  // 3. Retry loop: for attempt = 0..maxRetries
  //    a. doRequest() — build headers, inject auth, call transport
  //    b. On 401 + first attempt: try auth refresh, retry once
  //    c. On retryable status: sleep(backoff), re-acquire on 429, continue
  //    d. On network error: sleep(backoff), continue
  // 4. Return response or throw last error
}
```

### Header injection in doRequest()

```typescript
// src/http/rest-client.ts, lines 133-167
private async doRequest(request: RestRequest, url: string, overrideToken?: string) {
  // Merge: customHeaders (client-level) + request headers
  // Auth: explicit header on request wins; otherwise AuthManager.getAccessToken()
  // Content-Type: defaults to application/json if body is present
  // Timeout: AbortSignal.timeout(options.timeout)
  // Logging: consola.debug with method, URL, status, elapsed time
}
```

Priority for `Authorization` header:
1. Explicit `request.accessToken('...')` — used for challenge/redeem flows that use a different token
2. `overrideToken` — passed after auth refresh
3. `authManager.getAccessToken()` — the stored session token

---

## Retry Policy

**File:** `src/http/retry-policy.ts`

### Configuration

```typescript
interface RetryPolicy {
  maxRetries: number;           // default: 3
  baseDelayMs: number;          // default: 500
  maxDelayMs: number;           // default: 30000
  retryableStatusCodes: number[]; // default: [429, 500, 502, 503, 504]
  retryNetworkErrors: boolean;  // default: true
}
```

### Backoff formula

```text
delay = min(baseDelayMs * 2^attempt + random(0, baseDelayMs), maxDelayMs)
```

| Attempt | Base delay | Exponential | + Jitter (max) | Capped at |
|---------|-----------|-------------|----------------|-----------|
| 0 | 500ms | 500ms | 500-1000ms | 30s |
| 1 | 500ms | 1000ms | 1000-1500ms | 30s |
| 2 | 500ms | 2000ms | 2000-2500ms | 30s |
| 3 | 500ms | 4000ms | 4000-4500ms | 30s |

The jitter is uniform random `[0, baseDelayMs)` added to the exponential value. This prevents thundering herd when multiple clients retry simultaneously.

### Retry-After header

For 429 responses, the server may include a `Retry-After` header. If present, it overrides the calculated backoff:

```typescript
// src/http/retry-policy.ts, lines 25-39
function parseRetryAfter(header: string | null): number | null {
  // Try as integer seconds: "120" → 120000ms
  // Try as HTTP-date: "Thu, 28 Mar 2026 12:00:00 GMT" → diff from now
  // Returns null if unparseable
}
```

### Retryable errors

**HTTP status codes:** `429`, `500`, `502`, `503`, `504` (configurable via `retryableStatusCodes`).

**Network errors** (when `retryNetworkErrors: true`):

| Error | Cause |
|-------|-------|
| `ECONNRESET` | Server closed the connection |
| `ECONNREFUSED` | Server not reachable |
| `ETIMEDOUT` | Connection timeout |
| `UND_ERR_CONNECT_TIMEOUT` | Undici connect timeout |
| `AbortError` | Fetch timeout (`AbortSignal.timeout`) |

### Why all HTTP methods are retried

KSeF API operations are idempotent by design. Submitting the same invoice returns the same KSeF number. Opening a session with the same challenge returns the same reference. This makes it safe to retry POST requests.

---

## Rate Limiter

**File:** `src/http/rate-limit-policy.ts`

### Token bucket algorithm

The rate limiter uses a token bucket algorithm. Each bucket starts full and refills continuously at a fixed rate:

```text
              ┌─────────────────────┐
              │   Token Bucket      │
              │                     │
  refill ───►│  tokens: 10/10      │───► acquire() → proceed
  (rps/1000  │  maxTokens: 10      │    (consumes 1 token)
   per ms)   │  refillRate: 0.01/ms│
              └─────────────────────┘
                       │
                 tokens < 1?
                       │
                  wait (1-tokens)/refillRate ms
                       │
                  refill + acquire
```

**Key properties:**
- **Burst capacity** = `maxTokens` = RPS. A fresh bucket allows a burst of RPS requests instantly.
- **Sustained rate** = RPS requests per second. After the burst, requests are spaced by `1000/rps` ms.
- **No rejection** — `acquire()` always resolves, it just delays until a token is available.

### Two-tier buckets

Every request must pass through both:

1. **Global bucket** — shared across all endpoints (default: 10 RPS)
2. **Endpoint bucket** — per-endpoint limit, created lazily on first use (optional)

```typescript
// src/http/rate-limit-policy.ts, lines 60-72
private async doAcquire(endpoint: string): Promise<void> {
  await this.globalBucket.acquire();        // global limit first
  // then endpoint-specific limit (if configured)
  const limit = this.endpointLimits[endpoint];
  if (limit !== undefined) {
    let bucket = this.endpointBuckets.get(endpoint);
    if (!bucket) {
      bucket = new TokenBucket(limit);
      this.endpointBuckets.set(endpoint, bucket);
    }
    await bucket.acquire();
  }
}
```

### Concurrency safety

All `acquire()` calls are serialized through a promise chain:

```typescript
// src/http/rate-limit-policy.ts, lines 52-58
async acquire(endpoint: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    this.chain = this.chain
      .then(() => this.doAcquire(endpoint))
      .then(resolve, reject);
  });
}
```

This ensures that even when 50 concurrent requests call `acquire()` at once, they are processed one-by-one in FIFO order. Without this chain, multiple requests could simultaneously read the same token count and overconsume.

### Rate limit and retries interaction

- Rate limit is acquired **once** before the retry loop.
- On 429 (server rejected despite client-side limiting), the rate limit is **re-acquired** before retrying. This adds an extra delay, naturally backing off.
- On non-429 retries (500, 502, etc.), no re-acquire happens because the server didn't reject for rate reasons.

```text
acquire() → attempt 0 → 429 → sleep(Retry-After) → re-acquire() → attempt 1 → 200 OK
acquire() → attempt 0 → 502 → sleep(backoff)                    → attempt 1 → 200 OK
```

---

## Circuit Breaker

**File:** `src/http/circuit-breaker-policy.ts`

The circuit breaker is **opt-in** — omitting the `circuitBreaker` client option keeps the feature off and preserves the four-policy pipeline. When enabled, it sits above the retry loop and short-circuits with `KSeFCircuitOpenError` while an upstream is known to be unavailable, so a burst of requests during an outage consumes one retry budget instead of `retries × requests`.

### Configuration

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;        // default: 5
  openMs: number;                  // default: 30000 (cooldown in ms)
  scope?: 'global' | 'endpoint';   // default: 'global'
}
```

| Field | Purpose |
|-------|---------|
| `failureThreshold` | Number of consecutive failures within a sliding window (of `openMs`) before the breaker opens. |
| `openMs` | Cooldown window after opening. During this time, all matching requests fail fast. After it elapses, one probe request is allowed through. |
| `scope` | `'global'` counts failures across every endpoint (one breaker for the whole client). `'endpoint'` keeps per-endpoint state, so an outage on one route doesn't trip the others. |

### State machine

```text
           ┌───────────┐   failureThreshold consecutive failures
           │  CLOSED   │──────────────────────────────────────────┐
           │ (normal)  │                                          │
           └───────────┘                                          ▼
                 ▲                                         ┌───────────┐
                 │                                         │   OPEN    │
                 │ success (any response, including 4xx/429)│ (fail fast)│
                 │                                         └───────────┘
                 │                                                │
                 │             openMs elapses                     │
                 │             ┌──────────────────────────────────┘
                 │             ▼
                 │       ┌──────────┐   failure → reset timer, stay OPEN
                 └───────│  PROBE   │
                   ok    └──────────┘
```

The breaker stays open only for `openMs`. After the cooldown, the next request is a **probe** — the breaker lets it through but does not yet reset. If it succeeds, state is cleared and subsequent traffic flows normally. If the probe fails, the breaker re-opens for another `openMs`.

### What counts as a failure

| Outcome | Counted? |
|---------|----------|
| Network error (`ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`, etc.) | **Yes** |
| 5xx response after retries exhausted | **Yes** |
| 429 Too Many Requests | **No** (rate limiting is not an outage) |
| 401 Unauthorized | **No** (auth problem, not availability) |
| 2xx / 4xx (other than 401/429) | **No** (records success) |

This matches the intent: a breaker protects against upstream *unavailability*, not against client mistakes or throttling.

### Interaction with retry policy

- Breaker is checked **before** the retry loop. An open breaker raises `KSeFCircuitOpenError` immediately — no attempts, no backoff.
- While the breaker is closed (or during a probe), the retry loop runs normally. Success or final failure is recorded after the loop finishes, so transient failures that recover via retry do not count against the breaker.
- Rate-limit (429) responses never open or extend the breaker.

### Usage

```typescript
// Enable with defaults (failureThreshold: 5, openMs: 30s, scope: 'global')
const client = new KSeFClient({
  environment: 'PROD',
  circuitBreaker: {},
});

// Tuned for a latency-sensitive workflow
const client = new KSeFClient({
  environment: 'PROD',
  circuitBreaker: { failureThreshold: 3, openMs: 60_000, scope: 'endpoint' },
});
```

Handle `KSeFCircuitOpenError` where appropriate:

```typescript
import { KSeFCircuitOpenError } from 'ksef-client-ts';

try {
  await client.invoices.sendInvoice(xml);
} catch (err) {
  if (err instanceof KSeFCircuitOpenError) {
    // Upstream recently failed multiple times — skip, drop to a local queue, or notify oncall
    await parkForLater(xml, err.retryAfterMs);
    return;
  }
  throw err;
}
```

---

## Auth Manager

**File:** `src/http/auth-manager.ts`

### Interface

```typescript
interface AuthManager {
  getAccessToken(): string | undefined;
  setAccessToken(token: string | undefined): void;
  getRefreshToken(): string | undefined;
  setRefreshToken(token: string | undefined): void;
  onUnauthorized(): Promise<string | null>;  // called on 401
}
```

Services never interact with `AuthManager` directly for requests. `RestClient.doRequest()` reads the token via `getAccessToken()` and injects it as `Authorization: Bearer <token>`. The login workflows (`loginWithToken`, `loginWithCertificate`) call `setAccessToken()` and `setRefreshToken()` after a successful ceremony.

### Dedup refresh mechanism

The key feature of `DefaultAuthManager` is deduplication of concurrent refresh calls:

```typescript
// src/http/auth-manager.ts, lines 36-47
async onUnauthorized(): Promise<string | null> {
  if (this.refreshPromise) return this.refreshPromise;  // reuse in-flight refresh
  this.refreshPromise = this.refreshFn()
    .then(newToken => {
      this.token = newToken ?? undefined;
      return newToken;
    })
    .finally(() => {
      this.refreshPromise = null;                        // clear after completion
    });
  return this.refreshPromise;
}
```

**Why this matters:** When 10 concurrent requests all receive 401 at the same time, they all call `onUnauthorized()`. Without dedup, all 10 would hit the refresh endpoint — 9 of which would fail (the first refresh invalidates the old refresh token). With dedup, only the first call triggers the actual refresh; the other 9 await the same promise and receive the same new token.

### Auth refresh in the request lifecycle

```typescript
// src/http/rest-client.ts, lines 91-97
if (response.status === 401 && this.authManager && attempt === 0 && !request.isSkipAuthRetry()) {
  const newToken = await this.authManager.onUnauthorized();
  if (newToken) {
    return this.doRequest(request, url, newToken);  // one retry with new token
  }
}
```

Guard conditions:
- `attempt === 0` — only on the first attempt, not during retries
- `!request.isSkipAuthRetry()` — skipped for auth endpoints themselves (prevents infinite loops: refresh → 401 → refresh → 401 → ...)
- If `onUnauthorized()` returns `null` (refresh failed), the 401 falls through to `ensureSuccess()` which throws `KSeFUnauthorizedError`

### Custom AuthManager

Implement the `AuthManager` interface for custom token storage (e.g., Redis, file system, encrypted store):

```typescript
const client = new KSeFClient({
  authManager: {
    getAccessToken: () => redis.get('ksef:access'),
    setAccessToken: (t) => redis.set('ksef:access', t),
    getRefreshToken: () => redis.get('ksef:refresh'),
    setRefreshToken: (t) => redis.set('ksef:refresh', t),
    onUnauthorized: async () => { /* your refresh logic */ },
  },
});
```

---

## Presigned URL Validation

**File:** `src/http/presigned-url-policy.ts`

When the KSeF API returns presigned download URLs (for export packages, UPO files), these URLs point to external storage. Before following them, `RestClient` validates the URL against a security policy to prevent SSRF (Server-Side Request Forgery) attacks.

### Policy configuration

```typescript
interface PresignedUrlPolicy {
  allowedHosts: string[];       // default: ['*.ksef.mf.gov.pl']
  requireHttps: boolean;        // default: true
  blockRedirectParams: boolean;  // default: true
  rejectPrivateIps: boolean;    // default: true
}
```

### Validation checks (in order)

Checks run sequentially. The first failure throws `KSeFValidationError` and aborts the request — no network I/O occurs.

#### 1. HTTPS enforcement

```typescript
if (policy.requireHttps && parsed.protocol !== 'https:') {
  throw new KSeFValidationError(`Presigned URL must use HTTPS: ${url}`);
}
```

Prevents downgrade attacks. Always enabled in production.

#### 2. Host allowlist

```typescript
function matchesAllowedHost(hostname: string, allowedHosts: string[]): boolean {
  // '*.ksef.mf.gov.pl' matches 'api-test.ksef.mf.gov.pl' but NOT 'ksef.mf.gov.pl'
  // 'cdn.example.com' matches exactly 'cdn.example.com'
}
```

Wildcard patterns (`*.domain.com`) match any subdomain (at least one label before the suffix). This prevents an attacker from crafting a redirect through a compromised API response.

Additional hosts are added via `presignedUrlHosts` in client options and merged with the default `['*.ksef.mf.gov.pl']`.

#### 3. Redirect parameter blocking

URLs containing these query parameters are rejected (case-insensitive):

| Parameter | Reason |
|-----------|--------|
| `redirect` | Open redirect |
| `callback` | JSONP/callback injection |
| `return_url` | Post-action redirect |
| `next` | Post-action redirect |

This prevents open redirect attacks where a valid host returns a 302 to a malicious URL.

#### 4. Private IP rejection

DNS rebinding defense. If the hostname resolves to a private/reserved IP, the request is blocked:

**IPv4:**
| Range | Type |
|-------|------|
| `127.0.0.0/8` | Loopback |
| `10.0.0.0/8` | Private (Class A) |
| `172.16.0.0/12` | Private (Class B) |
| `192.168.0.0/16` | Private (Class C) |
| `169.254.0.0/16` | Link-local |

**IPv6:**
| Range | Type |
|-------|------|
| `::1` | Loopback |
| `fc00::/7` (`fc`, `fd`) | Unique local |
| `fe80::/10` | Link-local |

IPv6 addresses in bracket notation (`[::1]`) are handled correctly.

### When presigned URL validation runs

Only for requests explicitly marked as presigned:

```typescript
const request = RestRequest.get(downloadUrl).presigned();
```

Regular API requests to the KSeF base URL are not validated against the presigned URL policy.

---

## Error Dispatch

**File:** `src/http/rest-client.ts`, `ensureSuccess()` method (lines 182-215)

After the retry loop is exhausted and a non-2xx response remains, `ensureSuccess()` reads the body text **once** and attempts to parse it as JSON per status code:

```text
Response not OK?
  │
  ├── 429 → parse as TooManyRequestsResponse → throw KSeFRateLimitError
  │         (includes Retry-After header parsing)
  │
  ├── 401 → parse as UnauthorizedProblemDetails → throw KSeFUnauthorizedError
  │         (only if body has .detail field — RFC 7807 format)
  │
  ├── 403 → parse as ForbiddenProblemDetails → throw KSeFForbiddenError
  │         (only if body has .reasonCode field — RFC 7807 format)
  │
  └── any → parse as ApiErrorResponse → throw KSeFApiError
            (generic fallback for all other status codes)
```

The dispatch order (429 > 401 > 403 > generic) is intentional. A 429 that also has `detail` in the body should be treated as rate limiting, not as unauthorized. Each check is exclusive — once a specific error type is thrown, no further checks run.

---

## RestRequest Builder

**File:** `src/http/rest-request.ts`

Fluent builder for constructing HTTP requests. Every service method creates a `RestRequest` and passes it to `RestClient.execute()`.

```typescript
// Typical usage in a service:
const request = RestRequest.post(Routes.OnlineSession.Open)
  .body(openSessionPayload)
  .header('X-KSeF-Feature', 'upo-v4-3');

const response = await this.restClient.execute<OpenOnlineSessionResponse>(request);
```

### Flags

| Flag | Method | Effect in RestClient |
|------|--------|---------------------|
| `presigned` | `.presigned()` | Triggers presigned URL validation |
| `skipAuthRetry` | `.skipAuthRetry()` | Skips 401 → auth refresh → retry cycle (used by auth endpoints themselves) |

### Header priority

1. `request.accessToken('...')` sets an explicit `Authorization` header — takes precedence over everything
2. `request.header(name, value)` and `request.headers({...})` — merged into the request
3. In `RestClient.doRequest()`, `customHeaders` (client-level) are merged first, then request headers override
4. If no `Authorization` header exists after merge, `AuthManager.getAccessToken()` provides the default

---

## Transport Layer

**File:** `src/http/transport.ts`

```typescript
type TransportFn = (url: string, init: RequestInit) => Promise<Response>;
const defaultTransport: TransportFn = (url, init) => fetch(url, init);
```

The transport is a plain function matching the `fetch` signature. It receives the fully constructed URL and `RequestInit` (method, headers, body, `AbortSignal`). Replace it for:

- **Testing**: Return mock `Response` objects without network
- **Logging**: Wrap `fetch` with timing and request/response logging
- **Proxying**: Use `undici.ProxyAgent` for corporate proxies
- **Metrics**: Track request counts, latencies, error rates

See [Configuration — Custom Transport](./configuration.md#custom-transport) for examples.

---

## Route Builder

**File:** `src/http/route-builder.ts`

Prepends the API version prefix to endpoint paths:

```typescript
class RouteBuilder {
  build(endpoint: string): string {
    return `/${this.apiVersion}/${endpoint}`;
    // e.g., 'online/Session/Open' → '/v2/online/Session/Open'
  }
}
```

Endpoint paths are defined as constants in `src/http/routes.ts` and referenced by services. This ensures URL consistency and makes API version migration a one-line change.

---

## How Policies Compose

The four policies are independent and pluggable. Each can be configured, replaced, or disabled:

| Policy | Disable | Replace |
|--------|---------|---------|
| Retry | `retry: { maxRetries: 0 }` | Provide a full `RetryPolicy` object |
| Rate Limit | `rateLimit: null` | Provide a custom `RateLimitPolicy` instance |
| Circuit Breaker | Omit `circuitBreaker` (off by default) or `circuitBreaker: null` | Provide a `Partial<CircuitBreakerConfig>` |
| Auth Manager | Don't call `loginWith*()` | Provide a custom `AuthManager` implementation |
| Presigned URL | Remove `presignedUrlHosts` (default still active) | Provide a custom `PresignedUrlPolicy` |

The composition happens in `RestClient`'s constructor (`src/http/rest-client.ts`, lines 42-50), where each policy is stored as an optional field. `sendRequest()` checks for nullability before invoking each policy.

### Example: request flow with all policies active

```text
1. Service: client.invoices.exportInvoices(request)
2. Service builds: RestRequest.post('online/Invoice/Export').body(request)
3. RestClient.execute() → sendRequest()
4. buildUrl(): 'https://api-test.ksef.mf.gov.pl/v2/online/Invoice/Export'
5. Presigned URL validation: SKIP (not marked as presigned)
6. Rate limit acquire: wait for global bucket token (10 RPS)
7. Retry loop, attempt 0:
   a. doRequest(): inject auth header, POST, 30s timeout
   b. Response: 200 → return
8. ensureSuccess(): status OK → skip
9. Parse JSON → return RestResponse<T>
```

### Example: presigned download with 429 retry

```text
1. Service: download from presigned URL
2. Service builds: RestRequest.get(presignedUrl).presigned()
3. RestClient.executeRaw() → sendRequest()
4. Presigned URL validation: check HTTPS, host, redirect params, private IP → PASS
5. Rate limit acquire: wait for global bucket token
6. Retry loop, attempt 0:
   a. doRequest(): GET presigned URL with auth header
   b. Response: 429, Retry-After: 5
   c. parseRetryAfter('5') → 5000ms
   d. sleep(5000ms)
   e. Re-acquire rate limit token (429 path)
7. Retry loop, attempt 1:
   a. doRequest(): same request
   b. Response: 200 → return
8. Read ArrayBuffer → return RestResponse<ArrayBuffer>
```
