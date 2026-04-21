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

    it('rejects non-integer failureThreshold', () => {
      expect(() => new CircuitBreakerPolicy({ failureThreshold: 1.5 })).toThrow(RangeError);
      expect(() => new CircuitBreakerPolicy({ failureThreshold: 2.9 })).toThrow(RangeError);
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

    it('probe owner re-entering with alreadyOwnsProbe=true does NOT throw on its own slot', async () => {
      const p = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 30 });
      p.recordFailure('/a');
      p.recordFailure('/a');
      await sleep(50);
      // First claim returns true — this caller now owns the probe.
      expect(p.ensureClosed('/a')).toBe(true);
      // Same caller re-entering (e.g. internal retry of the probe request):
      // pass through without exception, without re-claiming.
      expect(p.ensureClosed('/a', true)).toBe(false);
      expect(p.ensureClosed('/a', true)).toBe(false);
      // Concurrent, non-owning caller still sees OPEN.
      expect(() => p.ensureClosed('/a')).toThrow(KSeFCircuitOpenError);
    });

    it('ensureClosed returns false in CLOSED state (nothing claimed)', () => {
      const p = new CircuitBreakerPolicy({ failureThreshold: 3, openMs: 1000 });
      expect(p.ensureClosed('/a')).toBe(false);
      p.recordFailure('/a');
      expect(p.ensureClosed('/a')).toBe(false);
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

  describe('endpoint-scope memory bound', () => {
    // Parameterized routes (e.g. `auth/sessions/${ref}`) combined with
    // scope='endpoint' could leak states indefinitely: every unique id
    // creates an entry that only recordSuccess() would delete. These tests
    // verify that stale closed entries are swept to keep the map bounded.

    const internalSize = (p: CircuitBreakerPolicy): number =>
      (p as unknown as { states: Map<string, unknown> }).states.size;

    it('sweeps stale closed entries from many distinct endpoints', async () => {
      const p = new CircuitBreakerPolicy({ failureThreshold: 100, openMs: 10, scope: 'endpoint' });
      // Record one failure for 200 distinct endpoints — all remain CLOSED
      // (1 failure << threshold 100). After priming, internal map has 200+.
      for (let i = 0; i < 200; i++) {
        p.recordFailure(`/endpoint-${i}`);
      }
      expect(internalSize(p)).toBeGreaterThanOrEqual(200);

      // Wait past 2 × openMs so the entries qualify as stale closed.
      await sleep(30);

      // One more failure on a fresh endpoint triggers the sweep path.
      p.recordFailure('/trigger');

      // Map should have shrunk dramatically — ideally just the trigger key,
      // but allow a small margin for any timing-sensitive stragglers.
      expect(internalSize(p)).toBeLessThan(10);
    });

    it('does NOT evict open entries during sweep', async () => {
      // Mix stale CLOSED entries (should be swept) with entries that the
      // breaker tripped open (must be kept). Uses threshold=1 so every
      // failure opens its own endpoint — convenient for staging OPEN state.
      const p = new CircuitBreakerPolicy({ failureThreshold: 1, openMs: 10, scope: 'endpoint' });
      for (let i = 0; i < 80; i++) {
        p.recordFailure(`/open-${i}`);
      }
      // All 80 entries are OPEN (openedAt !== null).

      await sleep(30);
      p.recordFailure('/trigger'); // fires the sweep

      // Sweep skips openedAt !== null, so all 80 remain + '/trigger' = 81.
      expect(internalSize(p)).toBeGreaterThanOrEqual(80);
      // Spot-check: a previously opened endpoint still short-circuits.
      // (Its cooldown is 10ms and we've slept 30ms, so it will transition
      // into probe state — but either way the entry is retained.)
      expect((p as unknown as { states: Map<string, unknown> }).states.has('/open-0')).toBe(true);
    });

    it('scope=global never grows past one entry regardless of endpoint count', () => {
      const p = new CircuitBreakerPolicy({ failureThreshold: 10_000, openMs: 1000, scope: 'global' });
      for (let i = 0; i < 500; i++) {
        p.recordFailure(`/endpoint-${i}`);
      }
      expect(internalSize(p)).toBe(1);
    });
  });
});
