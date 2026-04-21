import { describe, it, expect, vi } from 'vitest';
import { RestClient, type RestClientConfig } from '../../../src/http/rest-client.js';
import { RestRequest } from '../../../src/http/rest-request.js';
import type { TransportFn } from '../../../src/http/transport.js';
import type { ResolvedOptions } from '../../../src/config/options.js';
import type { AuthManager } from '../../../src/http/auth-manager.js';
import { CircuitBreakerPolicy } from '../../../src/http/circuit-breaker-policy.js';
import { KSeFCircuitOpenError } from '../../../src/errors/ksef-circuit-open-error.js';
import { KSeFApiError } from '../../../src/errors/ksef-api-error.js';
import { KSeFRateLimitError } from '../../../src/errors/ksef-rate-limit-error.js';

const defaultOptions: ResolvedOptions = {
  baseUrl: 'https://ksef-test.mf.gov.pl/api',
  baseQrUrl: 'https://ksef-test.mf.gov.pl/web',
  lighthouseUrl: 'https://ksef-test.mf.gov.pl/api',
  apiVersion: 'v2',
  timeout: 5000,
  customHeaders: {},
  errorFormat: 'problem-details',
};

function mockResponse(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: new Headers(headers) });
}

function createClient(transport: TransportFn, config?: Partial<RestClientConfig>): RestClient {
  return new RestClient(defaultOptions, {
    transport,
    retryPolicy: {
      maxRetries: 0, // isolate circuit-breaker effects from retry math
      baseDelayMs: 1,
      maxDelayMs: 10,
      retryableStatusCodes: [429, 500, 502, 503, 504],
      retryNetworkErrors: true,
    },
    ...config,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('RestClient + CircuitBreakerPolicy', () => {
  it('trips after threshold consecutive 5xx and fails fast without transport call', async () => {
    const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(500));
    const circuitBreakerPolicy = new CircuitBreakerPolicy({ failureThreshold: 3, openMs: 1000 });
    const client = createClient(transport, { circuitBreakerPolicy });

    for (let i = 0; i < 3; i++) {
      await expect(client.execute(RestRequest.get('/test'))).rejects.toThrow(KSeFApiError);
    }

    expect(transport).toHaveBeenCalledTimes(3);

    // Next call must fail fast with KSeFCircuitOpenError and NOT hit transport
    await expect(client.execute(RestRequest.get('/test'))).rejects.toThrow(KSeFCircuitOpenError);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('429 does NOT trip the breaker', async () => {
    const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(429, {}, { 'Retry-After': '0' }));
    const circuitBreakerPolicy = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 1000 });
    const client = createClient(transport, { circuitBreakerPolicy });

    for (let i = 0; i < 5; i++) {
      await expect(client.execute(RestRequest.get('/rl'))).rejects.toThrow(KSeFRateLimitError);
    }

    // Circuit must still be closed — another call goes through transport
    await expect(client.execute(RestRequest.get('/rl'))).rejects.toThrow(KSeFRateLimitError);
    expect(transport).toHaveBeenCalledTimes(6);
  });

  it('401 does NOT trip the breaker', async () => {
    const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(401, { detail: 'unauthorized' }));
    const circuitBreakerPolicy = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 1000 });
    const client = createClient(transport, { circuitBreakerPolicy });

    for (let i = 0; i < 5; i++) {
      await expect(client.execute(RestRequest.get('/auth'))).rejects.toThrow();
    }

    // Still no circuit open
    await expect(client.execute(RestRequest.get('/auth'))).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(6);
  });

  it('4xx (non-401) resets the failure counter', async () => {
    const transport = vi.fn<TransportFn>()
      .mockResolvedValueOnce(mockResponse(500))
      .mockResolvedValueOnce(mockResponse(500))
      .mockResolvedValueOnce(mockResponse(404, { message: 'not found' }))
      .mockResolvedValueOnce(mockResponse(500))
      .mockResolvedValueOnce(mockResponse(500));

    const circuitBreakerPolicy = new CircuitBreakerPolicy({ failureThreshold: 3, openMs: 1000 });
    const client = createClient(transport, { circuitBreakerPolicy });

    for (let i = 0; i < 5; i++) {
      await expect(client.execute(RestRequest.get('/t'))).rejects.toThrow(KSeFApiError);
    }

    // After 500,500,404,500,500 — counter reset by 404, only 2 fresh failures → below threshold 3
    const finalTransport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, { ok: true }));
    const client2 = new RestClient(defaultOptions, {
      transport: finalTransport,
      retryPolicy: {
        maxRetries: 0,
        baseDelayMs: 1,
        maxDelayMs: 10,
        retryableStatusCodes: [429, 500, 502, 503, 504],
        retryNetworkErrors: true,
      },
      circuitBreakerPolicy,
    });
    await client2.execute(RestRequest.get('/t'));
    expect(finalTransport).toHaveBeenCalledTimes(1);
  });

  it('probes transport after cooldown elapses', async () => {
    const transport = vi.fn<TransportFn>()
      .mockResolvedValueOnce(mockResponse(500))
      .mockResolvedValueOnce(mockResponse(500))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const circuitBreakerPolicy = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 30 });
    const client = createClient(transport, { circuitBreakerPolicy });

    await expect(client.execute(RestRequest.get('/t'))).rejects.toThrow(KSeFApiError);
    await expect(client.execute(RestRequest.get('/t'))).rejects.toThrow(KSeFApiError);

    // Immediately after: circuit is open
    await expect(client.execute(RestRequest.get('/t'))).rejects.toThrow(KSeFCircuitOpenError);
    expect(transport).toHaveBeenCalledTimes(2);

    // Wait past cooldown → probe succeeds → transport hit, circuit closed
    await sleep(50);
    const res = await client.execute<{ ok: boolean }>(RestRequest.get('/t'));
    expect(res.body).toEqual({ ok: true });
    expect(transport).toHaveBeenCalledTimes(3);
  });

  // ---- Probe + internal retries: half-open must not deadlock on its own slot

  it('half-open probe that retries through 5xx and recovers closes the circuit', async () => {
    // Prime the breaker with maxRetries=0 so each failing execute burns
    // exactly one transport call and one breaker-failure slot. Then switch to
    // a client with maxRetries=2 (sharing the same policy) for the probe:
    // the probe retries 503 → 503 → 200 internally and must recover.
    const circuitBreakerPolicy = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 30 });

    const primeTransport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(500));
    const primeClient = createClient(primeTransport, { circuitBreakerPolicy });

    await expect(primeClient.execute(RestRequest.get('/t'))).rejects.toThrow(KSeFApiError);
    await expect(primeClient.execute(RestRequest.get('/t'))).rejects.toThrow(KSeFApiError);
    // Breaker is now OPEN — immediate follow-up short-circuits.
    await expect(primeClient.execute(RestRequest.get('/t'))).rejects.toThrow(KSeFCircuitOpenError);

    await sleep(50);
    const recoveryTransport = vi.fn<TransportFn>()
      .mockResolvedValueOnce(mockResponse(503))
      .mockResolvedValueOnce(mockResponse(503))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));
    const recoveryClient = new RestClient(defaultOptions, {
      transport: recoveryTransport,
      retryPolicy: {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 5,
        retryableStatusCodes: [429, 500, 502, 503, 504],
        retryNetworkErrors: true,
      },
      circuitBreakerPolicy,
    });

    // Without the fix: the second loop iteration's ensureClosed() throws
    // because probeInFlight=true, aborting after 1 transport call.
    const res = await recoveryClient.execute<{ ok: boolean }>(RestRequest.get('/t'));
    expect(res.body).toEqual({ ok: true });
    expect(recoveryTransport).toHaveBeenCalledTimes(3);
  });

  it('half-open probe that exhausts retries re-opens with fresh cooldown instead of deadlocking', async () => {
    const circuitBreakerPolicy = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 50 });

    const primeTransport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(500));
    const primeClient = createClient(primeTransport, { circuitBreakerPolicy });
    await expect(primeClient.execute(RestRequest.get('/t'))).rejects.toThrow(KSeFApiError);
    await expect(primeClient.execute(RestRequest.get('/t'))).rejects.toThrow(KSeFApiError);

    await sleep(80);

    // Probe + retries all return 503 — probe exhausts its budget.
    const probeTransport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(503));
    const probeClient = new RestClient(defaultOptions, {
      transport: probeTransport,
      retryPolicy: {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 5,
        retryableStatusCodes: [429, 500, 502, 503, 504],
        retryNetworkErrors: true,
      },
      circuitBreakerPolicy,
    });
    await expect(probeClient.execute(RestRequest.get('/t'))).rejects.toThrow(KSeFApiError);
    expect(probeTransport).toHaveBeenCalledTimes(3); // probe + 2 retries

    // Follow-up MUST see a fresh cooldown (retryAfterMs > 0), NOT
    // retryAfterMs=0 (which would mean probeInFlight got stuck).
    const followUpTransport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, { ok: true }));
    const followUpClient = createClient(followUpTransport, { circuitBreakerPolicy });
    try {
      await followUpClient.execute(RestRequest.get('/t'));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KSeFCircuitOpenError);
      expect((err as KSeFCircuitOpenError).retryAfterMs).toBeGreaterThan(0);
    }
    expect(followUpTransport).toHaveBeenCalledTimes(0);

    // Fresh cooldown elapses → probe succeeds → circuit closes.
    await sleep(70);
    const res = await followUpClient.execute<{ ok: boolean }>(RestRequest.get('/t'));
    expect(res.body).toEqual({ ok: true });
  });

  it('half-open probe with retryable network errors does not deadlock', async () => {
    const netErr = Object.assign(new Error('conn reset'), { code: 'ECONNRESET' });
    const circuitBreakerPolicy = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 50 });

    const primeTransport = vi.fn<TransportFn>().mockRejectedValue(netErr);
    const primeClient = createClient(primeTransport, { circuitBreakerPolicy });
    await expect(primeClient.execute(RestRequest.get('/n'))).rejects.toThrow();
    await expect(primeClient.execute(RestRequest.get('/n'))).rejects.toThrow();

    await sleep(80);

    const probeTransport = vi.fn<TransportFn>().mockRejectedValue(netErr);
    const probeClient = new RestClient(defaultOptions, {
      transport: probeTransport,
      retryPolicy: {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 5,
        retryableStatusCodes: [429, 500, 502, 503, 504],
        retryNetworkErrors: true,
      },
      circuitBreakerPolicy,
    });
    // Without the fix, the second loop iteration's ensureClosed() throws
    // before the retry can run.
    await expect(probeClient.execute(RestRequest.get('/n'))).rejects.toThrow();
    expect(probeTransport).toHaveBeenCalledTimes(3);

    // Breaker re-opened with non-zero cooldown.
    const followUpTransport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, { ok: true }));
    const followUpClient = createClient(followUpTransport, { circuitBreakerPolicy });
    try {
      await followUpClient.execute(RestRequest.get('/n'));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KSeFCircuitOpenError);
      expect((err as KSeFCircuitOpenError).retryAfterMs).toBeGreaterThan(0);
    }

    await sleep(70);
    const res = await followUpClient.execute<{ ok: boolean }>(RestRequest.get('/n'));
    expect(res.body).toEqual({ ok: true });
  });

  it('half-open probe that throws a non-retryable error still releases the probe slot', async () => {
    // A plain Error with neither name='AbortError' nor a retryable errno is
    // NOT retryable per isRetryableError. On the probe, this terminates
    // immediately; the claimed probe slot MUST be released via recordFailure
    // so probeInFlight does not stay true forever.
    const circuitBreakerPolicy = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 50 });
    const netErr = Object.assign(new Error('conn reset'), { code: 'ECONNRESET' });

    const primeTransport = vi.fn<TransportFn>().mockRejectedValue(netErr);
    const primeClient = createClient(primeTransport, { circuitBreakerPolicy });
    await expect(primeClient.execute(RestRequest.get('/x'))).rejects.toThrow();
    await expect(primeClient.execute(RestRequest.get('/x'))).rejects.toThrow();

    await sleep(80);

    const probeTransport = vi.fn<TransportFn>().mockRejectedValue(new Error('unexpected failure'));
    const probeClient = createClient(probeTransport, { circuitBreakerPolicy });
    await expect(probeClient.execute(RestRequest.get('/x'))).rejects.toThrow('unexpected failure');

    // Immediate follow-up must see a fresh cooldown, NOT retryAfterMs=0.
    const followUpTransport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, { ok: true }));
    const followUpClient = createClient(followUpTransport, { circuitBreakerPolicy });
    try {
      await followUpClient.execute(RestRequest.get('/x'));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KSeFCircuitOpenError);
      expect((err as KSeFCircuitOpenError).retryAfterMs).toBeGreaterThan(0);
    }
    expect(followUpTransport).toHaveBeenCalledTimes(0);
  });

  it('network errors count as failures', async () => {
    const netErr = Object.assign(new Error('conn reset'), { code: 'ECONNRESET' });
    const transport = vi.fn<TransportFn>().mockRejectedValue(netErr);
    const circuitBreakerPolicy = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 1000 });
    const client = createClient(transport, { circuitBreakerPolicy });

    await expect(client.execute(RestRequest.get('/n'))).rejects.toThrow();
    await expect(client.execute(RestRequest.get('/n'))).rejects.toThrow();

    // 3rd call must be short-circuited
    await expect(client.execute(RestRequest.get('/n'))).rejects.toThrow(KSeFCircuitOpenError);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  // ---- Outcome-per-logical-request contract ----------------------------

  it('a single request that retries 5xx and finally succeeds counts as ONE success', async () => {
    const transport = vi.fn<TransportFn>()
      .mockResolvedValueOnce(mockResponse(503))
      .mockResolvedValueOnce(mockResponse(503))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const circuitBreakerPolicy = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 1000 });
    const client = new RestClient(defaultOptions, {
      transport,
      retryPolicy: {
        maxRetries: 3,
        baseDelayMs: 1,
        maxDelayMs: 5,
        retryableStatusCodes: [429, 500, 502, 503, 504],
        retryNetworkErrors: true,
      },
      circuitBreakerPolicy,
    });

    const res = await client.execute<{ ok: boolean }>(RestRequest.get('/r'));
    expect(res.body).toEqual({ ok: true });
    expect(transport).toHaveBeenCalledTimes(3);

    // The two retried 503s MUST NOT consume failure slots — the request
    // recovered on the third attempt, so only a success should be recorded.
    // A follow-up 503 should therefore not immediately open the circuit
    // (threshold is 2; one fresh failure is still below threshold).
    transport.mockReset();
    transport.mockResolvedValue(mockResponse(503));
    await expect(client.execute(RestRequest.get('/r'))).rejects.toThrow(KSeFApiError);
    expect(transport).toHaveBeenCalledTimes(4); // 4 = 1 new 503 + 3 retry attempts
  });

  it('open circuit short-circuits remaining retries of an in-flight request', async () => {
    // Scope is global so a pile-up of failures on /hot can open the breaker
    // and cause a concurrent /cold request's remaining retries to abort.
    const netErr = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    const transport = vi.fn<TransportFn>().mockImplementation((url: string) => {
      if (url.endsWith('/hot')) return Promise.reject(netErr);
      // /cold returns retryable 503 every time — the retry loop would normally
      // exhaust all attempts. With the breaker open, later attempts abort.
      return Promise.resolve(mockResponse(503));
    });

    const circuitBreakerPolicy = new CircuitBreakerPolicy({
      failureThreshold: 2,
      openMs: 10_000,
      scope: 'global',
    });
    const client = new RestClient(defaultOptions, {
      transport,
      retryPolicy: {
        maxRetries: 5,
        baseDelayMs: 1,
        maxDelayMs: 5,
        retryableStatusCodes: [429, 500, 502, 503, 504],
        retryNetworkErrors: true,
      },
      circuitBreakerPolicy,
    });

    // Prime the breaker — /hot always errors, each request retries 5 times but
    // records exactly one failure at the end.
    await expect(client.execute(RestRequest.get('/hot'))).rejects.toThrow();
    await expect(client.execute(RestRequest.get('/hot'))).rejects.toThrow();

    // Breaker should now be open. A call to /cold must be short-circuited
    // with ZERO transport invocations — not six retries.
    transport.mockClear();
    await expect(client.execute(RestRequest.get('/cold'))).rejects.toThrow(KSeFCircuitOpenError);
    expect(transport).toHaveBeenCalledTimes(0);
  });

  it('401 auth-refresh response still records its circuit outcome', async () => {
    // First call: 401. Refresh returns a new token. Second call (with new
    // token) returns 503 — this should count as a circuit failure.
    const transport = vi.fn<TransportFn>()
      .mockResolvedValueOnce(mockResponse(401, { detail: 'expired' }))
      .mockResolvedValueOnce(mockResponse(503))
      // Follow-up request to verify breaker state.
      .mockResolvedValue(mockResponse(503));

    const authManager: AuthManager = {
      getAccessToken: () => 'stale',
      setAccessToken: vi.fn(),
      getRefreshToken: () => 'rt',
      setRefreshToken: vi.fn(),
      onUnauthorized: vi.fn().mockResolvedValue('fresh'),
    };

    const circuitBreakerPolicy = new CircuitBreakerPolicy({ failureThreshold: 2, openMs: 10_000 });
    const client = new RestClient(defaultOptions, {
      transport,
      authManager,
      retryPolicy: {
        maxRetries: 0,
        baseDelayMs: 1,
        maxDelayMs: 5,
        retryableStatusCodes: [429, 500, 502, 503, 504],
        retryNetworkErrors: true,
      },
      circuitBreakerPolicy,
    });

    await expect(client.execute(RestRequest.get('/a'))).rejects.toThrow(KSeFApiError);
    expect(authManager.onUnauthorized).toHaveBeenCalledTimes(1);

    // One more 503 should now trip the breaker — proving the refreshed 503
    // was recorded as a failure instead of being silently skipped by the old
    // early-return path.
    await expect(client.execute(RestRequest.get('/a'))).rejects.toThrow(KSeFApiError);

    // Third call — should be short-circuited.
    await expect(client.execute(RestRequest.get('/a'))).rejects.toThrow(KSeFCircuitOpenError);
  });
});
