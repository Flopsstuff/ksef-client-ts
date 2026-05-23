import { RestClient, type RestClientConfig } from '../../../src/http/rest-client.js';
import { RestRequest } from '../../../src/http/rest-request.js';
import type { TransportFn } from '../../../src/http/transport.js';
import type { ResolvedOptions } from '../../../src/config/options.js';
import type { AuthManager } from '../../../src/http/auth-manager.js';
import { RateLimitPolicy } from '../../../src/http/rate-limit-policy.js';
import { KSeFValidationError } from '../../../src/errors/ksef-validation-error.js';
import { KSeFApiError } from '../../../src/errors/ksef-api-error.js';
import { KSeFRateLimitError } from '../../../src/errors/ksef-rate-limit-error.js';
import { KSeFForbiddenError } from '../../../src/errors/ksef-forbidden-error.js';
import { KSeFGoneError } from '../../../src/errors/ksef-gone-error.js';
import { KSeFBadRequestError } from '../../../src/errors/ksef-bad-request-error.js';
import { KSeFBatchTimeoutError } from '../../../src/errors/ksef-batch-timeout-error.js';
import { KSeFUnknownPublicKeyError } from '../../../src/errors/ksef-unknown-public-key-error.js';

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
  const headersObj = new Headers(headers);
  return new Response(JSON.stringify(body), { status, headers: headersObj });
}

function createClient(transport: TransportFn, config?: Partial<RestClientConfig>): RestClient {
  return new RestClient(defaultOptions, {
    transport,
    retryPolicy: {
      maxRetries: 2,
      baseDelayMs: 1,  // fast for tests
      maxDelayMs: 10,
      retryableStatusCodes: [429, 500, 502, 503, 504],
      retryNetworkErrors: true,
    },
    ...config,
  });
}

describe('RestClient', () => {
  describe('X-System-Warning', () => {
    it('invokes onSystemWarning with the raw header value when present', async () => {
      const onSystemWarning = vi.fn();
      const transport = vi.fn<TransportFn>().mockResolvedValue(
        mockResponse(200, { ok: true }, { 'X-System-Warning': '[123]: deprecated field' }),
      );
      const client = createClient(transport, { onSystemWarning });

      await client.execute(RestRequest.get('/test'));

      expect(onSystemWarning).toHaveBeenCalledWith('[123]: deprecated field');
    });

    it('does not invoke the callback when the header is absent', async () => {
      const onSystemWarning = vi.fn();
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, { ok: true }));
      const client = createClient(transport, { onSystemWarning });

      await client.execute(RestRequest.get('/test'));

      expect(onSystemWarning).not.toHaveBeenCalled();
    });

    it('does not affect the operation result', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(
        mockResponse(200, { ok: true }, { 'X-System-Warning': 'heads up' }),
      );
      const client = createClient(transport);

      const result = await client.execute<{ ok: boolean }>(RestRequest.get('/test'));
      expect(result.body).toEqual({ ok: true });
    });
  });

  describe('retry integration', () => {
    it('retries on 503 then succeeds', async () => {
      const transport = vi.fn<TransportFn>()
        .mockResolvedValueOnce(mockResponse(503))
        .mockResolvedValueOnce(mockResponse(200, { ok: true }));

      const client = createClient(transport);
      const result = await client.execute<{ ok: boolean }>(RestRequest.get('/test'));

      expect(result.body).toEqual({ ok: true });
      expect(transport).toHaveBeenCalledTimes(2);
    });

    it('retries on 500 up to maxRetries then returns last response', async () => {
      const transport = vi.fn<TransportFn>()
        .mockResolvedValue(mockResponse(500));

      const client = createClient(transport);
      // execute() calls ensureSuccess which throws on 500
      await expect(client.execute(RestRequest.get('/test'))).rejects.toThrow(KSeFApiError);
      // 1 initial + 2 retries = 3
      expect(transport).toHaveBeenCalledTimes(3);
    });

    it('retries on network error then succeeds', async () => {
      const error = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
      const transport = vi.fn<TransportFn>()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(mockResponse(200, { ok: true }));

      const client = createClient(transport);
      const result = await client.execute<{ ok: boolean }>(RestRequest.get('/test'));

      expect(result.body).toEqual({ ok: true });
      expect(transport).toHaveBeenCalledTimes(2);
    });

    it('does not retry on 400', async () => {
      const transport = vi.fn<TransportFn>()
        .mockResolvedValue(mockResponse(400, { message: 'bad request' }));

      const client = createClient(transport);
      await expect(client.execute(RestRequest.get('/test'))).rejects.toThrow(KSeFApiError);
      expect(transport).toHaveBeenCalledTimes(1);
    });

    it('retries POST requests on 503', async () => {
      const transport = vi.fn<TransportFn>()
        .mockResolvedValueOnce(mockResponse(503))
        .mockResolvedValueOnce(mockResponse(200, { created: true }));

      const client = createClient(transport);
      const result = await client.execute<{ created: boolean }>(RestRequest.post('/invoices').body({ xml: '<invoice/>' }));

      expect(result.body).toEqual({ created: true });
      expect(transport).toHaveBeenCalledTimes(2);
      expect(transport.mock.calls[0]![1].method).toBe('POST');
      expect(transport.mock.calls[1]![1].method).toBe('POST');
    });

    it('retries DELETE requests on 500', async () => {
      const transport = vi.fn<TransportFn>()
        .mockResolvedValueOnce(mockResponse(500))
        .mockResolvedValueOnce(mockResponse(200, { deleted: true }));

      const client = createClient(transport);
      const result = await client.execute<{ deleted: boolean }>(RestRequest.delete('/tokens/abc'));

      expect(result.body).toEqual({ deleted: true });
      expect(transport).toHaveBeenCalledTimes(2);
      expect(transport.mock.calls[0]![1].method).toBe('DELETE');
    });
  });

  describe('rate limiting integration', () => {
    it('calls acquire before sending request', async () => {
      const acquireFn = vi.fn().mockResolvedValue(undefined);
      const rateLimitPolicy = { acquire: acquireFn } as unknown as RateLimitPolicy;
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, {}));

      const client = createClient(transport, { rateLimitPolicy });
      await client.execute(RestRequest.get('/test/path'));

      expect(acquireFn).toHaveBeenCalledWith('/test/path');
      expect(acquireFn).toHaveBeenCalledBefore(transport);
    });

    it('re-acquires on 429 retry', async () => {
      const acquireFn = vi.fn().mockResolvedValue(undefined);
      const rateLimitPolicy = { acquire: acquireFn } as unknown as RateLimitPolicy;
      const transport = vi.fn<TransportFn>()
        .mockResolvedValueOnce(mockResponse(429, {}, { 'Retry-After': '0' }))
        .mockResolvedValueOnce(mockResponse(200, {}));

      const client = createClient(transport, { rateLimitPolicy });
      await client.execute(RestRequest.get('/test'));

      // Once before retry loop + once on 429 retry
      expect(acquireFn).toHaveBeenCalledTimes(2);
    });

    it('does not call acquire when rateLimitPolicy is null', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, {}));
      const client = createClient(transport, { rateLimitPolicy: null });

      await client.execute(RestRequest.get('/test'));
      expect(transport).toHaveBeenCalledTimes(1);
    });
  });

  describe('auth manager integration', () => {
    it('injects auth header from authManager', async () => {
      const authManager: AuthManager = {
        getAccessToken: () => 'my-token',
        setAccessToken: vi.fn(),
        getRefreshToken: () => undefined,
        setRefreshToken: vi.fn(),
        onUnauthorized: vi.fn(),
      };
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, {}));

      const client = createClient(transport, { authManager });
      await client.execute(RestRequest.get('/test'));

      const passedInit = transport.mock.calls[0]![1];
      expect((passedInit.headers as Record<string, string>)['Authorization']).toBe('Bearer my-token');
    });

    it('explicit accessToken on request takes precedence', async () => {
      const authManager: AuthManager = {
        getAccessToken: () => 'manager-token',
        setAccessToken: vi.fn(),
        getRefreshToken: () => undefined,
        setRefreshToken: vi.fn(),
        onUnauthorized: vi.fn(),
      };
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, {}));

      const client = createClient(transport, { authManager });
      await client.execute(RestRequest.get('/test').accessToken('explicit-token'));

      const passedInit = transport.mock.calls[0]![1];
      expect((passedInit.headers as Record<string, string>)['Authorization']).toBe('Bearer explicit-token');
    });

    it('refreshes token on 401 and retries', async () => {
      const authManager: AuthManager = {
        getAccessToken: () => 'old-token',
        setAccessToken: vi.fn(),
        getRefreshToken: () => undefined,
        setRefreshToken: vi.fn(),
        onUnauthorized: vi.fn().mockResolvedValue('new-token'),
      };
      const transport = vi.fn<TransportFn>()
        .mockResolvedValueOnce(mockResponse(401, { detail: 'expired' }))
        .mockResolvedValueOnce(mockResponse(200, { ok: true }));

      const client = createClient(transport, { authManager });
      const result = await client.execute<{ ok: boolean }>(RestRequest.get('/test'));

      expect(result.body).toEqual({ ok: true });
      expect(authManager.onUnauthorized).toHaveBeenCalledTimes(1);
      expect(transport).toHaveBeenCalledTimes(2);

      // Second call should use the new token
      const secondInit = transport.mock.calls[1]![1];
      expect((secondInit.headers as Record<string, string>)['Authorization']).toBe('Bearer new-token');
    });

    it('throws on failed refresh (null)', async () => {
      const authManager: AuthManager = {
        getAccessToken: () => 'old-token',
        setAccessToken: vi.fn(),
        getRefreshToken: () => undefined,
        setRefreshToken: vi.fn(),
        onUnauthorized: vi.fn().mockResolvedValue(null),
      };
      const transport = vi.fn<TransportFn>()
        .mockResolvedValue(mockResponse(401, { detail: 'expired' }));

      const client = createClient(transport, { authManager });
      // 401 with null refresh → ensureSuccess throws on the 401 response
      await expect(client.execute(RestRequest.get('/test'))).rejects.toThrow();
      expect(authManager.onUnauthorized).toHaveBeenCalledTimes(1);
    });

    it('does not refresh without authManager', async () => {
      const transport = vi.fn<TransportFn>()
        .mockResolvedValue(mockResponse(401, { detail: 'unauthorized' }));

      const client = createClient(transport);
      await expect(client.execute(RestRequest.get('/test'))).rejects.toThrow();
      // Only 1 call — no retry on 401 without authManager
      expect(transport).toHaveBeenCalledTimes(1);
    });

    it('does not attempt second refresh if retried request also returns 401', async () => {
      const authManager: AuthManager = {
        getAccessToken: () => 'old-token',
        setAccessToken: vi.fn(),
        getRefreshToken: () => undefined,
        setRefreshToken: vi.fn(),
        onUnauthorized: vi.fn().mockResolvedValue('new-token'),
      };
      const transport = vi.fn<TransportFn>()
        .mockResolvedValueOnce(mockResponse(401, { detail: 'expired' }))
        .mockResolvedValueOnce(mockResponse(401, { detail: 'still expired' }));

      const client = createClient(transport, { authManager });
      await expect(client.execute(RestRequest.get('/test'))).rejects.toThrow();
      // onUnauthorized called exactly once — no infinite loop
      expect(authManager.onUnauthorized).toHaveBeenCalledTimes(1);
      expect(transport).toHaveBeenCalledTimes(2);
    });

    it('skipAuthRetry bypasses 401 refresh', async () => {
      const authManager: AuthManager = {
        getAccessToken: () => 'old-token',
        setAccessToken: vi.fn(),
        getRefreshToken: () => 'rt',
        setRefreshToken: vi.fn(),
        onUnauthorized: vi.fn().mockResolvedValue('new-token'),
      };
      const transport = vi.fn<TransportFn>()
        .mockResolvedValue(mockResponse(401, { detail: 'expired' }));

      const client = createClient(transport, { authManager });
      await expect(client.execute(RestRequest.get('/test').skipAuthRetry())).rejects.toThrow();

      expect(authManager.onUnauthorized).not.toHaveBeenCalled();
      expect(transport).toHaveBeenCalledTimes(1);
    });

    it('does not inject auth header when getAccessToken returns undefined', async () => {
      const authManager: AuthManager = {
        getAccessToken: () => undefined,
        setAccessToken: vi.fn(),
        getRefreshToken: () => undefined,
        setRefreshToken: vi.fn(),
        onUnauthorized: vi.fn(),
      };
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, {}));

      const client = createClient(transport, { authManager });
      await client.execute(RestRequest.get('/test'));

      const passedInit = transport.mock.calls[0]![1];
      expect((passedInit.headers as Record<string, string>)['Authorization']).toBeUndefined();
    });
  });

  describe('presigned URL validation', () => {
    it('validates presigned requests', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, {}));
      const client = createClient(transport, {
        presignedUrlPolicy: {
          allowedHosts: ['*.mf.gov.pl'],
          requireHttps: true,
          blockRedirectParams: true,
          rejectPrivateIps: true,
        },
      });

      // URL: https://ksef-test.mf.gov.pl/api/v2/download → host matches *.mf.gov.pl
      await client.execute(RestRequest.get('/download').presigned());
      expect(transport).toHaveBeenCalledTimes(1);
    });

    it('throws for presigned request to disallowed host', async () => {
      const transport = vi.fn<TransportFn>();
      const client = new RestClient(
        { ...defaultOptions, baseUrl: 'https://evil.example.com' },
        {
          transport,
          presignedUrlPolicy: {
            allowedHosts: ['*.ksef.mf.gov.pl'],
            requireHttps: true,
            blockRedirectParams: true,
            rejectPrivateIps: true,
          },
        },
      );

      await expect(client.execute(RestRequest.get('/download').presigned())).rejects.toThrow(KSeFValidationError);
      expect(transport).not.toHaveBeenCalled();
    });

    it('skips validation for non-presigned requests', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, {}));
      const client = new RestClient(
        { ...defaultOptions, baseUrl: 'https://evil.example.com' },
        {
          transport,
          presignedUrlPolicy: {
            allowedHosts: ['*.ksef.mf.gov.pl'],
            requireHttps: true,
            blockRedirectParams: true,
            rejectPrivateIps: true,
          },
        },
      );

      // Non-presigned → no validation → transport called
      await client.execute(RestRequest.get('/test'));
      expect(transport).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureSuccess error mapping', () => {
    it('throws KSeFRateLimitError on 429 after retries exhausted', async () => {
      const transport = vi.fn<TransportFn>()
        .mockResolvedValue(mockResponse(429, { message: 'rate limited' }, { 'Retry-After': '0' }));

      const client = createClient(transport);
      await expect(client.execute(RestRequest.get('/test'))).rejects.toThrow(KSeFRateLimitError);
    });

    it('throws KSeFForbiddenError on 403 with reasonCode', async () => {
      const transport = vi.fn<TransportFn>()
        .mockResolvedValue(mockResponse(403, { reasonCode: 'INSUFFICIENT_PERMISSIONS', detail: 'forbidden' }));

      const client = createClient(transport);
      await expect(client.execute(RestRequest.get('/test'))).rejects.toThrow(KSeFForbiddenError);
    });

    it('throws KSeFBatchTimeoutError when body contains exceptionCode 21208', async () => {
      const body = {
        exception: {
          exceptionDetailList: [
            { exceptionCode: 21208, exceptionDescription: 'Batch finish timed out' },
          ],
        },
      };
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(408, body));

      // 408 is not retryable by default config
      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFBatchTimeoutError);
      expect(err).toBeInstanceOf(KSeFApiError);
      expect((err as KSeFBatchTimeoutError).errorCode).toBe(21208);
      expect((err as KSeFBatchTimeoutError).statusCode).toBe(408);
      expect((err as KSeFBatchTimeoutError).message).toBe('Batch finish timed out');
    });

    it('throws KSeFBatchTimeoutError when status is 400 and body carries exceptionCode 21208', async () => {
      // Covers the BatchTimeout branch inside the `response.status === 400`
      // block (separate dispatch path from the generic legacy fall-through).
      const body = {
        exception: {
          exceptionDetailList: [
            { exceptionCode: 21208, exceptionDescription: 'Batch finish timed out' },
          ],
        },
      };
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(400, body));
      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(KSeFBatchTimeoutError);
      expect((err as KSeFBatchTimeoutError).statusCode).toBe(400);
    });

    it('throws KSeFUnknownPublicKeyError on 400 legacy body with exceptionCode 21470', async () => {
      const body = {
        exception: {
          exceptionDetailList: [
            { exceptionCode: 21470, exceptionDescription: 'Unknown public key id' },
          ],
        },
      };
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(400, body));
      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFUnknownPublicKeyError);
      expect((err as KSeFUnknownPublicKeyError).errorCode).toBe(21470);
      expect((err as KSeFUnknownPublicKeyError).statusCode).toBe(400);
      expect((err as KSeFUnknownPublicKeyError).message).toBe('Unknown public key id');
    });

    it('throws KSeFUnknownPublicKeyError on 400 Problem Details with errors[].code 21470', async () => {
      const body = {
        title: 'Bad Request',
        status: 400,
        errors: [{ code: 21470, description: 'Public key revoked', details: [] }],
      };
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(400, body));
      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFUnknownPublicKeyError);
      expect(err).not.toBeInstanceOf(KSeFBadRequestError);
      expect((err as KSeFUnknownPublicKeyError).message).toBe('Public key revoked');
    });

    it('throws generic KSeFApiError when status is 408 but exceptionCode is unrelated', async () => {
      const body = {
        exception: {
          exceptionDetailList: [{ exceptionCode: 9999, exceptionDescription: 'Other' }],
        },
      };
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(408, body));

      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFApiError);
      expect(err).not.toBeInstanceOf(KSeFBatchTimeoutError);
    });

    it('throws generic KSeFApiError on 403 without reasonCode', async () => {
      const transport = vi.fn<TransportFn>()
        .mockResolvedValue(mockResponse(403, { message: 'no reason code' }));

      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(KSeFApiError);
      expect(err).not.toBeInstanceOf(KSeFForbiddenError);
    });

    it('throws KSeFGoneError on 410 with problem details', async () => {
      const transport = vi.fn<TransportFn>()
        .mockResolvedValue(mockResponse(410, {
          title: 'Gone',
          status: 410,
          detail: 'Retention expired',
          traceId: 't-1',
          instance: '/v2/auth/ref-abc',
        }));

      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFGoneError);
      expect(err).toBeInstanceOf(KSeFApiError);
      expect((err as KSeFGoneError).statusCode).toBe(410);
      expect((err as KSeFGoneError).detail).toBe('Retention expired');
      expect((err as KSeFGoneError).traceId).toBe('t-1');
      expect((err as KSeFGoneError).instance).toBe('/v2/auth/ref-abc');
    });

    it('throws KSeFGoneError on 410 without body', async () => {
      const response = new Response('', { status: 410 });
      const transport = vi.fn<TransportFn>().mockResolvedValue(response);

      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFGoneError);
      expect((err as KSeFGoneError).detail).toBe('Operation status no longer available (retention expired)');
    });

    it('appends query params to the URL', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, {}));

      const client = createClient(transport);
      await client.execute(RestRequest.get('/test').query('page', '1').query('size', '10'));

      const calledUrl = transport.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('page=1');
      expect(calledUrl).toContain('size=10');
    });

    it('throws immediately on non-retryable network error', async () => {
      const error = new TypeError('Failed to fetch');
      const transport = vi.fn<TransportFn>().mockRejectedValue(error);

      // retryNetworkErrors: false → no retry on any network error
      const client = new RestClient(defaultOptions, {
        transport,
        retryPolicy: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10, retryableStatusCodes: [], retryNetworkErrors: false },
      });
      await expect(client.execute(RestRequest.get('/test'))).rejects.toThrow('Failed to fetch');
      expect(transport).toHaveBeenCalledTimes(1);
    });

    it('throws last error after all network retries exhausted', async () => {
      const error = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
      const transport = vi.fn<TransportFn>().mockRejectedValue(error);

      const client = createClient(transport);
      await expect(client.execute(RestRequest.get('/test'))).rejects.toThrow('connection reset');
      // 1 initial + 2 retries = 3
      expect(transport).toHaveBeenCalledTimes(3);
    });

    it('executeRaw returns ArrayBuffer on success', async () => {
      const body = new TextEncoder().encode('binary-data');
      const response = new Response(body, { status: 200 });
      const transport = vi.fn<TransportFn>().mockResolvedValue(response);

      const client = createClient(transport);
      const result = await client.executeRaw(RestRequest.get('/download'));

      expect(result.body).toBeInstanceOf(ArrayBuffer);
      expect(new TextDecoder().decode(result.body)).toBe('binary-data');
    });

    it('executeRaw throws on error response', async () => {
      const transport = vi.fn<TransportFn>()
        .mockResolvedValue(mockResponse(500, { message: 'server error' }));

      const client = createClient(transport);
      await expect(client.executeRaw(RestRequest.get('/test'))).rejects.toThrow(KSeFApiError);
    });
  });

  describe('Problem Details (400/429) + X-Error-Format', () => {
    it('throws KSeFBadRequestError on 400 Problem Details body', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(400, {
        title: 'Bad Request',
        status: 400,
        detail: 'Validation failed',
        errors: [
          { code: 21200, description: 'Invalid date', details: ['dateFrom > dateTo'] },
        ],
        traceId: 't-400',
      }));

      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFBadRequestError);
      expect(err).toBeInstanceOf(KSeFApiError);
      expect((err as KSeFBadRequestError).statusCode).toBe(400);
      expect((err as KSeFBadRequestError).errors).toHaveLength(1);
      expect((err as KSeFBadRequestError).errors[0]!.code).toBe(21200);
      expect((err as KSeFBadRequestError).traceId).toBe('t-400');
    });

    it('accepts 400 Problem Details without errors field', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(400, {
        title: 'Bad Request',
        status: 400,
        detail: 'Query rejected',
        traceId: 't-noerrors',
      }));

      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFBadRequestError);
      expect((err as KSeFBadRequestError).errors).toEqual([]);
      expect((err as KSeFBadRequestError).detail).toBe('Query rejected');
      expect((err as KSeFBadRequestError).traceId).toBe('t-noerrors');
    });

    it('rejects 400 Problem Details whose errors items are malformed', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(400, {
        title: 'Bad Request',
        status: 400,
        errors: [{ code: 'not-a-number', description: 'oops' }],
      }));

      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFApiError);
      expect(err).not.toBeInstanceOf(KSeFBadRequestError);
    });

    it('falls back to generic KSeFApiError on 400 with legacy body', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(400, {
        exception: {
          exceptionDetailList: [{ exceptionCode: 9999, exceptionDescription: 'legacy' }],
        },
      }));

      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFApiError);
      expect(err).not.toBeInstanceOf(KSeFBadRequestError);
      expect((err as KSeFApiError).statusCode).toBe(400);
    });

    it('falls back to KSeFApiError on 400 with malformed body', async () => {
      const response = new Response('not json', { status: 400 });
      const transport = vi.fn<TransportFn>().mockResolvedValue(response);

      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFApiError);
      expect((err as KSeFApiError).statusCode).toBe(400);
    });

    it('surfaces 429 Problem Details body alongside Retry-After header', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(
        429,
        {
          title: 'Too Many Requests',
          status: 429,
          detail: 'Quota exceeded',
          instance: '/v2/sessions',
          traceId: 'trace-429',
          timestamp: '2026-04-18T10:00:00Z',
        },
        { 'Retry-After': '0' },
      ));

      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFRateLimitError);
      expect((err as KSeFRateLimitError).retryAfterSeconds).toBe(0);
      expect((err as KSeFRateLimitError).problem?.traceId).toBe('trace-429');
      expect((err as KSeFRateLimitError).problem?.detail).toBe('Quota exceeded');
    });

    it('still parses 429 header-only responses', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(
        429, {}, { 'Retry-After': '0' },
      ));

      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFRateLimitError);
      expect((err as KSeFRateLimitError).retryAfterSeconds).toBe(0);
      expect((err as KSeFRateLimitError).problem).toBeUndefined();
    });

    it('parses 429 Problem Details body even when status field is missing', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(
        429,
        {
          title: 'Too Many Requests',
          detail: 'Quota exceeded',
          traceId: 't-no-status',
        },
        { 'Retry-After': '0' },
      ));

      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFRateLimitError);
      expect((err as KSeFRateLimitError).problem?.traceId).toBe('t-no-status');
      expect((err as KSeFRateLimitError).problem?.detail).toBe('Quota exceeded');
    });

    it('parses 429 Problem Details body when status is a non-429 number', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(
        429,
        {
          title: 'Too Many Requests',
          status: 200,
          traceId: 't-wrong',
        },
        { 'Retry-After': '0' },
      ));

      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFRateLimitError);
      expect((err as KSeFRateLimitError).problem?.traceId).toBe('t-wrong');
    });

    it('sends X-Error-Format: problem-details by default', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, {}));

      const client = createClient(transport);
      await client.execute(RestRequest.get('/test'));

      const headers = transport.mock.calls[0]![1].headers as Record<string, string>;
      expect(headers['X-Error-Format']).toBe('problem-details');
    });

    it('omits X-Error-Format when errorFormat is legacy', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, {}));

      const client = new RestClient(
        { ...defaultOptions, errorFormat: 'legacy' },
        {
          transport,
          retryPolicy: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 10, retryableStatusCodes: [], retryNetworkErrors: false },
        },
      );
      await client.execute(RestRequest.get('/test'));

      const headers = transport.mock.calls[0]![1].headers as Record<string, string>;
      expect(headers['X-Error-Format']).toBeUndefined();
    });

    it('customHeaders can override X-Error-Format default', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, {}));

      const client = new RestClient(
        { ...defaultOptions, customHeaders: { 'X-Error-Format': 'custom' } },
        {
          transport,
          retryPolicy: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 10, retryableStatusCodes: [], retryNetworkErrors: false },
        },
      );
      await client.execute(RestRequest.get('/test'));

      const headers = transport.mock.calls[0]![1].headers as Record<string, string>;
      expect(headers['X-Error-Format']).toBe('custom');
    });

    it('respects lowercase custom x-error-format override', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, {}));

      const client = new RestClient(
        { ...defaultOptions, customHeaders: { 'x-error-format': 'legacy' } },
        {
          transport,
          retryPolicy: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 10, retryableStatusCodes: [], retryNetworkErrors: false },
        },
      );
      await client.execute(RestRequest.get('/test'));

      const headers = transport.mock.calls[0]![1].headers as Record<string, string>;
      expect(headers['x-error-format']).toBe('legacy');
      expect(headers['X-Error-Format']).toBeUndefined();
    });

    it('surfaces typed security info on 403 Problem Details', async () => {
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(403, {
        title: 'Forbidden',
        status: 403,
        detail: 'Missing perms',
        reasonCode: 'missing-permissions',
        security: {
          requiredAnyOfPermissions: ['InvoiceRead', 'InvoiceWrite'],
          presentPermissions: ['SessionOwn'],
        },
      }));

      const client = createClient(transport);
      const err = await client.execute(RestRequest.get('/test')).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(KSeFForbiddenError);
      expect((err as KSeFForbiddenError).security?.requiredAnyOfPermissions).toEqual(['InvoiceRead', 'InvoiceWrite']);
      expect((err as KSeFForbiddenError).security?.presentPermissions).toEqual(['SessionOwn']);
    });
  });

  describe('full integration', () => {
    it('all policies work together', async () => {
      const acquireFn = vi.fn().mockResolvedValue(undefined);
      const rateLimitPolicy = { acquire: acquireFn } as unknown as RateLimitPolicy;
      const authManager: AuthManager = {
        getAccessToken: () => 'token',
        setAccessToken: vi.fn(),
        getRefreshToken: () => undefined,
        setRefreshToken: vi.fn(),
        onUnauthorized: vi.fn(),
      };
      const transport = vi.fn<TransportFn>()
        .mockResolvedValueOnce(mockResponse(503))
        .mockResolvedValueOnce(mockResponse(200, { result: 'ok' }));

      const client = createClient(transport, {
        rateLimitPolicy,
        authManager,
        presignedUrlPolicy: {
          allowedHosts: ['*.ksef.mf.gov.pl'],
          requireHttps: true,
          blockRedirectParams: true,
          rejectPrivateIps: true,
        },
      });

      const result = await client.execute<{ result: string }>(RestRequest.get('/test'));

      expect(result.body).toEqual({ result: 'ok' });
      expect(acquireFn).toHaveBeenCalledTimes(1); // once before retry loop
      expect(transport).toHaveBeenCalledTimes(2); // 503 + 200
      // Auth header injected
      const firstInit = transport.mock.calls[0]![1];
      expect((firstInit.headers as Record<string, string>)['Authorization']).toBe('Bearer token');
    });
  });

  describe('executeVoid', () => {
    it('completes without consuming a response body', async () => {
      // 204 forbids bodies in the Response constructor — use a 200 with a
      // body the caller is expected to ignore, which matches executeVoid's
      // actual contract (caller doesn't care about the payload).
      const transport = vi.fn<TransportFn>().mockResolvedValue(mockResponse(200, { ignore: true }));
      const client = createClient(transport);
      await expect(client.executeVoid(RestRequest.delete('/resource'))).resolves.toBeUndefined();
      expect(transport).toHaveBeenCalledTimes(1);
    });

    it('still propagates server errors', async () => {
      const transport = vi.fn<TransportFn>()
        .mockResolvedValue(mockResponse(403, { reasonCode: 'missing-permissions', detail: 'nope' }));
      const client = createClient(transport);
      await expect(client.executeVoid(RestRequest.delete('/forbidden'))).rejects.toThrow(KSeFForbiddenError);
    });
  });

  describe('executeRaw', () => {
    it('returns an ArrayBuffer body for binary downloads', async () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      const transport = vi.fn<TransportFn>().mockResolvedValue(
        new Response(bytes, { status: 200, headers: new Headers({ 'content-type': 'application/octet-stream' }) }),
      );
      const client = createClient(transport);
      const res = await client.executeRaw(RestRequest.get('/bin'));
      expect(res.statusCode).toBe(200);
      expect(res.body).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(res.body)).toEqual(bytes);
    });
  });
});
