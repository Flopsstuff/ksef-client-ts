import { downloadWithRetry } from '../../../src/http/download-with-retry.js';
import type { RetryPolicy } from '../../../src/http/retry-policy.js';

const policy: RetryPolicy = {
  maxRetries: 2,
  baseDelayMs: 1,
  maxDelayMs: 10,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  retryNetworkErrors: true,
};

const ok = () => new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 });

function download(transport: typeof fetch, overrides: Partial<RetryPolicy> = {}, timeoutMs = 1000) {
  return downloadWithRetry('https://example.test/part', { method: 'GET' }, {
    transport,
    retryPolicy: { ...policy, ...overrides },
    timeoutMs,
    label: 'part 1',
  });
}

describe('downloadWithRetry', () => {
  it('returns the body bytes', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(ok());
    await expect(download(transport)).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it('retries a 5xx response', async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(ok());
    await expect(download(transport)).resolves.toHaveLength(3);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('waits for Retry-After on 429 instead of the backoff', async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(ok());
    // A backoff this long would time the test out; Retry-After: 0 must win.
    await expect(download(transport, { baseDelayMs: 60_000, maxDelayMs: 60_000 })).resolves.toHaveLength(3);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('retries network errors', async () => {
    const transport = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(ok());
    await expect(download(transport)).resolves.toHaveLength(3);
  });

  it('times out a stalled attempt and retries it', async () => {
    const stalled: typeof fetch = (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
    });
    const transport = vi.fn<typeof fetch>().mockImplementationOnce(stalled).mockResolvedValueOnce(ok());
    await expect(download(transport, {}, 20)).resolves.toHaveLength(3);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable status', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 403 }));
    await expect(download(transport)).rejects.toThrow('Download failed for part 1: HTTP 403');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
    await expect(download(transport)).rejects.toThrow('Download failed for part 1: HTTP 503');
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('does not retry network errors when retryNetworkErrors is off', async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    await expect(download(transport, { retryNetworkErrors: false })).rejects.toThrow('fetch failed');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
