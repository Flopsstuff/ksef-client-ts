# Configuration

`KSeFClient` accepts configuration options that control environment selection, HTTP behavior, retry logic, rate limiting, and security policies.

---

## Client Options

```ts
import { KSeFClient } from 'ksef-client-ts';

const client = new KSeFClient({
  environment: 'PROD',         // 'TEST' | 'DEMO' | 'PROD' (default: 'TEST')
  timeout: 60_000,             // Request timeout in ms (default: 30000)
  customHeaders: { 'X-Request-Id': 'abc' },
  transport: customFetchFn,    // Replace native fetch
  retry: { maxRetries: 5 },    // Partial retry policy overrides
  rateLimit: { globalRps: 20 },// Partial rate limit config (or null to disable)
  presignedUrlHosts: ['*.my-storage.com'], // Additional allowed hosts
  authManager: customAuthMgr,  // Custom AuthManager implementation
});
```

### KSeFClientOptions

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `environment` | `'TEST' \| 'DEMO' \| 'PROD'` | `'TEST'` | KSeF environment (sets base URLs) |
| `baseUrl` | `string` | Per environment | Override API base URL |
| `baseQrUrl` | `string` | Per environment | Override QR verification base URL |
| `lighthouseUrl` | `string` | Per environment | Override lighthouse status URL |
| `apiVersion` | `string` | `'v2'` | API version prefix |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `customHeaders` | `Record<string, string>` | `{}` | Additional headers on every request |
| `transport` | `TransportFn` | Native `fetch` | Custom HTTP transport function |
| `retry` | `Partial<RetryPolicy>` | See below | Retry policy overrides |
| `rateLimit` | `Partial<RateLimitConfig> \| null` | `{ globalRps: 10 }` | Rate limit config, or `null` to disable |
| `presignedUrlHosts` | `string[]` | — | Additional allowed hosts for presigned URLs |
| `authManager` | `AuthManager` | `DefaultAuthManager` | Custom auth/token manager |

---

## Retry Policy

Failed requests are automatically retried with exponential backoff. The retry policy is merged with defaults — you only need to specify the fields you want to override.

### What gets retried

**HTTP status codes** (default): `429`, `500`, `502`, `503`, `504`

**Network errors** (when `retryNetworkErrors: true`): `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `UND_ERR_CONNECT_TIMEOUT`, and `AbortError` (fetch timeout).

All HTTP methods are retried, including POST. This is safe because KSeF API operations are idempotent by design — for example, submitting the same invoice returns the same KSeF number.

### Backoff formula

```
delay = min(baseDelayMs × 2^attempt + random(0, baseDelayMs), maxDelayMs)
```

For 429 responses with a `Retry-After` header, the server-specified delay is used instead of the calculated backoff. `Retry-After` is parsed as seconds (integer) or HTTP-date.

### Configuration

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `maxRetries` | `number` | `3` | Maximum retry attempts |
| `baseDelayMs` | `number` | `500` | Base delay in milliseconds |
| `maxDelayMs` | `number` | `30000` | Maximum delay cap in milliseconds |
| `retryableStatusCodes` | `number[]` | `[429, 500, 502, 503, 504]` | HTTP status codes to retry |
| `retryNetworkErrors` | `boolean` | `true` | Retry on network errors |

### Examples

```ts
// More aggressive retries
const client = new KSeFClient({
  retry: {
    maxRetries: 5,
    baseDelayMs: 1000,
    maxDelayMs: 60_000,
  },
});

// Add 409 Conflict to retryable codes
const client = new KSeFClient({
  retry: {
    retryableStatusCodes: [409, 429, 500, 502, 503, 504],
  },
});

// Disable retries entirely
const client = new KSeFClient({
  retry: { maxRetries: 0 },
});
```

---

## Rate Limiting

A token bucket rate limiter prevents overwhelming the KSeF API. Requests exceeding the limit are delayed (not rejected).

### How it works

- **Global bucket**: All requests share a global tokens-per-second limit (default: 10 RPS)
- **Per-endpoint buckets**: Optional per-endpoint limits (created lazily on first use)
- A request must pass both the global bucket and its endpoint-specific bucket (if configured)
- Rate limit is acquired once before the retry loop; on 429 retries, a token is re-acquired
- Concurrency-safe via sequential promise chain

### Configuration

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `globalRps` | `number` | `10` | Global requests per second |
| `endpointLimits` | `Record<string, number>` | `{}` | Per-endpoint RPS limits |

### Examples

```ts
// Higher global limit
const client = new KSeFClient({
  rateLimit: { globalRps: 20 },
});

// Per-endpoint limits
const client = new KSeFClient({
  rateLimit: {
    globalRps: 15,
    endpointLimits: {
      '/v2/online/Invoice/Send': 5,
    },
  },
});

// Disable rate limiting entirely
const client = new KSeFClient({
  rateLimit: null,
});
```

### KSeF server-side limits (v2.4.0)

The KSeF API enforces its own per-endpoint caps. If you opt into client-side back-pressure via `endpointLimits`, use the values below to match the current server limits. The library does **not** apply these defaults automatically — the server enforces them regardless.

| Endpoint | req/s | req/min |
| --- | ---: | ---: |
| `POST /invoices/exports` | 8 | 16 |
| `POST /invoices/query/metadata` | 8 | 16 |

Prior to KSeF API v2.4.0, `POST /invoices/exports` was capped at 4 req/s and 8 req/min; v2.4.0 aligned it with `query/metadata`. The client-side token bucket only supports a per-second window — minute-level ceilings are enforced server-side only, so keep `globalRps` at or below the per-second cap to stay within the minute budget under sustained load.

---

## Presigned URL Policy

When downloading files from presigned URLs returned by the KSeF API (e.g., batch exports, UPO downloads), the library validates URLs against a security policy to prevent SSRF attacks.

### Security checks (in order)

1. **HTTPS enforcement** — HTTP URLs are rejected (default: enabled)
2. **Host whitelist** — Only URLs matching allowed host patterns are permitted. Wildcard patterns (`*.domain.com`) match any subdomain. Default: `['*.ksef.mf.gov.pl']`
3. **Redirect parameter blocking** — URLs containing `redirect`, `callback`, `return_url`, or `next` query parameters are rejected (case-insensitive)
4. **Private IP rejection** — URLs targeting private/reserved IPs are rejected:
   - IPv4: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`
   - IPv6: `::1`, `fc00::/7`, `fe80::/10`

The first failing check throws `KSeFValidationError`.

### Adding allowed hosts

Use `presignedUrlHosts` in client options to add hosts beyond the default `*.ksef.mf.gov.pl`:

```ts
const client = new KSeFClient({
  presignedUrlHosts: ['*.my-corporate-storage.com', 'cdn.example.com'],
});
```

The additional hosts are merged with the defaults — you don't need to repeat `*.ksef.mf.gov.pl`.

---

## Custom Transport

Replace the default `fetch` with a custom transport function for testing, logging, or proxying.

### Type signature

```ts
type TransportFn = (url: string, init: RequestInit) => Promise<Response>;
```

The transport receives the fully-constructed URL and `RequestInit` (including method, headers, body, and `AbortSignal` for timeouts).

### Examples

```ts
// Logging transport
const client = new KSeFClient({
  transport: async (url, init) => {
    console.log(`${init.method} ${url}`);
    const start = Date.now();
    const res = await fetch(url, init);
    console.log(`${res.status} in ${Date.now() - start}ms`);
    return res;
  },
});

// Mock transport for tests
const client = new KSeFClient({
  transport: async (url, init) => {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
});

// Proxy transport
import { ProxyAgent } from 'undici';

const agent = new ProxyAgent('http://proxy.corp.com:8080');
const client = new KSeFClient({
  transport: (url, init) => fetch(url, { ...init, dispatcher: agent }),
});
```
