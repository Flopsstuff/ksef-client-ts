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
    const scope = config.scope ?? 'global';
    if (scope !== 'global' && scope !== 'endpoint') {
      throw new RangeError(
        "CircuitBreakerPolicy: scope must be 'global' or 'endpoint'",
      );
    }

    this.failureThreshold = failureThreshold;
    this.openMs = openMs;
    this.scope = scope;
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

  // Release a claimed probe slot WITHOUT observing an outcome. Use this when
  // the probe attempt was aborted before reaching upstream (e.g. rate-limit
  // acquire rejected, client cancellation). We have no new information about
  // upstream health, so the breaker must stay OPEN — but we do restart the
  // cooldown clock so the next probe attempt waits a fresh `openMs`,
  // preventing a tight loop of aborted probes from spamming the limiter.
  releaseProbe(endpoint: string): void {
    const key = this.keyFor(endpoint);
    const state = this.states.get(key);
    if (!state || !state.probeInFlight) return;
    state.probeInFlight = false;
    if (state.openedAt !== null) {
      state.openedAt = performance.now();
    }
    consola.debug(`Circuit breaker: probe aborted (not observed) for '${key}', cooldown restarted`);
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
      this.maybeSweepStaleClosed(now, key);
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

    this.maybeSweepStaleClosed(now, key);
  }

  private keyFor(endpoint: string): string {
    return this.scope === 'global' ? GLOBAL_KEY : endpoint;
  }

  // Prevent unbounded map growth under `scope: 'endpoint'` when callers hit
  // many distinct parameterized paths (e.g. `auth/sessions/{ref}`) that each
  // fail once and are never revisited. Global scope is always a single entry.
  //
  // Runs amortized O(n) — gated on a size threshold so small workloads pay
  // nothing. Only evicts states that are genuinely settled: closed, no probe
  // in flight, and with the last failure older than two cooldowns.
  private maybeSweepStaleClosed(now: number, keepKey: string): void {
    if (this.scope !== 'endpoint') return;
    if (this.states.size <= CircuitBreakerPolicy.sweepThreshold) return;

    const staleBefore = now - 2 * this.openMs;
    for (const [key, state] of this.states) {
      if (key === keepKey) continue;
      if (state.openedAt !== null) continue;
      if (state.probeInFlight) continue;
      if (state.lastFailureAt !== null && state.lastFailureAt < staleBefore) {
        this.states.delete(key);
      }
    }
  }

  private static readonly sweepThreshold = 64;
}

export function defaultCircuitBreakerPolicy(): CircuitBreakerPolicy {
  return new CircuitBreakerPolicy();
}
