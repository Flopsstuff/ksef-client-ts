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
import { KSeFBatchTimeoutError } from '../../../src/errors/ksef-batch-timeout-error.js';

const defaultOptions: ResolvedOptions = {
  baseUrl: 'https://ksef-test.mf.gov.pl/api',
  baseQrUrl: 'https://ksef-test.mf.gov.pl/web',
  lighthouseUrl: 'https://ksef-test.mf.gov.pl/api',
  apiVersion: 'v2',
  timeout: 5000,
  customHeaders: {},
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
});
