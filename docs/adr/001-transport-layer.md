# ADR-001: Transport Layer Resilience

- **Date:** 2026-03-17
- **Status:** Accepted

## Context

`RestClient` originally made a single `fetch()` call per request with no resilience. The KSeF API is a government service with strict rate limits, intermittent 5xx errors, and token-based sessions with limited lifetimes. Both TypeScript reference implementations had retry and rate limiting; ours had none.

## Decisions

### Transport abstraction: function type, not class

`TransportFn = (url: string, init: RequestInit) => Promise<Response>`

A single function type is the minimal surface to enable test mocking and custom backends. `defaultTransport` is a one-liner wrapping `fetch`. No class hierarchy needed — `RestClient` already serves as the class.

**Rejected:** Class-based `HttpClient` (both refs use this) — more ceremony, no benefit. Middleware chain (Express-style) — over-engineered for 5 concerns.

### Retry: all HTTP methods, with Retry-After respect

Retry on `[429, 500, 502, 503, 504]` + network errors. Retry **all** HTTP methods including POST.

**Key insight:** KSeF POST operations are idempotent by design — invoice submission returns the same KSeF number on re-submit, session init is recoverable. Network errors during POST are indistinguishable from success-but-lost-response; the user would retry manually anyway.

Backoff formula: `min(baseDelayMs * 2^attempt + random(0, baseDelayMs), maxDelayMs)`. Base: 500ms, max: 30s, default 3 retries. On 429 with `Retry-After` header: use server-specified delay.

**Rejected:** Only retry GET/PUT/DELETE (npm ref) — too conservative for KSeF's idempotent POSTs. Only retry 429 (lkow ref) — KSeF returns 502/503 during maintenance.

### Rate limiter: single-tier token bucket

Token bucket with global RPS + optional per-endpoint RPS. Single time window (per-second).

**Key insight:** KSeF's per-second limit is the binding constraint. Per-minute/hour limits are proportional and won't be hit if per-second is respected.

Concurrency safety: sequential promise chain — each `acquire()` resolves in order, preventing concurrent token drain.

**Rejected:** Multi-tier sliding window (lkow ref) — more accurate but significantly more complex. No client-side limiting (npm ref) — causes unnecessary 429s under sustained load.

### Auth refresh: reactive on 401, not proactive

On 401, call `authManager.onUnauthorized()` → if new token returned, retry request once.

**Key insight:** The cost is one failed request per token expiry (~once per session lifetime), which is negligible. The approach is token-format-agnostic — no JWT parsing needed.

**Rejected:** Proactive with JWT expiry + leeway (npm ref) — avoids one wasted request but requires token format knowledge. No auth management (lkow ref) — forces every service to handle 401.

### Presigned URL validation: HTTPS + host allowlist + private IP rejection

Validate presigned URLs before following them. Check: HTTPS required, host allowlist (with wildcard), redirect parameter blocking, private/reserved IP rejection (127.x, 10.x, 172.16-31.x, 192.168.x, ::1, fc00::/7).

Defense in depth against SSRF when following server-provided download URLs.

### Rate limiting: before retry loop, not on every attempt

Rate limiting happens once before entering the retry loop. If the server returns 503, retrying after backoff shouldn't require re-acquiring a rate limit token — the client already "spent" its rate budget.

**Exception:** 429 retries DO re-acquire because the server explicitly said "slow down."

### Config: separate policy objects

`RetryPolicy`, `RateLimitPolicy`, `AuthManager`, `PresignedUrlPolicy` — unit-testable independently, swappable independently. `KSeFClientOptions` merges them at the user-facing level with `Partial<>` for ergonomics.

## Risks

- **Retrying non-idempotent POST creates duplicates** — KSeF POSTs are idempotent by design. If a non-idempotent endpoint is added, services can disable retry per-request.
- **Token bucket default too low/high** — Default 10 RPS is conservative. KSeF doesn't publish official per-second limits. Configurable via `rateLimit.globalRps`.
- **Private IP validation may block corporate setups** — Users behind NAT can add hosts to `allowedHosts` or set `rejectPrivateIps: false`.
- **Retry + rate limiting adds latency** — Fast path is zero-overhead; only failing/throttled requests pay the cost.
