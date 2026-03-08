import { describe, it, expect, vi } from 'vitest';
import { KSeFRateLimitError, KSeFApiError } from '../../../src/errors/index.js';

describe('KSeFRateLimitError', () => {
  it('fromRetryAfterHeader() with numeric "60"', () => {
    const err = KSeFRateLimitError.fromRetryAfterHeader(429, '60');

    expect(err.retryAfterSeconds).toBe(60);
    expect(err.recommendedDelay).toBe(60);
    expect(err.retryAfterDate).toBeUndefined();
  });

  it('fromRetryAfterHeader() with numeric "0"', () => {
    const err = KSeFRateLimitError.fromRetryAfterHeader(429, '0');

    expect(err.retryAfterSeconds).toBe(0);
    expect(err.recommendedDelay).toBe(0);
  });

  it('fromRetryAfterHeader() with HTTP-date', () => {
    const futureDate = new Date(Date.now() + 120_000);
    const err = KSeFRateLimitError.fromRetryAfterHeader(429, futureDate.toUTCString());

    expect(err.retryAfterDate).toBeInstanceOf(Date);
    expect(err.retryAfterSeconds).toBeGreaterThan(0);
    expect(err.retryAfterSeconds).toBeLessThanOrEqual(120);
  });

  it('fromRetryAfterHeader() with null header defaults recommendedDelay to 60', () => {
    const err = KSeFRateLimitError.fromRetryAfterHeader(429, null);

    expect(err.retryAfterSeconds).toBeUndefined();
    expect(err.recommendedDelay).toBe(60);
  });

  it('fromRetryAfterHeader() with undefined header defaults recommendedDelay to 60', () => {
    const err = KSeFRateLimitError.fromRetryAfterHeader(429, undefined);

    expect(err.retryAfterSeconds).toBeUndefined();
    expect(err.recommendedDelay).toBe(60);
  });

  it('message contains "Retry after" when retry info present', () => {
    const err = KSeFRateLimitError.fromRetryAfterHeader(429, '30');

    expect(err.message).toContain('Retry after');
  });

  it('message contains "Rate limited" when no retry info', () => {
    const err = KSeFRateLimitError.fromRetryAfterHeader(429, null);

    expect(err.message).toContain('Rate limited');
  });

  it('extends KSeFApiError', () => {
    const err = KSeFRateLimitError.fromRetryAfterHeader(429, '10');

    expect(err).toBeInstanceOf(KSeFApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('KSeFRateLimitError');
  });
});
