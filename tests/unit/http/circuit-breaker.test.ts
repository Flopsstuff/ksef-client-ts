import { describe, it, expect } from 'vitest';
import {
  CircuitBreakerPolicy,
  defaultCircuitBreakerPolicy,
} from '../../../src/http/circuit-breaker-policy.js';
import { KSeFCircuitOpenError } from '../../../src/errors/ksef-circuit-open-error.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('CircuitBreakerPolicy', () => {
  describe('defaults & validation', () => {
    it('defaultCircuitBreakerPolicy() returns an instance', () => {
      expect(defaultCircuitBreakerPolicy()).toBeInstanceOf(CircuitBreakerPolicy);
    });

    it('throws on non-positive failureThreshold', () => {
      expect(() => new CircuitBreakerPolicy({ failureThreshold: 0 })).toThrow(RangeError);
      expect(() => new CircuitBreakerPolicy({ failureThreshold: -1 })).toThrow(RangeError);
      expect(() => new CircuitBreakerPolicy({ failureThreshold: NaN })).toThrow(RangeError);
    });

    it('throws on non-positive openMs', () => {
      expect(() => new CircuitBreakerPolicy({ openMs: 0 })).toThrow(RangeError);
      expect(() => new CircuitBreakerPolicy({ openMs: -100 })).toThrow(RangeError);
      expect(() => new CircuitBreakerPolicy({ openMs: Infinity })).toThrow(RangeError);
    });

    it('defaults ensureClosed does not throw when nothing recorded', () => {
      const p = defaultCircuitBreakerPolicy();
      expect(() => p.ensureClosed('/a')).not.toThrow();
    });
  });

  describe('state transitions', () => {
    it('CLOSED → OPEN after reaching threshold', () => {
      const p = new CircuitBreakerPolicy({ failureThreshold: 3, openMs: 1000 });
      p.recordFailure('/a');
      p.recordFailure('/a');
      // Not yet threshold
      expect(() => p.ensureClosed('/a')).not.toThrow();
      p.recordFailure('/a');
      expect(() => p.ensureClosed('/a')).toThrow(KSeFCircuitOpenError);
    });

    it('carries retryAfterMs and endpoint on the thrown error', () => {
      const p = new CircuitBreakerPolicy({ failureThreshold: 1, openMs: 5000 });
      p.recordFailure('/sessions/online/open');
      try {
        p.ensureClosed('/sessions/online/open');
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(KSeFCircuitOpenError);
        const e = err as KSeFCircuitOpenError;
        expect(e.endpoint).toBe('/sessions/online/open');
        expect(e.retryAfterMs).toBeGreaterThan(0);
        expect(e.retryAfterMs).toBeLessThanOrEqual(5000);
      }
    });

    it('OPEN → probe after cooldown elapses', async () => {
      const p = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 30 });
      p.recordFailure('/a');
      p.recordFailure('/a');
      expect(() => p.ensureClosed('/a')).toThrow(KSeFCircuitOpenError);

      await sleep(50);
      expect(() => p.ensureClosed('/a')).not.toThrow();
    });

    it('probe success closes circuit and zeroes counter', async () => {
      const p = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 30 });
      p.recordFailure('/a');
      p.recordFailure('/a');
      await sleep(50);
      expect(() => p.ensureClosed('/a')).not.toThrow();
      p.recordSuccess('/a');
      // Immediately calling ensureClosed should pass (state cleared)
      expect(() => p.ensureClosed('/a')).not.toThrow();
      // And we should need threshold fresh failures to re-open
      p.recordFailure('/a');
      expect(() => p.ensureClosed('/a')).not.toThrow();
    });

    it('probe failure re-opens with a fresh cooldown', async () => {
      const p = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 30 });
      p.recordFailure('/a');
      p.recordFailure('/a');
      await sleep(50);
      expect(() => p.ensureClosed('/a')).not.toThrow();
      p.recordFailure('/a');
      expect(() => p.ensureClosed('/a')).toThrow(KSeFCircuitOpenError);
    });

    it('after cooldown, only one probe is allowed through — concurrent callers still see OPEN', async () => {
      const p = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 30 });
      p.recordFailure('/a');
      p.recordFailure('/a');
      await sleep(50);
      // First caller claims the single probe slot.
      expect(() => p.ensureClosed('/a')).not.toThrow();
      // Second caller arrives before the probe resolves — still OPEN.
      expect(() => p.ensureClosed('/a')).toThrow(KSeFCircuitOpenError);
      // Probe resolves with success — circuit closes; both callers now fine.
      p.recordSuccess('/a');
      expect(() => p.ensureClosed('/a')).not.toThrow();
      expect(() => p.ensureClosed('/a')).not.toThrow();
    });

    it('sliding reset: a failure older than openMs is dropped, counter restarts at 1', async () => {
      const p = new CircuitBreakerPolicy({ failureThreshold: 3, openMs: 30 });
      p.recordFailure('/a');
      p.recordFailure('/a');
      await sleep(50);
      p.recordFailure('/a');
      // Should NOT open — stale counter got reset
      expect(() => p.ensureClosed('/a')).not.toThrow();
    });

    it('recordSuccess on clean state is a no-op', () => {
      const p = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 100 });
      expect(() => p.recordSuccess('/a')).not.toThrow();
      p.recordFailure('/a');
      p.recordSuccess('/a'); // resets
      p.recordFailure('/a');
      // Still needs 2 failures total; we only have 1
      expect(() => p.ensureClosed('/a')).not.toThrow();
    });
  });

  describe('scope', () => {
    it('scope=global: failures on one path trip circuit for another', () => {
      const p = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 1000, scope: 'global' });
      p.recordFailure('/a');
      p.recordFailure('/b');
      expect(() => p.ensureClosed('/c')).toThrow(KSeFCircuitOpenError);
    });

    it('scope=endpoint: failures on /a do not open circuit for /b', () => {
      const p = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 1000, scope: 'endpoint' });
      p.recordFailure('/a');
      p.recordFailure('/a');
      expect(() => p.ensureClosed('/a')).toThrow(KSeFCircuitOpenError);
      expect(() => p.ensureClosed('/b')).not.toThrow();
    });

    it('default scope is global', () => {
      const p = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 1000 });
      p.recordFailure('/a');
      p.recordFailure('/b');
      expect(() => p.ensureClosed('/c')).toThrow(KSeFCircuitOpenError);
    });
  });
});
