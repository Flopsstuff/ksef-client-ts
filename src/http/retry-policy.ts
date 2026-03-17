export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatusCodes: number[];
  retryNetworkErrors: boolean;
}

export function defaultRetryPolicy(): RetryPolicy {
  return {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 30_000,
    retryableStatusCodes: [429, 500, 502, 503, 504],
    retryNetworkErrors: true,
  };
}

export function calculateBackoff(attempt: number, policy: RetryPolicy): number {
  const exponential = policy.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * policy.baseDelayMs;
  return Math.min(exponential + jitter, policy.maxDelayMs);
}

export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  const seconds = Number(header);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }

  const date = new Date(header);
  if (!Number.isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return null;
}

const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
]);

export function isRetryableError(error: unknown, policy: RetryPolicy): boolean {
  if (!policy.retryNetworkErrors) return false;
  if (!(error instanceof Error)) return false;

  if (error.name === 'AbortError') return true;

  const code = (error as NodeJS.ErrnoException).code;
  if (code && RETRYABLE_ERROR_CODES.has(code)) return true;

  return false;
}

export function isRetryableStatus(status: number, policy: RetryPolicy): boolean {
  return policy.retryableStatusCodes.includes(status);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
