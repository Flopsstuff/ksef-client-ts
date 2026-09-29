import {
  type RetryPolicy,
  defaultRetryPolicy,
  calculateBackoff,
  parseRetryAfter,
  isRetryableStatus,
  sleep,
} from './retry-policy.js';

/** Default per-attempt timeout for export part downloads (parts are up to 50 MB). */
export const DEFAULT_PART_DOWNLOAD_TIMEOUT_MS = 120_000;

export interface DownloadWithRetryOptions {
  /** Fetch implementation (defaults to global `fetch`). */
  transport?: typeof fetch;
  /** Defaults to `defaultRetryPolicy()`. */
  retryPolicy?: RetryPolicy;
  /** Per-attempt limit covering the response and its body. */
  timeoutMs: number;
  /** Names the resource in error messages, e.g. `part 2`. */
  label: string;
}

/**
 * Downloads an idempotent resource outside the KSeF API (such as a presigned
 * export part) and returns its body. Each attempt has its own timeout. Retries
 * follow the retry policy: retryable statuses with backoff, 429 honouring
 * `Retry-After`, and thrown errors (network failures, timeouts, a body cut off
 * mid-stream) when `retryNetworkErrors` is set. Only use it for idempotent requests.
 */
export async function downloadWithRetry(
  url: string,
  init: RequestInit,
  options: DownloadWithRetryOptions,
): Promise<Uint8Array> {
  const transport = options.transport ?? fetch;
  const policy = options.retryPolicy ?? defaultRetryPolicy();

  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt < policy.maxRetries;
    let response: Response;
    try {
      response = await transport(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs) });
      if (response.ok) {
        return new Uint8Array(await response.arrayBuffer());
      }
    } catch (error) {
      if (!canRetry || !policy.retryNetworkErrors) throw error;
      await sleep(calculateBackoff(attempt, policy));
      continue;
    }

    if (!canRetry || !isRetryableStatus(response.status, policy)) {
      throw new Error(`Download failed for ${options.label}: HTTP ${response.status}`);
    }
    const retryAfterMs = response.status === 429 ? parseRetryAfter(response.headers.get('Retry-After')) : null;
    await response.body?.cancel().catch(() => {});
    await sleep(retryAfterMs ?? calculateBackoff(attempt, policy));
  }
}
