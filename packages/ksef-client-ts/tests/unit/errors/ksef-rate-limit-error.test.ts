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

  it('fromRetryAfterHeader() surfaces Problem Details body when provided', () => {
    const err = KSeFRateLimitError.fromRetryAfterHeader(429, '30', undefined, {
      title: 'Too Many Requests',
      status: 429,
      detail: 'Quota exceeded',
      instance: '/v2/sessions',
      traceId: 'trace-429',
      timestamp: '2026-04-18T10:00:00Z',
    });

    expect(err.problem?.traceId).toBe('trace-429');
    expect(err.problem?.detail).toBe('Quota exceeded');
    expect(err.problem?.instance).toBe('/v2/sessions');
    expect(err.retryAfterSeconds).toBe(30);
  });

  it('message falls back to problem.detail when retry-after header is absent', () => {
    const err = KSeFRateLimitError.fromRetryAfterHeader(429, null, undefined, {
      title: 'Too Many Requests',
      status: 429,
      detail: 'Daily quota exceeded',
      traceId: 'trace-x',
    });

    expect(err.message).toBe('Daily quota exceeded');
    expect(err.problem?.detail).toBe('Daily quota exceeded');
  });

  it('statusCode is literal 429', () => {
    const err = KSeFRateLimitError.fromRetryAfterHeader(429, '10');
    const _statusCode: 429 = err.statusCode;
    expect(_statusCode).toBe(429);
  });
});
