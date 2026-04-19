import { describe, it, expect, vi } from 'vitest';
import { RestClient, type RestClientConfig } from '../../../src/http/rest-client.js';
import { RestRequest } from '../../../src/http/rest-request.js';
import type { TransportFn } from '../../../src/http/transport.js';
import type { ResolvedOptions } from '../../../src/config/options.js';
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
});
