import { describe, it, expect, vi } from 'vitest';
import {
  defaultRetryPolicy,
  calculateBackoff,
  parseRetryAfter,
  isRetryableError,
  isRetryableStatus,
  sleep,
  type RetryPolicy,
} from '../../../src/http/retry-policy.js';

describe('defaultRetryPolicy', () => {
  it('returns correct defaults', () => {
    const policy = defaultRetryPolicy();

    expect(policy.maxRetries).toBe(3);
    expect(policy.baseDelayMs).toBe(500);
    expect(policy.maxDelayMs).toBe(30_000);
    expect(policy.retryableStatusCodes).toEqual([429, 500, 502, 503, 504]);
    expect(policy.retryNetworkErrors).toBe(true);
  });

  it('returns a new object each call', () => {
    const a = defaultRetryPolicy();
    const b = defaultRetryPolicy();

    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('calculateBackoff', () => {
  const policy = defaultRetryPolicy();

  it('attempt 0 with base 500 returns between 500 and 1000', () => {
    for (let i = 0; i < 20; i++) {
      const delay = calculateBackoff(0, policy);
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThanOrEqual(1000);
    }
  });

  it('attempt 1 with base 500 returns between 1000 and 1500', () => {
    for (let i = 0; i < 20; i++) {
      const delay = calculateBackoff(1, policy);
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(1500);
    }
  });

  it('attempt 2 with base 500 returns between 2000 and 2500', () => {
    for (let i = 0; i < 20; i++) {
      const delay = calculateBackoff(2, policy);
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThanOrEqual(2500);
    }
  });

  it('result is capped at maxDelayMs', () => {
    const cappedPolicy: RetryPolicy = {
      ...defaultRetryPolicy(),
      maxDelayMs: 100,
    };

    for (let i = 0; i < 20; i++) {
      const delay = calculateBackoff(10, cappedPolicy);
      expect(delay).toBeLessThanOrEqual(100);
    }
  });

  it('jitter adds randomness (not all results identical)', () => {
    const results = new Set<number>();
    for (let i = 0; i < 50; i++) {
      results.add(calculateBackoff(0, policy));
    }
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('parseRetryAfter', () => {
  it('numeric string "5" returns 5000 ms', () => {
    expect(parseRetryAfter('5')).toBe(5000);
  });

  it('"0" returns 0', () => {
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('HTTP-date string returns correct ms delta', () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const futureDate = new Date(now + 60_000);
    const result = parseRetryAfter(futureDate.toUTCString());

    expect(result).toBe(60_000);

    vi.restoreAllMocks();
  });

  it('null returns null', () => {
    expect(parseRetryAfter(null)).toBeNull();
  });

  it('invalid string returns null', () => {
    expect(parseRetryAfter('not-a-date-or-number')).toBeNull();
  });
});

describe('isRetryableError', () => {
  const policy = defaultRetryPolicy();

  it('Error with code ECONNRESET is retryable', () => {
    const err = new Error('connection reset');
    (err as NodeJS.ErrnoException).code = 'ECONNRESET';
    expect(isRetryableError(err, policy)).toBe(true);
  });

  it('Error with code ECONNREFUSED is retryable', () => {
    const err = new Error('connection refused');
    (err as NodeJS.ErrnoException).code = 'ECONNREFUSED';
    expect(isRetryableError(err, policy)).toBe(true);
  });

  it('Error with code ETIMEDOUT is retryable', () => {
    const err = new Error('timed out');
    (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
    expect(isRetryableError(err, policy)).toBe(true);
  });

  it('Error with code UND_ERR_CONNECT_TIMEOUT is retryable', () => {
    const err = new Error('undici connect timeout');
    (err as NodeJS.ErrnoException).code = 'UND_ERR_CONNECT_TIMEOUT';
    expect(isRetryableError(err, policy)).toBe(true);
  });

  it('Error with name AbortError is retryable', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(isRetryableError(err, policy)).toBe(true);
  });

  it('regular Error without code is not retryable', () => {
    const err = new Error('something went wrong');
    expect(isRetryableError(err, policy)).toBe(false);
  });

  it('non-Error value is not retryable', () => {
    expect(isRetryableError('string error', policy)).toBe(false);
    expect(isRetryableError(42, policy)).toBe(false);
    expect(isRetryableError(null, policy)).toBe(false);
    expect(isRetryableError(undefined, policy)).toBe(false);
  });

  it('retryNetworkErrors:false makes all errors non-retryable', () => {
    const noRetryPolicy: RetryPolicy = {
      ...defaultRetryPolicy(),
      retryNetworkErrors: false,
    };

    const err = new Error('connection reset');
    (err as NodeJS.ErrnoException).code = 'ECONNRESET';
    expect(isRetryableError(err, noRetryPolicy)).toBe(false);

    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    expect(isRetryableError(abortErr, noRetryPolicy)).toBe(false);
  });
});

describe('isRetryableStatus', () => {
  const policy = defaultRetryPolicy();

  it.each([429, 500, 502, 503, 504])('status %i is retryable with defaults', (status) => {
    expect(isRetryableStatus(status, policy)).toBe(true);
  });

  it.each([400, 401, 403, 404])('status %i is not retryable with defaults', (status) => {
    expect(isRetryableStatus(status, policy)).toBe(false);
  });

  it('custom retryableStatusCodes:[409] makes 409 retryable and 500 not', () => {
    const customPolicy: RetryPolicy = {
      ...defaultRetryPolicy(),
      retryableStatusCodes: [409],
    };

    expect(isRetryableStatus(409, customPolicy)).toBe(true);
    expect(isRetryableStatus(500, customPolicy)).toBe(false);
  });
});

describe('sleep', () => {
  it('resolves after the specified delay', async () => {
    vi.useFakeTimers();

    const promise = sleep(1000);
    vi.advanceTimersByTime(1000);
    await promise;

    vi.useRealTimers();
  });
});
