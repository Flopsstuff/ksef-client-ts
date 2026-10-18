export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatusCodes: number[];
  retryNetworkErrors: boolean;
  /**
   * Longest server-requested `Retry-After` delay the client will sleep for.
   * A longer request is not waited out: the response is returned as final, so
   * a 429 surfaces as `KSeFRateLimitError` carrying the server's value.
   * `maxDelayMs` caps only the computed backoff, not `Retry-After`.
   * Defaults to 120 000 ms. Values above the timer limit of 2 147 483 647 ms
   * (~24.8 days), `Infinity` included, are clamped to it, so a longer
   * `Retry-After` is never slept for and always counts as exceeding the cap.
   */
  maxRetryAfterMs?: number;
}

const DEFAULT_MAX_RETRY_AFTER_MS = 120_000;

/**
 * Longest delay `setTimeout` honours (2^31 - 1 ms, ~24.8 days). Node and
 * browsers treat anything larger as ~1 ms, which would turn a multi-week wait
 * into an immediate retry, so no retry sleep may exceed it.
 */
export const MAX_TIMER_DELAY_MS = 2_147_483_647;

export function defaultRetryPolicy(): RetryPolicy {
  return {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 30_000,
    retryableStatusCodes: [429, 500, 502, 503, 504],
    retryNetworkErrors: true,
    maxRetryAfterMs: DEFAULT_MAX_RETRY_AFTER_MS,
  };
}

export function calculateBackoff(attempt: number, policy: RetryPolicy): number {
  const exponential = policy.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * policy.baseDelayMs;
  return Math.min(exponential + jitter, policy.maxDelayMs, MAX_TIMER_DELAY_MS);
}

/**
 * Parses a `Retry-After` header (seconds or HTTP-date) into milliseconds.
 * A negative value or a date in the past means "retry now" and yields `0`.
 * A non-finite value (`Infinity`, `1e400`) is malformed and yields `null`,
 * so the caller falls back to backoff rather than hammering the server.
 */
export function parseRetryAfter(header: string | null): number | null {
  if (!header?.trim()) return null;

  const seconds = Number(header);
  if (!Number.isNaN(seconds)) {
    return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : null;
  }

  const date = new Date(header);
  if (!Number.isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return null;
}

/** Statuses whose `Retry-After` is honoured: 429 (RFC 6585) and 503 (RFC 9110). */
const RETRY_AFTER_STATUSES = new Set([429, 503]);

/**
 * The delay a retryable response asks for via `Retry-After`, in milliseconds,
 * or `null` when there is none to honour (other status, header absent or
 * malformed) and backoff applies.
 */
export function getRetryAfterMs(response: Response): number | null {
  if (!RETRY_AFTER_STATUSES.has(response.status)) return null;
  return parseRetryAfter(response.headers.get('Retry-After'));
}

/**
 * Whether a `Retry-After` delay is too long to wait out under `policy`.
 * The cap never exceeds `MAX_TIMER_DELAY_MS`, so a delay `sleep()` cannot
 * honour is always reported as too long rather than retried at once.
 */
export function exceedsMaxRetryAfter(delayMs: number, policy: RetryPolicy): boolean {
  const cap = Math.min(policy.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS, MAX_TIMER_DELAY_MS);
  return delayMs > cap;
}

const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/** Failures raised before any byte of the request reached the server. */
const NOT_SENT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'UND_ERR_CONNECT_TIMEOUT',
]);

const NON_IDEMPOTENT_METHODS = new Set(['POST', 'PATCH']);

function isNonIdempotent(method?: string): boolean {
  return method !== undefined && NON_IDEMPOTENT_METHODS.has(method.toUpperCase());
}

/**
 * Whether a thrown transport error may be retried.
 *
 * For a non-idempotent `method` (POST, PATCH) only errors raised before the
 * request was sent qualify: after a timeout or a dropped connection the server
 * may already have acted on it, and a retry could repeat the side effect.
 * Omitting `method` treats the request as idempotent.
 */
export function isRetryableError(error: unknown, policy: RetryPolicy, method?: string): boolean {
  if (!policy.retryNetworkErrors) return false;
  if (!(error instanceof Error)) return false;

  const code = (error as NodeJS.ErrnoException).code;
  if (isNonIdempotent(method)) {
    return code !== undefined && NOT_SENT_ERROR_CODES.has(code);
  }

  if (error.name === 'AbortError') return true;

  if (code && RETRYABLE_ERROR_CODES.has(code)) return true;

  return false;
}

/**
 * Whether a response status may be retried.
 *
 * For a non-idempotent `method` (POST, PATCH) only `429` qualifies: the server
 * rejected the request without acting on it. A `5xx` may arrive after the
 * server already processed the request, so retrying could repeat its effect.
 * Omitting `method` treats the request as idempotent.
 */
export function isRetryableStatus(status: number, policy: RetryPolicy, method?: string): boolean {
  if (!policy.retryableStatusCodes.includes(status)) return false;
  return !isNonIdempotent(method) || status === 429;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
