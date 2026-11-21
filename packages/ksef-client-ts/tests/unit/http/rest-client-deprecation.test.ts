import { consola } from 'consola';
import { KSeFClient } from '../../../src/client.js';
import type { DeprecationNotice, ResolvedOptions } from '../../../src/config/options.js';
import { KSeFBadRequestError } from '../../../src/errors/ksef-bad-request-error.js';
import { KSeFGoneError } from '../../../src/errors/ksef-gone-error.js';
import { KSeFRateLimitError } from '../../../src/errors/ksef-rate-limit-error.js';
import type { AuthManager } from '../../../src/http/auth-manager.js';
import { RestClient, type RestClientConfig } from '../../../src/http/rest-client.js';
import { RestRequest } from '../../../src/http/rest-request.js';
import type { RetryPolicy } from '../../../src/http/retry-policy.js';
import type { TransportFn } from '../../../src/http/transport.js';

const defaultOptions: ResolvedOptions = {
  baseUrl: 'https://api-test.ksef.mf.gov.pl',
  baseQrUrl: 'https://qr-test.ksef.mf.gov.pl',
  lighthouseUrl: 'https://api-test.ksef.mf.gov.pl',
  apiVersion: 'v2',
  timeout: 5000,
  customHeaders: {},
  errorFormat: 'problem-details',
};

const noRetry: RetryPolicy = {
  maxRetries: 0,
  baseDelayMs: 1,
  maxDelayMs: 1,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  retryNetworkErrors: true,
};

const DEPRECATION = '@1700000000';
const SUNSET = 'Thu, 30 Sep 2027 00:00:00 GMT';
const DEPRECATED_SINCE = new Date(1_700_000_000_000);
const SUNSET_AT = new Date(SUNSET);

function mockResponse(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: new Headers(headers) });
}

function createClient(transport: TransportFn, config?: Partial<RestClientConfig>): RestClient {
  return new RestClient(defaultOptions, {
    transport,
    retryPolicy: {
      maxRetries: 2,
      baseDelayMs: 1,
      maxDelayMs: 10,
      retryableStatusCodes: [429, 500, 502, 503, 504],
      retryNetworkErrors: true,
    },
    ...config,
  });
}

function bothHeaders(): Record<string, string> {
  return { Deprecation: DEPRECATION, Sunset: SUNSET };
}

describe('Deprecation and Sunset headers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses both headers and still returns the response body', async () => {
    const onDeprecation = vi.fn();
    const transport = vi.fn<TransportFn>().mockResolvedValue(
      mockResponse(200, { ok: true }, bothHeaders()),
    );
    const client = createClient(transport, { onDeprecation });

    const result = await client.execute<{ ok: boolean }>(RestRequest.get('tokens'));

    expect(result.body).toEqual({ ok: true });
    expect(onDeprecation).toHaveBeenCalledOnce();
    expect(onDeprecation).toHaveBeenCalledWith({
      method: 'GET',
      path: 'tokens',
      deprecatedSince: DEPRECATED_SINCE,
      sunset: SUNSET_AT,
      rawDeprecation: DEPRECATION,
      rawSunset: SUNSET,
    } satisfies DeprecationNotice);
  });

  it('reports a notice when only Deprecation is present', async () => {
    const onDeprecation = vi.fn();
    const transport = vi.fn<TransportFn>().mockResolvedValue(
      mockResponse(200, { ok: true }, { Deprecation: DEPRECATION }),
    );
    const client = createClient(transport, { onDeprecation });

    await client.execute(RestRequest.post('tokens'));

    expect(onDeprecation).toHaveBeenCalledWith({
      method: 'POST',
      path: 'tokens',
      deprecatedSince: DEPRECATED_SINCE,
      rawDeprecation: DEPRECATION,
    } satisfies DeprecationNotice);
  });

  it('reports a notice when only Sunset is present', async () => {
    const onDeprecation = vi.fn();
    const transport = vi.fn<TransportFn>().mockResolvedValue(
      mockResponse(200, { ok: true }, { Sunset: SUNSET }),
    );
    const client = createClient(transport, { onDeprecation });

    await client.execute(RestRequest.get('auth/sessions'));

    expect(onDeprecation).toHaveBeenCalledWith({
      method: 'GET',
      path: 'auth/sessions',
      sunset: SUNSET_AT,
      rawSunset: SUNSET,
    } satisfies DeprecationNotice);
  });

  it('keeps the raw strings when the header values do not parse', async () => {
    const onDeprecation = vi.fn();
    const transport = vi.fn<TransportFn>().mockResolvedValue(
      mockResponse(200, { ok: true }, {
        Deprecation: 'yes',
        Sunset: 'next year',
      }),
    );
    const client = createClient(transport, { onDeprecation });

    await client.execute(RestRequest.get('tokens'));

    expect(onDeprecation).toHaveBeenCalledWith({
      method: 'GET',
      path: 'tokens',
      rawDeprecation: 'yes',
      rawSunset: 'next year',
    } satisfies DeprecationNotice);
  });

  it('leaves deprecatedSince unset when the timestamp is not a safe integer', async () => {
    const onDeprecation = vi.fn();
    const transport = vi.fn<TransportFn>().mockResolvedValue(
      mockResponse(200, {}, { Deprecation: '@9007199254740993' }),
    );
    const client = createClient(transport, { onDeprecation });

    await client.execute(RestRequest.get('tokens'));

    const notice = onDeprecation.mock.calls[0]![0] as DeprecationNotice;
    expect(notice.deprecatedSince).toBeUndefined();
    expect(notice.rawDeprecation).toBe('@9007199254740993');
  });

  it('leaves deprecatedSince unset when the timestamp is outside the date range', async () => {
    const onDeprecation = vi.fn();
    const transport = vi.fn<TransportFn>().mockResolvedValue(
      mockResponse(200, {}, { Deprecation: '@8640000000001' }),
    );
    const client = createClient(transport, { onDeprecation });

    await client.execute(RestRequest.get('tokens'));

    const notice = onDeprecation.mock.calls[0]![0] as DeprecationNotice;
    expect(notice.deprecatedSince).toBeUndefined();
    expect(notice.rawDeprecation).toBe('@8640000000001');
  });

  it.each([
    [400, KSeFBadRequestError, {
      title: 'Bad Request',
      status: 400,
      detail: 'Validation failed',
      errors: [{ code: 21200, description: 'Invalid date' }],
    }],
    [410, KSeFGoneError, {
      title: 'Gone',
      status: 410,
      detail: 'Operation switched off',
    }],
    [429, KSeFRateLimitError, {
      title: 'Too Many Requests',
      status: 429,
      detail: 'slow down',
    }],
  ] as const)('notifies and still throws on HTTP %i', async (status, errorType, body) => {
    const onDeprecation = vi.fn();
    const transport = vi.fn<TransportFn>().mockResolvedValue(
      mockResponse(status, body, bothHeaders()),
    );
    const client = createClient(transport, { onDeprecation, retryPolicy: noRetry });

    const err = await client.execute(RestRequest.get('tokens')).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(errorType);
    expect(onDeprecation).toHaveBeenCalledOnce();
    expect(onDeprecation).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      path: 'tokens',
      deprecatedSince: DEPRECATED_SINCE,
      sunset: SUNSET_AT,
    }));
  });

  it('does not replace the request result when the callback throws', async () => {
    const warn = vi.spyOn(consola, 'warn').mockImplementation(() => {});
    const onDeprecation = vi.fn(() => {
      throw new Error('callback boom');
    });
    const transport = vi.fn<TransportFn>().mockResolvedValue(
      mockResponse(200, { ok: true }, bothHeaders()),
    );
    const client = createClient(transport, { onDeprecation });

    const result = await client.execute<{ ok: boolean }>(RestRequest.get('tokens'));

    expect(result.body).toEqual({ ok: true });
    expect(warn).toHaveBeenCalledWith(
      'onDeprecation callback threw an exception (ignored):',
      expect.any(Error),
    );
  });

  it('still throws the HTTP error when the callback throws', async () => {
    vi.spyOn(consola, 'warn').mockImplementation(() => {});
    const onDeprecation = vi.fn(() => {
      throw new Error('callback boom');
    });
    const transport = vi.fn<TransportFn>().mockResolvedValue(
      mockResponse(410, { title: 'Gone', status: 410, detail: 'switched off' }, bothHeaders()),
    );
    const client = createClient(transport, { onDeprecation, retryPolicy: noRetry });

    await expect(client.execute(RestRequest.get('tokens'))).rejects.toBeInstanceOf(KSeFGoneError);
    expect(onDeprecation).toHaveBeenCalledOnce();
  });

  it('logs at debug level when no callback is configured', async () => {
    const debug = vi.spyOn(consola, 'debug');
    const warn = vi.spyOn(consola, 'warn');
    const transport = vi.fn<TransportFn>().mockResolvedValue(
      mockResponse(200, { ok: true }, bothHeaders()),
    );
    const client = createClient(transport);

    await client.execute(RestRequest.get('tokens'));

    expect(debug).toHaveBeenCalledWith(
      `KSeF deprecation notice: GET tokens Deprecation=${DEPRECATION} Sunset=${SUNSET}`,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not notify when neither header is present', async () => {
    const onDeprecation = vi.fn();
    const debug = vi.spyOn(consola, 'debug');
    const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, { ok: true }));
    const client = createClient(transport, { onDeprecation });

    await client.execute(RestRequest.get('tokens'));

    expect(onDeprecation).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalledWith(expect.stringContaining('KSeF deprecation notice'));
  });

  it('notifies once per response, including a 429 that is retried', async () => {
    const onDeprecation = vi.fn();
    const transport = vi.fn<TransportFn>()
      .mockResolvedValueOnce(mockResponse(429, { title: 'Too Many Requests', status: 429 }, bothHeaders()))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }, { Deprecation: DEPRECATION }));
    const client = createClient(transport, { onDeprecation });

    const result = await client.execute<{ ok: boolean }>(RestRequest.get('tokens'));

    expect(result.body).toEqual({ ok: true });
    expect(onDeprecation).toHaveBeenCalledTimes(2);
    expect(onDeprecation.mock.calls[0]![0]).toMatchObject({ rawSunset: SUNSET });
    const second = onDeprecation.mock.calls[1]![0] as DeprecationNotice;
    expect(second.rawDeprecation).toBe(DEPRECATION);
    expect(second.sunset).toBeUndefined();
    expect(second.rawSunset).toBeUndefined();
  });

  it('reads the headers on the response that follows a 401 refresh', async () => {
    const onDeprecation = vi.fn();
    const authManager: AuthManager = {
      getAccessToken: () => 'old-token',
      setAccessToken: vi.fn(),
      getRefreshToken: () => undefined,
      setRefreshToken: vi.fn(),
      onUnauthorized: vi.fn().mockResolvedValue('new-token'),
    };
    const transport = vi.fn<TransportFn>()
      .mockResolvedValueOnce(mockResponse(401, { detail: 'expired' }, { Deprecation: DEPRECATION }))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }, bothHeaders()));
    const client = createClient(transport, { onDeprecation, authManager });

    const result = await client.execute<{ ok: boolean }>(RestRequest.get('tokens'));

    expect(result.body).toEqual({ ok: true });
    expect(onDeprecation).toHaveBeenCalledTimes(2);
    expect(onDeprecation.mock.calls[1]![0]).toMatchObject({ sunset: SUNSET_AT });
  });

  it('forwards onDeprecation from KSeFClient', async () => {
    const onDeprecation = vi.fn();
    const transport = vi.fn<TransportFn>().mockResolvedValue(
      mockResponse(200, {
        challenge: 'challenge-uuid-12345',
        timestamp: '2025-01-15T10:30:00.000Z',
        timestampMs: 1736935800000,
      }, bothHeaders()),
    );
    const client = new KSeFClient({ transport, onDeprecation });

    await client.auth.getChallenge();

    expect(onDeprecation).toHaveBeenCalledOnce();
    expect(onDeprecation).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      path: 'auth/challenge',
      deprecatedSince: DEPRECATED_SINCE,
      sunset: SUNSET_AT,
    }));
  });
});
