import { BatchSessionService } from '../../../src/services/batch-session.js';
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

  it('openSession with upoVersion sets X-KSeF-Feature header', async () => {
    const client = createMockRestClient();
    const service = new BatchSessionService(client);
    const request = { formCode: { code: 'FA' } } as any;
    const body = { referenceNumber: 'batch-ref', partUploadRequests: [] };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    await service.openSession(request, 'v2.1');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Sessions.Batch.open);
    expect(req.getHeaders()).toHaveProperty('X-KSeF-Feature', 'v2.1');
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

  it('closeSession sends POST to sessions/batch/{batchRef}/close', async () => {
    const client = createMockRestClient();
    const service = new BatchSessionService(client);

    await service.closeSession('batch-xyz');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Sessions.Batch.close('batch-xyz'));
    expect(client.execute).toHaveBeenCalledTimes(1);
  });
});
