import { LighthouseService } from '../../../src/services/lighthouse.js';
import { KSeFError } from '../../../src/errors/index.js';

const options = {
  baseUrl: 'https://ksef-test.mf.gov.pl/api',
  baseQrUrl: 'https://ksef-test.mf.gov.pl/web',
  lighthouseUrl: 'https://ksef-test.mf.gov.pl/lighthouse',
  apiVersion: 'v2',
  timeout: 5000,
  customHeaders: {},
};

describe('LighthouseService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getStatus returns parsed JSON', async () => {
    const body = { status: 'AVAILABLE', timestamp: '2024-01-01' };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const service = new LighthouseService(options);
    const result = await service.getStatus();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://ksef-test.mf.gov.pl/lighthouse/status',
      expect.objectContaining({
        headers: { Accept: 'application/json' },
      }),
    );
    expect(result).toEqual(body);
  });

  it('getMessages returns messages array', async () => {
    const body = { messages: [{ id: '1', title: 'test' }] };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const service = new LighthouseService(options);
    const result = await service.getMessages();

    expect(result).toEqual([{ id: '1', title: 'test' }]);
  });

  it('getMessages returns [] when messages is undefined', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const service = new LighthouseService(options);
    const result = await service.getMessages();

    expect(result).toEqual([]);
  });

  it('throws KSeFError when lighthouseUrl is empty', async () => {
    const service = new LighthouseService({ ...options, lighthouseUrl: '' });

    await expect(service.getStatus()).rejects.toThrow(KSeFError);
    await expect(service.getStatus()).rejects.toThrow('DEMO');
  });

  it('throws KSeFError on HTTP error', async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('Internal Server Error', { status: 500 })),
    );
    vi.stubGlobal('fetch', mockFetch);

    const service = new LighthouseService(options);

    await expect(service.getStatus()).rejects.toThrow(KSeFError);
    await expect(service.getStatus()).rejects.toThrow('HTTP 500');
  });
});
