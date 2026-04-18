# Error Handling & Problem Details

Comprehensive guide to error types, RFC 7807 Problem Details, error dispatch, and programmatic handling patterns in the KSeF TypeScript client.

---

## Overview

KSeF is Poland's National e-Invoice System -- a government tax system where errors have real consequences. A failed invoice submission may require re-sending before a legal deadline. A 403 may indicate a permissions misconfiguration that blocks an entire organization's invoicing. A rate limit hit during a batch export can stall downstream accounting processes.

The library provides a structured error hierarchy so that callers can react precisely to each failure mode:

- **Server errors** (`KSeFApiError`, `KSeFRateLimitError`) carry the HTTP status code and parsed response body.
- **Auth errors** (`KSeFUnauthorizedError`, `KSeFForbiddenError`) carry RFC 7807 Problem Details with machine-readable reason codes.
- **Retention errors** (`KSeFGoneError`) signal that a server-side async operation status has aged out (HTTP 410).
- **Client-side errors** (`KSeFValidationError`) catch invalid requests before they reach the network.
- **Workflow errors** (`KSeFAuthStatusError`, `KSeFSessionExpiredError`) represent higher-level failures in multi-step operations.

All error classes extend a common base `KSeFError`, so a single `instanceof KSeFError` catch covers every library error without catching unrelated exceptions.

---

## Error Hierarchy

```
Error (built-in)
  └── KSeFError                          src/errors/ksef-error.ts
        ├── KSeFApiError                 src/errors/ksef-api-error.ts         (any non-2xx HTTP)
        │     ├── KSeFBadRequestError    src/errors/ksef-bad-request-error.ts (400 + RFC 7807)
        │     ├── KSeFUnauthorizedError  src/errors/ksef-unauthorized-error.ts (401 + RFC 7807)
        │     ├── KSeFForbiddenError     src/errors/ksef-forbidden-error.ts   (403 + RFC 7807)
        │     ├── KSeFGoneError          src/errors/ksef-gone-error.ts        (410 + RFC 7807, retention expired)
        │     ├── KSeFRateLimitError     src/errors/ksef-rate-limit-error.ts  (429 + RFC 7807)
        │     └── KSeFBatchTimeoutError  src/errors/ksef-batch-timeout-error.ts (KSeF code 21208)
        ├── KSeFAuthStatusError          src/errors/ksef-auth-status-error.ts (auth ceremony failed)
        ├── KSeFSessionExpiredError      src/errors/ksef-session-expired-error.ts (stored session expired)
        └── KSeFValidationError          src/errors/ksef-validation-error.ts  (client-side validation)
```

All server-returned HTTP errors extend `KSeFApiError`, so a single `instanceof KSeFApiError` catch handles every response-side failure. The `KSeFApiProblem` union type (see [Exhaustive dispatch](#exhaustive-dispatch-with-ksefapiproblem)) narrows through the five RFC 7807 subclasses for exhaustive `switch` / `assertNever` patterns.

**All exports:** `src/errors/index.ts` re-exports every error class, type, and interface. Import from the package root:

```typescript
import {
  KSeFError,
  KSeFApiError,
  KSeFBadRequestError,
  KSeFRateLimitError,
  KSeFUnauthorizedError,
  KSeFForbiddenError,
  KSeFGoneError,
  KSeFAuthStatusError,
  KSeFSessionExpiredError,
  KSeFValidationError,
  KSeFBatchTimeoutError,
  KSeFErrorCode,
  type KSeFApiProblem,
  assertNever,
} from 'ksef-client-ts';
```

---

## RFC 7807 Problem Details

KSeF returns structured error bodies for 400, 401, 403, 410, and 429 responses following [RFC 7807 (Problem Details for HTTP APIs)](https://www.rfc-editor.org/rfc/rfc7807). These bodies provide machine-readable fields that go beyond a simple status code.

The client asks for Problem Details on every outgoing request via the `X-Error-Format: problem-details` header. Set `errorFormat: 'legacy'` in client options to suppress the header and receive legacy `ApiErrorResponse` bodies from older servers or proxies.

```typescript
const client = new KSeFClient({
  environment: 'TEST',
  // errorFormat: 'legacy',  // opt out, rarely needed
});
```

### 400 Bad Request -- `BadRequestProblemDetails`

**File:** `src/errors/types.ts`

```json
{
  "title": "Bad Request",
  "status": 400,
  "detail": "Request validation failed",
  "instance": "/v2/invoices/query",
  "errors": [
    { "code": 21200, "description": "Invalid date range", "details": ["dateFrom > dateTo"] },
    { "code": 21201, "description": "Unknown subject type", "details": [] }
  ],
  "traceId": "abc-123-def-456",
  "timestamp": "2026-04-18T10:15:30Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Short human-readable summary |
| `status` | `number` | Always `400` |
| `detail` | `string?` | Human-readable summary of what failed |
| `instance` | `string?` | The API endpoint path that was called |
| `errors` | `BadRequestErrorDetail[]` | Structured list of individual validation failures |
| `traceId` | `string?` | Server-side trace ID for correlating with KSeF support |
| `timestamp` | `string?` | UTC timestamp recorded by the server |

Each entry in `errors` has `code: number`, `description: string`, and `details: string[]`. The client throws `KSeFBadRequestError` whose `.errors` field is ready for display or programmatic routing by `code`.

When the server returns a legacy 400 body (older server or proxy), the client falls back to generic `KSeFApiError` with `statusCode === 400`. Both cases are caught by `instanceof KSeFApiError`.

### 401 Unauthorized -- `UnauthorizedProblemDetails`

**File:** `src/errors/types.ts`

```json
{
  "title": "Unauthorized",
  "status": 401,
  "detail": "Token has expired",
  "instance": "/v2/online/Session/Open",
  "traceId": "abc-123-def-456",
  "timestamp": "2026-04-12T10:15:30Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Short human-readable summary (e.g., `"Unauthorized"`) |
| `status` | `number` | Always `401` |
| `detail` | `string` | Specific explanation of why the request was rejected |
| `instance` | `string?` | The API endpoint path that was called |
| `traceId` | `string?` | Server-side trace ID for correlating with KSeF support |
| `timestamp` | `string?` | UTC timestamp recorded by the server when the error was generated (KSeF API v2.4.0+) |

### 403 Forbidden -- `ForbiddenProblemDetails`

**File:** `src/errors/types.ts`

```json
{
  "title": "Forbidden",
  "status": 403,
  "detail": "Subject does not have required permissions for this operation",
  "instance": "/v2/online/Invoice/Send",
  "reasonCode": "missing-permissions",
  "security": {
    "requiredAnyOfPermissions": ["InvoiceWrite", "InvoiceRead"],
    "presentPermissions": ["SessionOwn"]
  },
  "traceId": "abc-123-def-456",
  "timestamp": "2026-04-12T10:15:30Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Short human-readable summary |
| `status` | `number` | Always `403` |
| `detail` | `string` | Specific explanation of the denial |
| `instance` | `string?` | The API endpoint path |
| `reasonCode` | `ForbiddenReasonCode` | Machine-readable reason (see table below) |
| `security` | `ForbiddenSecurityInfo & Record<string, unknown>?` | Typed `requiredAnyOfPermissions` / `presentPermissions` lists plus any forward-compat fields |
| `traceId` | `string?` | Server-side trace ID |
| `timestamp` | `string?` | UTC timestamp recorded by the server when the error was generated (KSeF API v2.4.0+) |

### `ForbiddenReasonCode` values

**Type:** `src/errors/types.ts`

| Value | Meaning | How to react |
|-------|---------|--------------|
| `missing-permissions` | Subject lacks the required KSeF permission for this operation | Grant the missing permission via the KSeF portal or `PermissionService` |
| `ip-not-allowed` | Request originates from an IP not in the session's allowed range | Check your network configuration; re-open session from an allowed IP |
| `insufficient-resource-access` | Subject can access the endpoint but not this specific resource | Verify the NIP/invoice reference belongs to the authenticated subject |
| `auth-method-not-allowed` | The authentication method used is not permitted for this operation | Switch to a different auth method (e.g., certificate instead of token) |
| `security-service-blocked` | KSeF security subsystem has blocked the request | Contact KSeF support with the `traceId` |
| `context-type-not-allowed` | The session's context type does not allow this operation | Open a session with the correct context identifier type |

The type also includes `(string & {})` to allow for future reason codes not yet enumerated.

### 410 Gone -- `GoneProblemDetails`

**File:** `src/errors/types.ts`

Returned when polling an async operation status whose server-side record has aged out of KSeF retention windows. KSeF API v2.4.0 enforces 7-day retention for authentication and export operation status, and 30-day retention for certificate and permission enrollment status.

```json
{
  "title": "Gone",
  "status": 410,
  "detail": "Operation status no longer available (retention expired)",
  "instance": "/v2/auth/ref-123",
  "traceId": "abc-123-def-456",
  "timestamp": "2026-04-12T10:00:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Short human-readable summary |
| `status` | `number` | Always `410` |
| `detail` | `string` | Server's explanation (typically references retention expiry) |
| `instance` | `string?` | The API endpoint path |
| `traceId` | `string?` | Server-side trace ID |
| `timestamp` | `string?` | UTC timestamp recorded by the server |

### 429 Too Many Requests -- `TooManyRequestsProblemDetails`

**File:** `src/errors/types.ts`

```json
{
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Daily quota exceeded",
  "instance": "/v2/sessions",
  "traceId": "abc-123-def-456",
  "timestamp": "2026-04-18T10:00:00Z"
}
```

Surfaced on `KSeFRateLimitError.problem`. The existing `retryAfterSeconds` / `retryAfterDate` / `recommendedDelay` fields (parsed from the `Retry-After` header) remain populated — the Problem Details body is additive context for logging and support correlation.

```typescript
catch (err) {
  if (err instanceof KSeFRateLimitError) {
    await sleep((err.recommendedDelay ?? 60) * 1000);
    if (err.problem?.traceId) {
      logger.warn({ traceId: err.problem.traceId }, 'rate limited');
    }
  }
}
```

### Exhaustive dispatch with `KSeFApiProblem`

The union type `KSeFApiProblem` lets you switch over every Problem Details error with compile-time safety:

```typescript
import { type KSeFApiProblem, assertNever, KSeFApiError } from 'ksef-client-ts';

function describe(err: KSeFApiProblem): string {
  switch (err.statusCode) {
    case 400: return `Validation: ${err.errors.length} error(s)`;
    case 401: return 'Authenticate and retry';
    case 403: return `Forbidden: ${err.reasonCode}`;
    case 410: return 'Operation status expired';
    case 429: return `Rate limited, retry in ${err.recommendedDelay}s`;
    default: return assertNever(err);
  }
}

try {
  await client.invoices.queryInvoiceMetadata(filters);
} catch (err) {
  if (err instanceof KSeFApiError && 'statusCode' in err) {
    // Narrow to KSeFApiProblem via instanceof checks before calling describe().
  }
}
```

Adding a new RFC 7807 subclass to the union causes `assertNever` to fail type-checking at every dispatch site until the new case is handled.

---

## Error Dispatch Flow

**File:** `src/http/rest-client.ts`, method `ensureSuccess()`

After the retry loop is exhausted and a non-2xx response remains, `ensureSuccess()` reads the response body **once** as text and attempts to parse it as JSON. It then dispatches errors in a fixed priority order:

```text
Response not OK?
  │
  ├── status 400 → try BadRequestProblemDetails guard
  │                → matches → throw new KSeFBadRequestError(problem)
  │                → else legacy ApiErrorResponse; if it carries KSeF
  │                  exceptionCode 21208 → throw KSeFBatchTimeoutError
  │                  otherwise throw KSeFApiError.fromResponse()
  │
  ├── status 429 → try TooManyRequestsProblemDetails guard
  │                → if matches, pass to KSeFRateLimitError.fromRetryAfterHeader()
  │                  alongside the Retry-After header
  │                → else fall back to legacy TooManyRequestsResponse body
  │                → throw KSeFRateLimitError (always carries retry metadata)
  │
  ├── status 401 → parse as UnauthorizedProblemDetails
  │                → if body has .detail → throw new KSeFUnauthorizedError(body)
  │                  (if no .detail, falls through to generic)
  │
  ├── status 403 → parse as ForbiddenProblemDetails
  │                → if body has .reasonCode → throw new KSeFForbiddenError(body)
  │                  (if no .reasonCode, falls through to generic)
  │
  ├── status 410 → parse as GoneProblemDetails
  │                → throw new KSeFGoneError(body)
  │                  (if body is empty, throws with default retention-expired message)
  │
  └── any other status → parse as ApiErrorResponse
                         → if body carries KSeF exceptionCode 21208
                             → throw KSeFBatchTimeoutError.fromResponse()
                         → otherwise throw KSeFApiError.fromResponse()
                           (generic fallback for all unhandled status codes)
```

**Why the order matters:** The 429 check runs first because a rate-limited response might also contain fields like `detail`. It should always be treated as rate limiting, not as an auth error. Each check is exclusive -- once a specific error is thrown, no further checks run.

**Body reading:** The body is consumed exactly once via `response.text()`. The `parseJson<T>()` helper then attempts `JSON.parse()` on that text. If parsing fails (e.g., the server returned HTML), the raw text is silently discarded and the error is constructed without a parsed body.

### Before `ensureSuccess()`: automatic recovery

The retry loop in `sendRequest()` (lines 71-131) handles certain errors transparently before they reach `ensureSuccess()`:

1. **429 / 5xx responses** are retried up to `maxRetries` times with exponential backoff.
2. **401 on first attempt** triggers an auth token refresh via `AuthManager.onUnauthorized()`. If refresh succeeds, the request is retried once with the new token.
3. **Network errors** (`ECONNRESET`, `ETIMEDOUT`, etc.) are retried with backoff.

Only after all retries are exhausted does the response reach `ensureSuccess()`. This means callers only see errors that could not be recovered automatically.

---

## Error Classes in Detail

### `KSeFError`

**File:** `src/errors/ksef-error.ts`

Base class for all library errors. Extends `Error` with `name = 'KSeFError'`.

```typescript
class KSeFError extends Error {
  constructor(message: string);
}
```

Use `instanceof KSeFError` to catch any error thrown by this library while letting unrelated errors propagate.

---

### `KSeFApiError`

**File:** `src/errors/ksef-api-error.ts`

Generic error for any non-2xx HTTP response that is not handled by a more specific class.

```typescript
class KSeFApiError extends KSeFError {
  readonly statusCode: number;
  readonly errorResponse?: ApiErrorResponse;

  static fromResponse(statusCode: number, body?: ApiErrorResponse): KSeFApiError;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | `number` | HTTP status code (e.g., 400, 404, 500) |
| `errorResponse` | `ApiErrorResponse?` | Parsed KSeF error body (see below) |
| `message` | `string` | Joined `exceptionDescription` values, or `"KSeF API error: HTTP {status}"` |

#### `ApiErrorResponse` structure

**Type:** `src/errors/types.ts`

```typescript
interface ApiErrorResponse {
  exception?: {
    serviceCtx?: string;
    serviceCode?: string;
    serviceName?: string;
    timestamp?: string;
    referenceNumber?: string;
    exceptionDetailList?: ExceptionDetails[];
  };
}

interface ExceptionDetails {
  exceptionCode?: number;
  exceptionDescription?: string | null;
  details?: string[] | null;
}
```

Example KSeF error body:

```json
{
  "exception": {
    "serviceCtx": "srvTXN",
    "serviceCode": "20230201-EX-B8FCA03125-E7",
    "serviceName": "online.invoice.send",
    "timestamp": "2026-03-28T10:30:00.000Z",
    "referenceNumber": "20230201-SE-ABC123",
    "exceptionDetailList": [
      {
        "exceptionCode": 21001,
        "exceptionDescription": "Invalid invoice XML schema",
        "details": ["Element 'P_1' is not valid"]
      }
    ]
  }
}
```

The `fromResponse()` factory joins all `exceptionDescription` values with `"; "` to build the error message. If no descriptions are present, it falls back to `"KSeF API error: HTTP {statusCode}"`.

---

### `KSeFRateLimitError`

**File:** `src/errors/ksef-rate-limit-error.ts`

Thrown when KSeF returns HTTP 429 (Too Many Requests). Extends `KSeFApiError` so it also carries `statusCode` and `errorResponse`.

```typescript
class KSeFRateLimitError extends KSeFApiError {
  readonly retryAfterSeconds?: number;
  readonly retryAfterDate?: Date;
  readonly recommendedDelay: number;  // seconds, defaults to 60

  static fromRetryAfterHeader(
    statusCode: number,
    retryAfterHeader?: string | null,
    body?: ApiErrorResponse,
  ): KSeFRateLimitError;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `retryAfterSeconds` | `number?` | Parsed `Retry-After` value in seconds |
| `retryAfterDate` | `Date?` | If `Retry-After` was an HTTP-date, the parsed Date |
| `recommendedDelay` | `number` | `retryAfterSeconds` if available, otherwise `60` (seconds) |

#### `Retry-After` header parsing

The `fromRetryAfterHeader()` factory parses the header in two formats:

1. **Seconds:** `Retry-After: 120` -- parsed as integer, stored in `retryAfterSeconds`.
2. **HTTP-date:** `Retry-After: Thu, 28 Mar 2026 12:00:00 GMT` -- parsed as `Date`, delta from now stored in `retryAfterSeconds`.

If the header is missing or unparseable, `retryAfterSeconds` is `undefined` and `recommendedDelay` falls back to `60` seconds.

::: tip
By the time you catch a `KSeFRateLimitError`, the built-in retry policy has already retried up to 3 times with backoff. This error means all retries were exhausted. Use `recommendedDelay` to schedule a later retry.
:::

---

### `KSeFBatchTimeoutError`

**File:** `src/errors/ksef-batch-timeout-error.ts`

Thrown when KSeF responds with error code `21208` — the server-side batch session timed out before processing finished. Extends `KSeFApiError`, so it also carries `statusCode` and `errorResponse`.

```typescript
class KSeFBatchTimeoutError extends KSeFApiError {
  readonly errorCode: 21208;

  static fromResponse(statusCode: number, body?: ApiErrorResponse): KSeFBatchTimeoutError;
}
```

Use this class to distinguish server-side batch timeouts from other failure modes when orchestrating large batch uploads or finish operations. The numeric code registry for error detection is exposed as `KSeFErrorCode` in `src/errors/error-codes.ts` (currently `BatchTimeout = 21208`, `DuplicateInvoice = 440`).

::: tip
Pair with a retry-with-smaller-batch strategy rather than a tight loop — the timeout means KSeF is under load, not that the request was malformed.
:::

---

### `KSeFUnauthorizedError`

**File:** `src/errors/ksef-unauthorized-error.ts`

Thrown when KSeF returns HTTP 401 with an RFC 7807 Problem Details body. Extends `KSeFApiError` so a single `instanceof KSeFApiError` catch still matches.

```typescript
class KSeFUnauthorizedError extends KSeFApiError {
  override readonly statusCode: 401 = 401;
  readonly detail: string;
  readonly traceId?: string;
  readonly instance?: string;
  readonly timestamp?: string;

  constructor(problemDetails: UnauthorizedProblemDetails);
}
```

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | `401` | Always 401 |
| `detail` | `string` | Server's explanation (e.g., `"Token has expired"`) |
| `traceId` | `string?` | Server-side trace ID for support tickets |
| `instance` | `string?` | The endpoint path that was called |
| `timestamp` | `string?` | UTC timestamp recorded by the server (KSeF API v2.4.0+); useful for correlating with server-side logs |

::: info
By the time you catch this error, the library has already attempted an automatic token refresh via `AuthManager.onUnauthorized()`. If you see this error, it means the refresh also failed or no `AuthManager` is configured.
:::

---

### `KSeFForbiddenError`

**File:** `src/errors/ksef-forbidden-error.ts`

Thrown when KSeF returns HTTP 403 with an RFC 7807 Problem Details body that includes a `reasonCode`. Extends `KSeFApiError`.

```typescript
class KSeFForbiddenError extends KSeFApiError {
  override readonly statusCode: 403 = 403;
  readonly detail: string;
  readonly reasonCode: ForbiddenReasonCode;
  readonly instance?: string;
  readonly security?: Record<string, unknown>;
  readonly traceId?: string;
  readonly timestamp?: string;

  constructor(problemDetails: ForbiddenProblemDetails);
}
```

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | `403` | Always 403 |
| `detail` | `string` | Human-readable denial reason |
| `reasonCode` | `ForbiddenReasonCode` | Machine-readable reason (see [reason code table](#forbiddenreasoncode-values)) |
| `instance` | `string?` | The endpoint path |
| `security` | `Record<string, unknown>?` | Additional security context from KSeF |
| `traceId` | `string?` | Server-side trace ID |
| `timestamp` | `string?` | UTC timestamp recorded by the server (KSeF API v2.4.0+); useful for correlating with server-side logs |

---

### `KSeFGoneError`

**File:** `src/errors/ksef-gone-error.ts`

Thrown when KSeF returns HTTP 410 (Gone) — the server-side record for an async operation status has aged out of the retention window. Extends `KSeFApiError` (single out via `instanceof KSeFGoneError` rather than the base-class split).

```typescript
class KSeFGoneError extends KSeFApiError {
  override readonly statusCode: 410 = 410;
  readonly detail: string;
  readonly instance?: string;
  readonly traceId?: string;
  readonly timestamp?: string;

  constructor(problemDetails: GoneProblemDetails);
}
```

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | `410` | Always 410 |
| `detail` | `string` | Server's explanation, or `"Operation status no longer available (retention expired)"` if absent |
| `instance` | `string?` | The endpoint path |
| `traceId` | `string?` | Server-side trace ID |
| `timestamp` | `string?` | UTC timestamp recorded by the server |

#### KSeF v2.4.0 retention windows

| Operation status type | Retention |
|-----------------------|-----------|
| Authentication operation status | 7 days |
| Invoice export operation status | 7 days |
| Certificate enrollment status | 30 days |
| Permission operation status | 30 days |

::: tip
A `KSeFGoneError` means the operation likely ran to completion long ago — KSeF only forgets the *status record*, not the underlying outcome (e.g., issued certificate, exported package). If you missed the result, repeat the action rather than re-poll the same reference number.
:::

---

### `KSeFAuthStatusError`

**File:** `src/errors/ksef-auth-status-error.ts`

Thrown when an authentication ceremony (challenge-redeem flow) fails or times out. This is a higher-level error that occurs during multi-step auth workflows, not a direct HTTP status mapping.

```typescript
class KSeFAuthStatusError extends KSeFError {
  readonly referenceNumber?: string;
  readonly statusDescription?: string;

  constructor(message: string, referenceNumber?: string, statusDescription?: string);
}
```

| Field | Type | Description |
|-------|------|-------------|
| `referenceNumber` | `string?` | KSeF reference number for the failed auth operation |
| `statusDescription` | `string?` | Server's description of the failure |

Typical causes: the auth challenge expired before completion, the authorization token was invalid, or the certificate signature was rejected.

---

### `KSeFSessionExpiredError`

**File:** `src/errors/ksef-session-expired-error.ts`

Thrown when attempting to use a stored session that has expired. This is a client-side check -- the error is raised before making a network request.

```typescript
class KSeFSessionExpiredError extends KSeFError {
  constructor(message?: string);  // defaults to "KSeF session has expired"
}
```

Recovery: re-authenticate and open a new session.

---

### `KSeFValidationError`

**File:** `src/errors/ksef-validation-error.ts`

Thrown for client-side validation failures (e.g., invalid builder parameters, malformed presigned URLs). These errors are raised before any network request is made.

```typescript
interface ValidationDetail {
  field?: string;
  message: string;
}

class KSeFValidationError extends KSeFError {
  readonly details: ValidationDetail[];

  constructor(message: string, details?: ValidationDetail[]);
  static fromField(field: string, message: string): KSeFValidationError;
  static fromMessages(messages: string[]): KSeFValidationError;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `details` | `ValidationDetail[]` | List of individual validation failures |
| `details[].field` | `string?` | The field that failed validation (if applicable) |
| `details[].message` | `string` | Human-readable description of the validation failure |

Factory methods:

- `fromField(field, message)` -- creates an error with a single field-level validation detail.
- `fromMessages(messages)` -- creates an error from multiple message strings, joining them with `"; "` for the top-level message.

---

## Programmatic Error Handling Patterns

### Catch all library errors

```typescript
import { KSeFError } from 'ksef-client-ts';

try {
  await client.invoices.sendInvoice(invoiceXml);
} catch (error) {
  if (error instanceof KSeFError) {
    console.error('KSeF library error:', error.message);
  } else {
    // Not from this library (network failure, coding bug, etc.)
    throw error;
  }
}
```

### Handle specific error types with `instanceof`

```typescript
import {
  KSeFError,
  KSeFApiError,
  KSeFRateLimitError,
  KSeFBatchTimeoutError,
  KSeFUnauthorizedError,
  KSeFForbiddenError,
  KSeFGoneError,
  KSeFValidationError,
} from 'ksef-client-ts';

try {
  await client.invoices.sendInvoice(invoiceXml);
} catch (error) {
  if (error instanceof KSeFRateLimitError) {
    // 429 — all retries exhausted
    console.warn(`Rate limited. Retry in ${error.recommendedDelay}s`);
    await scheduleRetry(error.recommendedDelay * 1000);

  } else if (error instanceof KSeFBatchTimeoutError) {
    // KSeF code 21208 — batch session timed out server-side
    console.warn('Batch timeout. Retry with a smaller batch or fewer parallel parts.');

  } else if (error instanceof KSeFUnauthorizedError) {
    // 401 — auth refresh also failed
    console.error(`Auth failed: ${error.detail} (trace: ${error.traceId})`);
    await reauthenticate();

  } else if (error instanceof KSeFForbiddenError) {
    // 403 — permission or policy denial
    console.error(`Forbidden [${error.reasonCode}]: ${error.detail}`);
    handleForbidden(error);

  } else if (error instanceof KSeFGoneError) {
    // 410 — operation status retention expired (KSeF v2.4.0+)
    console.error(`Operation status no longer available: ${error.detail}`);
    // Re-issue the underlying action; the previous result is unrecoverable from this endpoint.

  } else if (error instanceof KSeFValidationError) {
    // Client-side validation failed before sending
    for (const detail of error.details) {
      console.error(`Validation: ${detail.field ?? '(general)'} — ${detail.message}`);
    }

  } else if (error instanceof KSeFApiError) {
    // Generic server error (400, 404, 500, etc.)
    console.error(`HTTP ${error.statusCode}: ${error.message}`);
    if (error.errorResponse?.exception?.exceptionDetailList) {
      for (const detail of error.errorResponse.exception.exceptionDetailList) {
        console.error(`  [${detail.exceptionCode}] ${detail.exceptionDescription}`);
      }
    }

  } else if (error instanceof KSeFError) {
    // Other library errors (KSeFAuthStatusError, KSeFSessionExpiredError)
    console.error('KSeF error:', error.message);
  }
}
```

::: warning Check order matters
`KSeFRateLimitError` and `KSeFBatchTimeoutError` both extend `KSeFApiError`, so always check the specific subclasses **before** `KSeFApiError`. Otherwise, the `KSeFApiError` branch would catch them too.
:::

### React to `ForbiddenReasonCode` values

```typescript
import { KSeFForbiddenError } from 'ksef-client-ts';

function handleForbidden(error: KSeFForbiddenError): void {
  switch (error.reasonCode) {
    case 'missing-permissions':
      // The authenticated subject lacks a required KSeF permission.
      // Action: grant the permission via PermissionService or KSeF portal.
      console.error('Missing permission. Grant access and retry.');
      break;

    case 'ip-not-allowed':
      // Request came from an IP outside the session's allowed range.
      // Action: check network config or re-open session from allowed IP.
      console.error('IP address not allowed for this session.');
      break;

    case 'insufficient-resource-access':
      // Subject is authenticated but cannot access this specific resource.
      // Action: verify the NIP or invoice reference belongs to the subject.
      console.error('Cannot access this resource. Check NIP/invoice ownership.');
      break;

    case 'auth-method-not-allowed':
      // The auth method (token vs certificate) is not permitted here.
      // Action: switch authentication method.
      console.error('Auth method not allowed. Try certificate-based auth.');
      break;

    case 'security-service-blocked':
      // KSeF security subsystem blocked the request.
      // Action: contact KSeF support with the traceId.
      console.error(`Blocked by security. Contact support (trace: ${error.traceId})`);
      break;

    case 'context-type-not-allowed':
      // Session context type does not permit this operation.
      // Action: re-open session with correct context identifier type.
      console.error('Context type not allowed. Re-open session with correct context.');
      break;

    default:
      // Unknown reason code (future API additions).
      console.error(`Forbidden: ${error.reasonCode} — ${error.detail}`);
  }
}
```

### Handle rate limiting gracefully

```typescript
import { KSeFRateLimitError } from 'ksef-client-ts';

async function sendWithRateLimitRetry(
  client: KSeFClient,
  invoiceXml: string,
  maxRetries = 3,
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await client.invoices.sendInvoice(invoiceXml);
    } catch (error) {
      if (error instanceof KSeFRateLimitError && i < maxRetries - 1) {
        const delayMs = error.recommendedDelay * 1000;
        console.warn(`Rate limited, waiting ${error.recommendedDelay}s before retry ${i + 1}`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Unreachable');
}
```

### Distinguish server errors from validation errors

```typescript
import { KSeFApiError, KSeFValidationError } from 'ksef-client-ts';

try {
  await client.invoices.sendInvoice(invoiceXml);
} catch (error) {
  if (error instanceof KSeFValidationError) {
    // Client-side: fix the input, no need to contact KSeF
    console.error('Fix these validation errors before sending:');
    error.details.forEach((d) => console.error(`  - ${d.message}`));
  } else if (error instanceof KSeFApiError) {
    // Server-side: the request reached KSeF and was rejected
    console.error(`Server rejected with HTTP ${error.statusCode}`);
  }
}
```

---

## Automatic Recovery

The `RestClient` handles several error types transparently before they reach your code. Understanding what happens internally helps you write correct error handling.

**File:** `src/http/rest-client.ts`, method `sendRequest()` (lines 71-131)

### Retry on 429 / 5xx / network errors

Retryable responses (429, 500, 502, 503, 504) and network errors (`ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `AbortError`) are retried up to `maxRetries` times (default: 3) with exponential backoff and jitter.

For 429 responses, the `Retry-After` header is respected -- if present, its value overrides the calculated backoff delay.

```
Your code calls client.invoices.sendInvoice()
  │
  ├── Attempt 0: 429 → sleep(Retry-After or backoff) → retry
  ├── Attempt 1: 502 → sleep(backoff) → retry
  ├── Attempt 2: 200 → success, your code gets the result
  │
  └── (if attempt 3 also fails: ensureSuccess() throws the error to your code)
```

**What you see:** Either a successful result (if any retry succeeded) or a `KSeFRateLimitError` / `KSeFApiError` (if all retries failed).

### Auto-refresh on 401

When the first attempt returns 401, the `RestClient` calls `AuthManager.onUnauthorized()` to refresh the access token. If the refresh succeeds, the request is retried once with the new token.

```
Your code calls client.invoices.getInvoice()
  │
  ├── Attempt 0: 401 → AuthManager.onUnauthorized()
  │   ├── Refresh succeeded → retry with new token → 200 → success
  │   └── Refresh failed → ensureSuccess() → throw KSeFUnauthorizedError
  │
  └── (auth refresh only attempted on first attempt, not during retries)
```

Guard conditions on auto-refresh:
- Only on `attempt === 0` (first attempt, not during retries)
- Only if `AuthManager` is configured (i.e., user has logged in)
- Skipped for requests marked with `.skipAuthRetry()` (auth endpoints themselves, to prevent infinite refresh loops)

**What you see:** Either a successful result (if refresh worked) or a `KSeFUnauthorizedError` (if refresh failed or was not possible).

### Dedup refresh

When multiple concurrent requests all receive 401 simultaneously, `DefaultAuthManager` deduplicates the refresh calls -- only the first triggers the actual refresh; all others await the same promise.

**File:** `src/http/auth-manager.ts`

---

## Error Logging for Support Tickets

When contacting KSeF support (Ministerstwo Finansow), the `traceId` is the most important piece of information. Both `KSeFUnauthorizedError` and `KSeFForbiddenError` carry it.

```typescript
import { KSeFError, KSeFUnauthorizedError, KSeFForbiddenError, KSeFApiError } from 'ksef-client-ts';

function logKSeFError(error: KSeFError): void {
  const entry: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };

  // Extract traceId for RFC 7807 errors
  if (error instanceof KSeFUnauthorizedError || error instanceof KSeFForbiddenError) {
    entry.traceId = error.traceId;
    entry.detail = error.detail;
    entry.instance = error.instance;
  }

  // Extract reasonCode for 403
  if (error instanceof KSeFForbiddenError) {
    entry.reasonCode = error.reasonCode;
    entry.security = error.security;
  }

  // Extract exception details for generic API errors
  if (error instanceof KSeFApiError) {
    entry.statusCode = error.statusCode;
    const details = error.errorResponse?.exception;
    if (details) {
      entry.serviceCode = details.serviceCode;
      entry.referenceNumber = details.referenceNumber;
      entry.timestamp = details.timestamp;
      entry.exceptions = details.exceptionDetailList;
    }
  }

  console.error('[KSeF Error]', JSON.stringify(entry, null, 2));
}
```

Example output for a support ticket:

```json
{
  "name": "KSeFForbiddenError",
  "message": "Subject does not have required permissions",
  "traceId": "abc-123-def-456",
  "detail": "Subject does not have required permissions",
  "instance": "/v2/online/Invoice/Send",
  "reasonCode": "missing-permissions",
  "security": { "requiredPermission": "InvoiceWrite" }
}
```

When filing a KSeF support ticket, include: the `traceId`, the `instance` (endpoint path), the timestamp (from your logs), and the `reasonCode` or `exceptionCode`.

---

## Integration with Workflows

Workflow functions in `src/workflows/` orchestrate multi-step operations (export, batch upload, session management). Errors propagate through them with additional context.

### Polling timeout

**File:** `src/workflows/polling.ts`

The `pollUntil()` utility polls an async action until a condition is met or a maximum number of attempts is reached. On timeout, it throws a plain `Error` (not a `KSeFError`):

```typescript
throw new Error(
  `Polling timeout: ${description} after ${maxAttempts} attempts`
);
```

Default polling: 2000ms interval, 60 attempts (2 minutes total). Configure via `PollOptions`:

```typescript
interface PollOptions {
  intervalMs?: number;   // default: 2000
  maxAttempts?: number;  // default: 60
  onProgress?: (attempt: number, maxAttempts: number) => void;
}
```

### Export workflow errors

**File:** `src/workflows/invoice-export-workflow.ts`

The `exportInvoices()` and `exportAndDownload()` functions can throw:

1. **Any `KSeFError` subclass** from the underlying API calls (`client.invoices.exportInvoices()`, `client.invoices.getInvoiceExportStatus()`).
2. **`Error("Export failed: {code} -- {description}")`** when the export status poll completes with a non-200 status code (the server accepted the export request but the operation itself failed).
3. **`Error("Export completed but no package available")`** when the export succeeds but returns no downloadable package.
4. **`Error("Download failed for part N: HTTP {status}")`** when downloading an encrypted export part fails.
5. **Polling timeout** from `pollUntil()`.

### Error handling in workflows

```typescript
import { KSeFError, KSeFRateLimitError } from 'ksef-client-ts';
import { exportAndDownload } from 'ksef-client-ts/workflows';

try {
  const result = await exportAndDownload(client, filters, { extract: true });
} catch (error) {
  if (error instanceof KSeFRateLimitError) {
    // Rate limited during export initiation or status polling
    console.warn('Export rate limited, retry later');
  } else if (error instanceof KSeFError) {
    // Other KSeF API error during the workflow
    console.error('KSeF error during export:', error.message);
  } else if (error instanceof Error && error.message.startsWith('Polling timeout')) {
    // Export is taking too long -- increase maxAttempts or check KSeF status
    console.error('Export polling timed out');
  } else if (error instanceof Error && error.message.startsWith('Export failed')) {
    // KSeF accepted the export but the operation failed server-side
    console.error('Export operation failed:', error.message);
  } else {
    throw error;
  }
}
```

---

## Summary Table

| Error class | HTTP status | Body format | Key fields | Automatic recovery |
|-------------|------------|-------------|------------|-------------------|
| `KSeFApiError` | any non-2xx | `ApiErrorResponse` | `statusCode`, `errorResponse` | Retry on 5xx |
| `KSeFBadRequestError` | 400 | RFC 7807 `BadRequestProblemDetails` | `errors[]`, `detail`, `traceId`, `instance`, `timestamp` | None (fix the request) |
| `KSeFRateLimitError` | 429 | RFC 7807 `TooManyRequestsProblemDetails` or legacy `TooManyRequestsResponse` | `retryAfterSeconds`, `recommendedDelay`, `problem?` | Retry with `Retry-After` |
| `KSeFBatchTimeoutError` | any non-2xx (KSeF code 21208) | `ApiErrorResponse` | `errorCode` (21208), `statusCode`, `errorResponse` | None (retry with smaller batch) |
| `KSeFUnauthorizedError` | 401 | RFC 7807 `UnauthorizedProblemDetails` | `detail`, `traceId`, `instance`, `timestamp` | Token refresh, then retry once |
| `KSeFForbiddenError` | 403 | RFC 7807 `ForbiddenProblemDetails` | `reasonCode`, `detail`, `traceId`, `security`, `timestamp` | None (not retryable) |
| `KSeFGoneError` | 410 | RFC 7807 `GoneProblemDetails` | `detail`, `traceId`, `instance`, `timestamp` | None (re-issue the underlying action) |
| `KSeFAuthStatusError` | -- | -- | `referenceNumber`, `statusDescription` | None |
| `KSeFSessionExpiredError` | -- | -- | `message` | None |
| `KSeFValidationError` | -- | -- | `details[]` with `field` and `message` | None (client-side) |

---

## Files Reference

| File | Contents |
|------|----------|
| `src/errors/types.ts` | `ApiErrorResponse`, `ExceptionDetails`, `TooManyRequestsResponse`, `UnauthorizedProblemDetails`, `ForbiddenProblemDetails`, `ForbiddenReasonCode`, `GoneProblemDetails` |
| `src/errors/ksef-error.ts` | `KSeFError` base class |
| `src/errors/ksef-api-error.ts` | `KSeFApiError` with `fromResponse()` factory |
| `src/errors/ksef-rate-limit-error.ts` | `KSeFRateLimitError` with `fromRetryAfterHeader()` factory |
| `src/errors/ksef-batch-timeout-error.ts` | `KSeFBatchTimeoutError` with `fromResponse()` factory (KSeF code 21208) |
| `src/errors/error-codes.ts` | `KSeFErrorCode` numeric code registry + `hasErrorCode()` helper |
| `src/errors/ksef-unauthorized-error.ts` | `KSeFUnauthorizedError` |
| `src/errors/ksef-forbidden-error.ts` | `KSeFForbiddenError` |
| `src/errors/ksef-gone-error.ts` | `KSeFGoneError` (HTTP 410, retention expired) |
| `src/errors/ksef-auth-status-error.ts` | `KSeFAuthStatusError` |
| `src/errors/ksef-session-expired-error.ts` | `KSeFSessionExpiredError` |
| `src/errors/ksef-validation-error.ts` | `KSeFValidationError`, `ValidationDetail` |
| `src/errors/index.ts` | Barrel re-exports for all error types |
| `src/http/rest-client.ts` | `ensureSuccess()` dispatch, `sendRequest()` retry + auth refresh |
| `src/http/retry-policy.ts` | `RetryPolicy`, `parseRetryAfter()`, `calculateBackoff()` |
| `src/http/auth-manager.ts` | `AuthManager` interface, dedup refresh logic |
| `src/workflows/polling.ts` | `pollUntil()` with timeout |
| `src/workflows/invoice-export-workflow.ts` | Export workflow error propagation |
