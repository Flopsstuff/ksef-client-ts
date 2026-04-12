# Troubleshooting

Guide to error types, diagnostics, and common issues when working with the KSeF client library and CLI.

---

## Error Hierarchy

```
KSeFError (base)
├── KSeFApiError (generic HTTP errors)
│   └── KSeFRateLimitError (429)
├── KSeFUnauthorizedError (401)
├── KSeFForbiddenError (403)
├── KSeFGoneError (410, operation status retention expired)
├── KSeFAuthStatusError
├── KSeFSessionExpiredError
└── KSeFValidationError (client-side validation)
```

`RestClient` dispatches errors in order: **429 → 401 → 403 → 410 → generic**. The first matching handler throws the corresponding error class.

---

## HTTP Errors

### 429 — Rate Limited

**Error class:** `KSeFRateLimitError` (extends `KSeFApiError`)

The KSeF API enforces per-subject rate limits. The library automatically retries 429 responses up to 3 times with exponential backoff and respects the `Retry-After` header.

**If you still see rate limit errors:**
- Reduce request frequency or add delays between batch operations
- Tune the client rate limiter: `new KSeFClient({ rateLimit: { globalRps: 5 } })`
- See [Configuration](./configuration.md) for details

**CLI hint:** `Rate limited. Retry after {delay}s.`

### 401 — Unauthorized

**Error class:** `KSeFUnauthorizedError` (extends `KSeFError`)

| Field | Type | Description |
| --- | --- | --- |
| `detail` | `string` | Human-readable error description |
| `traceId` | `string?` | Server-side trace identifier |
| `instance` | `string?` | API instance identifier |
| `timestamp` | `string?` | UTC timestamp recorded by the server (KSeF API v2.4.0+) |

The library automatically attempts one token refresh on 401. If refresh also fails, the error is thrown.

**What to do:**
- Re-authenticate: `ksef auth login --token "$KSEF_TOKEN"`
- Check that your token hasn't been revoked in the KSeF portal
- Verify the correct environment: `--env test` vs `--env prod`

**CLI hint:** `Run 'ksef auth login' to authenticate.`

### 403 — Forbidden

**Error class:** `KSeFForbiddenError` (extends `KSeFError`)

| Field | Type | Description |
| --- | --- | --- |
| `detail` | `string` | Human-readable error description |
| `reasonCode` | `ForbiddenReasonCode` | Machine-readable reason (see table) |
| `traceId` | `string?` | Server-side trace identifier |
| `instance` | `string?` | API instance identifier |
| `security` | `Record<string, unknown>?` | Additional security context |
| `timestamp` | `string?` | UTC timestamp recorded by the server (KSeF API v2.4.0+) |

#### Reason codes

| Reason Code | Meaning | What to do |
| --- | --- | --- |
| `missing-permissions` | Caller lacks required permissions | Grant permissions via `ksef permission grant` or KSeF portal |
| `ip-not-allowed` | Request from disallowed IP address | Whitelist your IP in the KSeF portal |
| `insufficient-resource-access` | No access to the specific resource | Check resource ownership/delegation |
| `auth-method-not-allowed` | Auth method not permitted for this operation | Use a different auth method (e.g., XAdES for production) |
| `security-service-blocked` | Security service blocked the request | Contact KSeF support |
| `context-type-not-allowed` | Context type not permitted | Verify context identifier type |

**CLI hint:** `Run 'ksef auth login' to authenticate.`

### 404 — Not Found

No dedicated error class — thrown as `KSeFApiError`.

**CLI hint:** `Check if the resource reference is correct.`

**What to do:**
- Verify the reference number, KSeF number, or serial number
- Ensure you're querying the correct environment

### 410 — Gone (operation status retention expired)

**Error class:** `KSeFGoneError` (extends `KSeFError`)

| Field | Type | Description |
| --- | --- | --- |
| `detail` | `string` | Human-readable error description |
| `instance` | `string?` | API instance identifier |
| `traceId` | `string?` | Server-side trace identifier |
| `timestamp` | `string?` | UTC timestamp recorded by the server |

KSeF API v2.4.0 enforces retention on async operation status endpoints. After the window expires, polling the status returns 410 Gone. Retention windows: **7 days** for authentication and invoice export operation status, **30 days** for certificate and permission enrollment status.

**What to do:**
- Re-issue the action (the underlying outcome — e.g., issued certificate, exported package — is not lost; only the polling endpoint forgets the status)
- Persist completed reference numbers and result URLs locally so you don't depend on long-term server-side polling
- Reduce poll intervals or download results closer to completion

### Network Errors

Retried automatically for: `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `UND_ERR_CONNECT_TIMEOUT`, `AbortError` (fetch timeout).

**CLI hint:** `Check your network connection and environment. Run 'ksef doctor' to diagnose.`

**What to do:**
- Check internet connectivity
- Verify the KSeF environment is up: `ksef lighthouse status --env test`
- Run `ksef doctor` for a full diagnostic

---

## Client-Side Errors

### KSeFValidationError

Thrown by builders and the presigned URL policy before any HTTP request is made. Common causes:

- Invalid builder input (missing required fields, invalid format)
- Presigned URL targeting a disallowed host or private IP (SSRF protection)
- Presigned URL using HTTP instead of HTTPS

These errors indicate a problem in your code or configuration, not a server issue.

### KSeFSessionExpiredError

The KSeF session has expired. Sessions have a limited duration.

**What to do:** Re-authenticate with `ksef auth login`.

### KSeFAuthStatusError

Authentication status check returned an unexpected code during the login ceremony.

**What to do:** Retry the login. If persistent, check KSeF system status via `ksef lighthouse status`.

---

## Diagnostics with `ksef doctor`

Run `ksef doctor` to diagnose configuration and connectivity issues:

```bash
ksef doctor                    # Run all checks
ksef doctor --json             # Machine-readable JSON output
ksef doctor --env prod         # Check specific environment
```

### Checks performed

1. **Config** — `~/.ksef/config.json` exists and contains valid JSON
2. **Connectivity** — KSeF lighthouse status endpoint reachable (5s timeout, no auth required)
3. **Session** — Stored session exists and is not expired

Output: `N/M checks passed` with pass/fail/warning indicators per check.

---

## Common Issues

### "Session expired" after some time

KSeF sessions have a limited duration. The library auto-refreshes access tokens on 401, but if the refresh token also expired, you need to re-authenticate.

**Solution:** `ksef auth login --token "$KSEF_TOKEN"`

### Rate limiting during batch operations

The default client rate limiter allows 10 requests/second. For high-volume batch invoice sending, this may still exceed KSeF per-subject limits.

**Solution:** Lower the client RPS or add per-endpoint limits:

```typescript
const client = new KSeFClient({
  rateLimit: {
    globalRps: 5,
    endpointLimits: { '/v2/online/Invoice/Send': 2 },
  },
});
```

### Connection refused to test environment

The KSeF test environment (`api-test.ksef.mf.gov.pl`) may have planned or unplanned downtime.

**Solution:**
1. Verify `--env test` is set
2. Run `ksef lighthouse status --env test`
3. Check KSeF system announcements via `ksef lighthouse messages`

### Certificate enrollment failures

**Solution:**
- Verify certificate format (PEM) and type (personal / company-seal)
- Check enrollment limits: `ksef cert limits`
- Ensure you have sufficient permissions for certificate operations

### "Presigned URL host not in allowed list"

The library validates presigned URLs against a host whitelist (default: `*.ksef.mf.gov.pl`). If KSeF returns URLs with different hosts, add them:

```typescript
const client = new KSeFClient({
  presignedUrlHosts: ['*.my-storage.com'],
});
```
