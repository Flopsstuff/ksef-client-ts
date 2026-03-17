import { describe, it, expect } from 'vitest';
import {
  RateLimitPolicy,
  defaultRateLimitPolicy,
} from '../../../src/http/rate-limit-policy.js';

describe('RateLimitPolicy', () => {
  // ---------------------------------------------------------------
  // 1. defaultRateLimitPolicy() returns a RateLimitPolicy instance
  // ---------------------------------------------------------------
  describe('defaultRateLimitPolicy()', () => {
    it('returns a RateLimitPolicy instance', () => {
      const policy = defaultRateLimitPolicy();
      expect(policy).toBeInstanceOf(RateLimitPolicy);
    });
  });

  // ---------------------------------------------------------------
  // 2. Requests within limit pass immediately
  // ---------------------------------------------------------------
  describe('requests within limit', () => {
    it('resolves quickly when tokens are available', async () => {
      const policy = new RateLimitPolicy({ globalRps: 100 });
      const start = performance.now();
      await policy.acquire('/test');
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
    });
  });

  // ---------------------------------------------------------------
  // 3. Requests exceeding limit are delayed
  // ---------------------------------------------------------------
  describe('requests exceeding limit', () => {
    it('delays acquire when tokens are exhausted', async () => {
      const policy = new RateLimitPolicy({ globalRps: 2 });

      // Consume both tokens quickly
      await policy.acquire('/a');
      await policy.acquire('/a');

      // Third call should be delayed (~500ms for 1 token at 2 rps)
      const start = performance.now();
      await policy.acquire('/a');
      const elapsed = performance.now() - start;

      // Should wait at least ~400ms (allowing some tolerance)
      expect(elapsed).toBeGreaterThan(350);
    });
  });

  // ---------------------------------------------------------------
  // 4. Bucket refills over time
  // ---------------------------------------------------------------
  describe('bucket refill', () => {
    it('refills tokens over time so acquire succeeds again', async () => {
      const policy = new RateLimitPolicy({ globalRps: 5 });

      // Exhaust all 5 tokens
      for (let i = 0; i < 5; i++) {
        await policy.acquire('/x');
      }

      // Wait 250ms => should refill ~1.25 tokens (5 rps * 0.25s)
      await new Promise((r) => setTimeout(r, 250));

      const start = performance.now();
      await policy.acquire('/x');
      const elapsed = performance.now() - start;

      // Should resolve quickly since at least 1 token was refilled
      expect(elapsed).toBeLessThan(100);
    });
  });

  // ---------------------------------------------------------------
  // 5. Per-endpoint limits
  // ---------------------------------------------------------------
  describe('per-endpoint limits', () => {
    it('enforces endpoint-specific rate limit', async () => {
      const policy = new RateLimitPolicy({
        globalRps: 100,
        endpointLimits: { '/slow': 1 },
      });

      // First call uses the single endpoint token
      await policy.acquire('/slow');

      // Second call must wait for the endpoint bucket to refill (~1000ms at 1 rps)
      const start = performance.now();
      await policy.acquire('/slow');
      const elapsed = performance.now() - start;

      expect(elapsed).toBeGreaterThan(800);
    });
  });

  // ---------------------------------------------------------------
  // 6. Unknown endpoints use global only
  // ---------------------------------------------------------------
  describe('unknown endpoints', () => {
    it('uses only the global bucket for endpoints without specific limits', async () => {
      const policy = new RateLimitPolicy({
        globalRps: 100,
        endpointLimits: { '/slow': 1 },
      });

      // Calling an endpoint not in endpointLimits should resolve quickly
      const start = performance.now();
      await policy.acquire('/other');
      await policy.acquire('/other');
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
    });
  });

  // ---------------------------------------------------------------
  // 7. Concurrent acquire calls are serialized
  // ---------------------------------------------------------------
  describe('concurrent acquire calls', () => {
    it('resolves exactly N calls quickly and delays the rest', async () => {
      const policy = new RateLimitPolicy({ globalRps: 3 });

      const results: { index: number; elapsed: number }[] = [];
      const start = performance.now();

      // Fire 5 concurrent acquire calls
      const promises = Array.from({ length: 5 }, (_, i) =>
        policy.acquire('/c').then(() => {
          results.push({ index: i, elapsed: performance.now() - start });
        }),
      );

      await Promise.all(promises);

      // Sort by elapsed time
      results.sort((a, b) => a.elapsed - b.elapsed);

      // First 3 should resolve quickly (< 100ms)
      const fast = results.filter((r) => r.elapsed < 100);
      expect(fast.length).toBe(3);

      // Remaining 2 should be delayed (> 200ms)
      const slow = results.filter((r) => r.elapsed >= 200);
      expect(slow.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------
  // 8. Sequential promise chain prevents concurrent drain
  // ---------------------------------------------------------------
  describe('sequential promise chain', () => {
    it('prevents multiple concurrent acquires from draining the same token', async () => {
      const policy = new RateLimitPolicy({ globalRps: 1 });

      const timestamps: number[] = [];
      const start = performance.now();

      // Fire 3 concurrent acquires at 1 rps — they should be serialized
      const promises = [0, 1, 2].map((i) =>
        policy.acquire('/s').then(() => {
          timestamps.push(performance.now() - start);
        }),
      );

      await Promise.all(promises);
      timestamps.sort((a, b) => a - b);

      // First resolves immediately
      expect(timestamps[0]).toBeLessThan(100);

      // Second should be ~1000ms after start
      expect(timestamps[1]).toBeGreaterThan(800);

      // Third should be ~2000ms after start
      expect(timestamps[2]).toBeGreaterThan(1700);
    });
  });
});
