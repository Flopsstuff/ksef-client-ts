import { describe, it, expect, vi } from 'vitest';
import { defaultTransport } from '../../../src/http/transport.js';

describe('defaultTransport', () => {
  it('is a function with TransportFn signature (url, init) => Promise<Response>', () => {
    expect(typeof defaultTransport).toBe('function');
    expect(defaultTransport.length).toBe(2);
  });

  it('delegates to native fetch', async () => {
    const fakeResponse = new Response('ok', { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(fakeResponse);

    const init: RequestInit = { method: 'POST', body: '{}' };
    const result = await defaultTransport('https://example.com/api', init);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/api', init);
    expect(result).toBe(fakeResponse);

    fetchSpy.mockRestore();
  });
});
