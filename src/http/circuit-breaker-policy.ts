import { consola } from 'consola';
import { KSeFCircuitOpenError } from '../errors/ksef-circuit-open-error.js';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  openMs: number;
  scope?: 'global' | 'endpoint';
}

interface CircuitState {
  failures: number;
  openedAt: number | null;
  lastFailureAt: number | null;
  probeInFlight: boolean;
}

const GLOBAL_KEY = '__global__';

export class CircuitBreakerPolicy {
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly scope: 'global' | 'endpoint';
  private readonly states = new Map<string, CircuitState>();

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    const failureThreshold = config.failureThreshold ?? 5;
    const openMs = config.openMs ?? 30_000;

    if (!Number.isInteger(failureThreshold) || failureThreshold <= 0) {
      throw new RangeError('CircuitBreakerPolicy: failureThreshold must be a positive integer');
    }
    if (!Number.isFinite(openMs) || openMs <= 0) {
      throw new RangeError('CircuitBreakerPolicy: openMs must be > 0');
    }

    this.failureThreshold = failureThreshold;
    this.openMs = openMs;
    this.scope = config.scope ?? 'global';
  }

  // Returns true iff this call just claimed the single probe slot for the
  // caller. The caller MUST pass `alreadyOwnsProbe=true` on subsequent
  // re-checks for the same logical request (e.g. a retry loop) so the probe
  // owner cannot deadlock itself on its own in-flight slot.
  ensureClosed(endpoint: string, alreadyOwnsProbe = false): boolean {
    const key = this.keyFor(endpoint);
    const state = this.states.get(key);
    if (!state || state.openedAt === null) return false;

    const now = performance.now();
    const elapsed = now - state.openedAt;
    if (elapsed >= this.openMs) {
      // Probe owner re-entering (e.g. after retryable failure + continue) —
      // pass through without touching state; the original claim is still live.
      if (alreadyOwnsProbe) return false;
      // Half-open: allow exactly one probe through. Further callers see an open
      // circuit (retryAfterMs=0) until the in-flight probe resolves — prevents
      // a burst from flooding a fragile upstream the moment the cooldown ends.
      if (state.probeInFlight) {
        throw new KSeFCircuitOpenError(endpoint, state.openedAt, 0);
      }
      state.probeInFlight = true;
      consola.debug(`Circuit breaker: probe after cooldown for '${key}'`);
      return true;
    }

    const retryAfterMs = Math.max(0, this.openMs - elapsed);
    throw new KSeFCircuitOpenError(endpoint, state.openedAt, retryAfterMs);
  }

  recordSuccess(endpoint: string): void {
    const key = this.keyFor(endpoint);
    const state = this.states.get(key);
    if (!state) return;

    if (state.openedAt !== null || state.failures > 0) {
      consola.debug(`Circuit breaker: reset for '${key}'`);
    }
    this.states.delete(key);
  }

  recordFailure(endpoint: string): void {
    const key = this.keyFor(endpoint);
    const now = performance.now();
    let state = this.states.get(key);

    if (!state) {
      state = { failures: 0, openedAt: null, lastFailureAt: null, probeInFlight: false };
      this.states.set(key, state);
    }

    // Probe failure: the breaker was open, ensureClosed() claimed the probe slot,
    // and that single in-flight probe has now failed. Re-open and clear the flag
    // so the next cooldown cycle can issue a fresh probe.
    if (state.openedAt !== null && state.probeInFlight) {
      state.openedAt = now;
      state.failures = this.failureThreshold;
      state.lastFailureAt = now;
      state.probeInFlight = false;
      consola.debug(`Circuit breaker: probe failed, re-opened for '${key}'`);
      return;
    }

    const slidingStale =
      state.lastFailureAt !== null && now - state.lastFailureAt > this.openMs;

    state.failures = slidingStale ? 1 : state.failures + 1;
    state.lastFailureAt = now;

    if (state.openedAt === null && state.failures >= this.failureThreshold) {
      state.openedAt = now;
      consola.debug(
        `Circuit breaker: opened for '${key}' after ${state.failures} failures (cooldown ${this.openMs}ms)`,
      );
    }
  }

  private keyFor(endpoint: string): string {
    return this.scope === 'global' ? GLOBAL_KEY : endpoint;
  }
}

export function defaultCircuitBreakerPolicy(): CircuitBreakerPolicy {
  return new CircuitBreakerPolicy();
}
