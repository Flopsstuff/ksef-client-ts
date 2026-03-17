## Context

`RestClient` currently makes a single `fetch()` call per request with no resilience. The KSeF API is a government service with strict rate limits, intermittent 5xx errors, and token-based sessions with limited lifetimes. Both TypeScript reference implementations solve these problems — `ksef-client-typescript` (npm) has retry + auth manager + presigned URL validation, `ksef-client-ts` (lkow) has retry + rate limiter. Our project has none of these, making it the only TS KSeF client unsuitable for production workloads.

Current `RestClient.sendRequest()` flow (31 lines): build URL → set headers → `fetch()` → log → return. New flow adds transport abstraction, rate limiting gate, retry loop with backoff, auth refresh, and presigned URL validation — all transparent to callers.

## Goals / Non-Goals

**Goals:**
- Retry transient failures (429, 5xx, network errors) with exponential backoff + jitter
- Proactively throttle requests via token bucket to avoid triggering 429s
- Automatically refresh expired auth tokens on 401 (one retry)
- Validate presigned download URLs against SSRF attacks
- Allow transport replacement for testing and custom HTTP backends
- Zero changes to `execute<T>()` / `executeRaw()` signatures
- Zero new runtime dependencies

**Non-Goals:**
- Proxy support (deferred — neither our users nor KSeF infra require it today)
- HTTP keepalive tuning (fetch defaults are sufficient)
- Proactive auth refresh with JWT expiry tracking (reactive 401 is simpler and sufficient)
- Per-request retry overrides (can be added later if needed)
- Circuit breaker pattern (premature for current usage patterns)
- Offline mode (separate future change)

## Decisions

### D1: Transport abstraction — function type, not class

**Decision:** `TransportFn = (url: string, init: RequestInit) => Promise<Response>`

**Alternatives:**
- **Class-based HttpClient** (both refs use this) — more ceremony, no benefit when we already have `RestClient` as the class
- **Middleware chain** (Express-style) — over-engineered for 5 concerns

**Rationale:** A single function type is the minimal surface to enable test mocking and custom backends. `defaultTransport` is a one-liner wrapping `fetch`. No class hierarchy, no interface to implement for simple cases — just pass a function.

### D2: Retry — all methods, with Retry-After respect

**Decision:** Retry on `[429, 500, 502, 503, 504]` + network errors. Retry ALL HTTP methods (GET, POST, PUT, DELETE).

**Alternatives:**
- **Idempotency check** (npm ref: only retry GET/PUT/DELETE, skip POST/PATCH) — safer for general APIs, but KSeF POST endpoints are idempotent by design (invoice submission returns same KSeF number on re-submit, session init is recoverable)
- **Only retry 429** (lkow ref: no explicit 5xx retry) — too conservative, KSeF returns 502/503 during maintenance

**Rationale:** KSeF API POST operations are either idempotent (invoice send) or recoverable (session init). Network errors during POST are indistinguishable from success-but-lost-response — the user would retry manually anyway. Retrying automatically is strictly better.

**Backoff formula:** `min(baseDelayMs * 2^attempt + random(0, baseDelayMs), maxDelayMs)`
- Base: 500ms, max: 30s, default 3 retries
- On 429 with `Retry-After` header: use server-specified delay instead of calculated
- Jitter range equals base delay (wider than npm's fixed 250ms) to better spread concurrent retries

### D3: Rate limiter — single-tier token bucket

**Decision:** Token bucket with global RPS + optional per-endpoint RPS. Single time window (per-second).

**Alternatives:**
- **Multi-tier sliding window** (lkow ref: second/minute/hour buckets) — more accurate for KSeF's multi-tier limits, but significantly more complex and harder to configure
- **No client-side rate limiting** (npm ref: rely on 429 + retry) — reactive only, causes unnecessary 429 errors under sustained load
- **Leaky bucket** — constant drain rate doesn't handle burst patterns well

**Rationale:** Token bucket is the simplest algorithm that prevents sustained overload. Single-tier (per-second) is sufficient because: (1) KSeF's per-second limit is the binding constraint, (2) per-minute/hour limits are proportional and won't be hit if per-second is respected, (3) users can tune `globalRps` down for extra safety. Per-endpoint overrides handle the few stricter endpoints (e.g., invoice send).

**Concurrency safety:** Sequential promise chain — each `acquire()` resolves in order, preventing concurrent token drain. No mutex needed in single-threaded Node.js, but async operations can interleave without this.

### D4: Auth refresh — reactive on 401, not proactive

**Decision:** On 401 response, call `authManager.onUnauthorized()` → if new token returned, retry request once. Interface-based with `DefaultAuthManager` implementation.

**Alternatives:**
- **Proactive with JWT expiry + leeway** (npm ref: checks `exp` claim, refreshes 60s before expiry) — avoids one wasted request per token expiry, but requires JWT parsing and knowledge of token format
- **No auth management** (lkow ref: token passed per-request by service layer) — simplest, but forces every service to handle 401

**Rationale:** Reactive is simpler and token-format-agnostic. The cost is one failed request per token expiry (~once per session lifetime), which is negligible. The interface (`AuthManager`) is minimal (2 methods), making it easy to implement custom refresh logic. `DefaultAuthManager` covers the common case (store token + call refresh callback).

**Safety:** Exactly one refresh attempt per 401. If refresh succeeds, retry the original request with new token. If refresh fails (returns `null`), throw immediately. This prevents infinite 401→refresh→401 loops.

### D5: Presigned URL validation — HTTPS + host whitelist + redirect params + private IP rejection

**Decision:** Validate presigned URLs before following them. Check: HTTPS required, host whitelist (with wildcard), redirect parameter blocking, private/reserved IP rejection.

**Alternatives:**
- **HTTPS + host whitelist only** (original plan) — misses SSRF via private IPs (e.g., `https://10.0.0.1/...`)
- **Full npm ref approach** (hostname, IPv4, IPv6 range checks, localhost) — comprehensive but many edge cases
- **No validation** — unacceptable for a client that follows server-provided URLs

**Rationale:** Added private IP rejection beyond the original plan after reviewing the npm ref's `validatePresignedUrlSecurity()`. SSRF via private IPs is a real risk when the server returns arbitrary URLs. The implementation is straightforward — reject known private ranges (127.x, 10.x, 172.16-31.x, 192.168.x, ::1, fc00::/7). Combined with host whitelist, this provides defense in depth.

**Integration:** `RestRequest` gains a `_presigned: boolean` flag. `RestClient` checks the flag before sending and validates via `PresignedUrlPolicy`. Services that download from presigned URLs (invoice download, UPO) set this flag.

### D6: Config — separate policy objects, not flat options

**Decision:** `RestClient` constructor takes `ResolvedOptions` + a config object with typed policy instances. `KSeFClientOptions` exposes `Partial<>` versions merged with defaults.

**Alternatives:**
- **Single flat options** (both refs: all config in one `HttpClientOptions`) — simpler but mixes concerns (retry timing, rate limits, auth, URL validation)
- **Builder pattern** — unnecessary ceremony for one-time construction

**Rationale:** Separate policies (`RetryPolicy`, `RateLimitPolicy`, `AuthManager`, `PresignedUrlPolicy`) can be unit-tested independently, swapped independently, and documented independently. The `KSeFClientOptions` interface merges them at the user-facing level with `Partial<>` for ergonomics.

```
KSeFClientOptions (user-facing, partial)
  → resolveOptions() merges defaults
  → RestClient receives concrete policy instances
```

### D7: sendRequest() flow — rate limit before retry loop

**Decision:** Rate limiting happens once before entering the retry loop, not on every retry attempt.

**Alternatives:**
- **Rate limit on every attempt** — more accurate throttling but penalizes the client for server errors
- **Rate limit only on first attempt** (chosen) — fair: the client did its part, server errors shouldn't consume more rate budget

**Rationale:** If the server returns 503, retrying after backoff shouldn't require re-acquiring a rate limit token. The client already "spent" its rate budget on the first attempt. Retries are inherently low-volume (max 3 per request) and spaced by backoff delays, so they won't cause rate limit pressure.

Exception: 429 retries DO re-acquire because the server explicitly said "slow down."

## Risks / Trade-offs

**[Risk] Retrying non-idempotent POST creates duplicates** → Mitigation: KSeF POST operations are idempotent by design (invoice send returns same KSeF number, session endpoints are recoverable). Document this assumption. If a non-idempotent endpoint is added to KSeF API in the future, services can disable retry per-request (future enhancement).

**[Risk] Token bucket global RPS default too low/high** → Mitigation: Default 10 RPS is conservative. KSeF doesn't publish official per-second limits, so we start low. Users can adjust via `rateLimit.globalRps`. Monitoring via consola debug logs shows when rate limiting kicks in.

**[Risk] Reactive auth refresh wastes one request** → Mitigation: Acceptable trade-off for simplicity. Sessions last 20+ minutes; one wasted request per session is negligible. Can upgrade to proactive (JWT expiry check) later without changing the `AuthManager` interface.

**[Risk] Private IP validation may block legitimate corporate setups** → Mitigation: `PresignedUrlPolicy` is configurable. Corporate users behind NAT accessing KSeF through internal proxies can add hosts to `allowedHosts` or set `rejectPrivateIps: false`.

**[Risk] Retry + rate limiting adds latency to every request** → Mitigation: Fast path is zero-overhead — retry loop exits immediately on success, token bucket `acquire()` returns immediately when tokens available. Only failing/throttled requests pay the cost.
