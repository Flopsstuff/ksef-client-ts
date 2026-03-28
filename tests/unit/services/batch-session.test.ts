import { BatchSessionService } from '../../../src/services/batch-session.js';
import { KSEF_FEATURE_HEADER, UpoVersion } from '../../../src/http/ksef-feature.js';
import { Routes } from '../../../src/http/routes.js';
import { createMockRestClient, getRequest, mockResponse } from './_helpers.js';

describe('BatchSessionService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('openSession sends POST with body and no X-KSeF-Feature header', async () => {
    const client = createMockRestClient();
    const service = new BatchSessionService(client);
    const request = { formCode: { code: 'FA' }, batchFile: {} } as any;
    const body = { referenceNumber: 'batch-ref', partUploadRequests: [] };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.openSession(request);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Sessions.Batch.open);
    expect(req.getBody()).toBe(request);
    expect(req.getHeaders()).not.toHaveProperty('X-KSeF-Feature');
    expect(result).toEqual(body);
  });

  it('openSession with UpoVersion.V4_3 sets X-KSeF-Feature header', async () => {
    const client = createMockRestClient();
    const service = new BatchSessionService(client);
    const request = { formCode: { code: 'FA' } } as any;
    const body = { referenceNumber: 'batch-ref', partUploadRequests: [] };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    await service.openSession(request, UpoVersion.V4_3);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Sessions.Batch.open);
    expect(req.getHeaders()).toHaveProperty(KSEF_FEATURE_HEADER, 'upo-v4-3');
  });

  it('openSession with UpoVersion.V4_2 sets X-KSeF-Feature header', async () => {
    const client = createMockRestClient();
    const service = new BatchSessionService(client);
    const request = { formCode: { code: 'FA' } } as any;
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse({ referenceNumber: 'batch-ref', partUploadRequests: [] }));

    await service.openSession(request, UpoVersion.V4_2);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.getHeaders()).toHaveProperty(KSEF_FEATURE_HEADER, 'upo-v4-2');
  });

  it('sendParts uploads to presigned URLs with correct method, headers, and body', async () => {
    const client = createMockRestClient();
    const service = new BatchSessionService(client);
    const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const openResponse = {
      referenceNumber: 'batch-ref',
      partUploadRequests: [
        { ordinalNumber: 1, url: 'https://presigned.url/part1', method: 'PUT', headers: { 'x-custom': 'val1' } },
        { ordinalNumber: 2, url: 'https://presigned.url/part2', method: 'PUT', headers: { 'x-custom': 'val2' } },
      ],
    } as any;
    const parts = [
      { ordinalNumber: 1, data: 'data-part-1' },
      { ordinalNumber: 2, data: 'data-part-2' },
    ] as any[];

    await service.sendParts(openResponse, parts);

    expect(mockFetch).toHaveBeenCalledWith('https://presigned.url/part1', {
      method: 'PUT',
      headers: { 'x-custom': 'val1' },
      body: 'data-part-1',
    });
    expect(mockFetch).toHaveBeenCalledWith('https://presigned.url/part2', {
      method: 'PUT',
      headers: { 'x-custom': 'val2' },
      body: 'data-part-2',
    });
  });

  it('sendParts throws when part ordinalNumber not found in partUploadRequests', async () => {
    const client = createMockRestClient();
    const service = new BatchSessionService(client);
    const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const openResponse = {
      referenceNumber: 'batch-ref',
      partUploadRequests: [
        { ordinalNumber: 1, url: 'https://presigned.url/part1', method: 'PUT', headers: {} },
      ],
    } as any;
    const parts = [
      { ordinalNumber: 99, data: 'orphan-data' },
    ] as any[];

    await expect(service.sendParts(openResponse, parts)).rejects.toThrow(
      'No upload request found for part 99',
    );
  });

  it('sendParts uploads all parts in parallel', async () => {
    const client = createMockRestClient();
    const service = new BatchSessionService(client);
    const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const openResponse = {
      referenceNumber: 'batch-ref',
      partUploadRequests: [
        { ordinalNumber: 1, url: 'https://presigned.url/part1', method: 'PUT', headers: {} },
        { ordinalNumber: 2, url: 'https://presigned.url/part2', method: 'PUT', headers: {} },
      ],
    } as any;
    const parts = [
      { ordinalNumber: 1, data: 'data-1' },
      { ordinalNumber: 2, data: 'data-2' },
    ] as any[];

    await service.sendParts(openResponse, parts);

    expect(mockFetch.mock.calls.length).toBe(2);
  });

  it('sendPartsWithStream uploads parts sequentially (not concurrent)', async () => {
    const client = createMockRestClient();
    const service = new BatchSessionService(client);
    const callOrder: number[] = [];
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const ordinal = _url.endsWith('part1') ? 1 : 2;
      callOrder.push(ordinal);
      // Simulate network delay — if concurrent, both would start before either finishes
      await new Promise((r) => setTimeout(r, 10));
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', mockFetch);

    const openResponse = {
      referenceNumber: 'batch-ref',
      partUploadRequests: [
        { ordinalNumber: 1, url: 'https://presigned.url/part1', method: 'PUT', headers: {} },
        { ordinalNumber: 2, url: 'https://presigned.url/part2', method: 'PUT', headers: {} },
      ],
    } as any;

    const makeStream = () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } });
    const parts = [
      { ordinalNumber: 1, dataStream: makeStream(), metadata: { hashSHA: 'a', fileSize: 1 } },
      { ordinalNumber: 2, dataStream: makeStream(), metadata: { hashSHA: 'b', fileSize: 1 } },
    ];

    await service.sendPartsWithStream(openResponse, parts);

    // Sequential: part 1 completes before part 2 starts
    expect(callOrder).toEqual([1, 2]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('sendPartsWithStream throws on ordinal mismatch', async () => {
    const client = createMockRestClient();
    const service = new BatchSessionService(client);
    vi.stubGlobal('fetch', vi.fn());

    const openResponse = {
      referenceNumber: 'batch-ref',
      partUploadRequests: [
        { ordinalNumber: 1, url: 'https://presigned.url/part1', method: 'PUT', headers: {} },
      ],
    } as any;

    const makeStream = () => new ReadableStream({ start(c) { c.close(); } });
    const parts = [
      { ordinalNumber: 99, dataStream: makeStream(), metadata: { hashSHA: 'x', fileSize: 0 } },
    ];

    await expect(service.sendPartsWithStream(openResponse, parts)).rejects.toThrow(
      'No upload request found for part 99',
    );
  });

  it('sendPartsWithStream passes correct headers and stream body', async () => {
    const client = createMockRestClient();
    const service = new BatchSessionService(client);
    const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const openResponse = {
      referenceNumber: 'batch-ref',
      partUploadRequests: [
        { ordinalNumber: 1, url: 'https://presigned.url/part1', method: 'PUT', headers: { 'x-custom': 'val1', 'x-null': null } },
      ],
    } as any;

    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([42])); c.close(); } });
    const parts = [
      { ordinalNumber: 1, dataStream: stream, metadata: { hashSHA: 'h', fileSize: 1 } },
    ];

    await service.sendPartsWithStream(openResponse, parts);

    expect(mockFetch).toHaveBeenCalledWith('https://presigned.url/part1', expect.objectContaining({
      method: 'PUT',
      headers: { 'x-custom': 'val1' }, // null header filtered out
      body: stream,
    }));
  });

  it('closeSession sends POST to sessions/batch/{batchRef}/close', async () => {
    const client = createMockRestClient();
    const service = new BatchSessionService(client);

    await service.closeSession('batch-xyz');

    const req = getRequest(vi.mocked(client.executeVoid));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Sessions.Batch.close('batch-xyz'));
    expect(client.executeVoid).toHaveBeenCalledTimes(1);
  });
});
