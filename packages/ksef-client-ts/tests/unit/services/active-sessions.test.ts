import { ActiveSessionsService } from '../../../src/services/active-sessions.js';
import { createMockRestClient, getRequest, mockResponse } from './_helpers.js';

describe('ActiveSessionsService', () => {
  it('getActiveSessions without params sends GET to correct path with no query or continuation header', async () => {
    const client = createMockRestClient();
    const service = new ActiveSessionsService(client);
    const body = { sessions: [], numberOfElements: 0 };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.getActiveSessions();

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.path).toBe('auth/sessions');
    expect(req.getQuery()).toEqual([]);
    expect(req.getHeaders()).not.toHaveProperty('x-continuation-token');
    expect(result).toEqual(body);
  });

  it('getActiveSessions with pagination sends pageSize query and x-continuation-token header', async () => {
    const client = createMockRestClient();
    const service = new ActiveSessionsService(client);
    const body = { sessions: [], numberOfElements: 0 };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    await service.getActiveSessions(25, 'abc-token-123');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.getQuery()).toEqual([['pageSize', '25']]);
    expect(req.getHeaders()).toHaveProperty('x-continuation-token', 'abc-token-123');
  });

  it('getActiveSessionsRev2 without params sends GET to the rev2 path', async () => {
    const client = createMockRestClient();
    const service = new ActiveSessionsService(client);
    const body = { items: [] };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.getActiveSessionsRev2();

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.path).toBe('auth/sessions/rev2');
    expect(req.getQuery()).toEqual([]);
    expect(req.getHeaders()).not.toHaveProperty('x-continuation-token');
    expect(result).toEqual(body);
  });

  it('getActiveSessionsRev2 sends pageSize and continuation token', async () => {
    const client = createMockRestClient();
    const service = new ActiveSessionsService(client);
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse({ items: [] }));

    await service.getActiveSessionsRev2(25, 'rev2-token');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.getQuery()).toEqual([['pageSize', '25']]);
    expect(req.getHeaders()).toHaveProperty('x-continuation-token', 'rev2-token');
  });

  it('revokeCurrentSession sends DELETE to auth/sessions/current', async () => {
    const client = createMockRestClient();
    const service = new ActiveSessionsService(client);

    await service.revokeCurrentSession();

    const req = getRequest(vi.mocked(client.executeVoid));
    expect(req.method).toBe('DELETE');
    expect(req.path).toBe('auth/sessions/current');
  });

  it('revokeSession sends DELETE with session ref in path', async () => {
    const client = createMockRestClient();
    const service = new ActiveSessionsService(client);

    await service.revokeSession('session-ref-42');

    const req = getRequest(vi.mocked(client.executeVoid));
    expect(req.method).toBe('DELETE');
    expect(req.path).toBe('auth/sessions/session-ref-42');
  });

  it('revokeSession returns void (executeVoid called once, result is undefined)', async () => {
    const client = createMockRestClient();
    const service = new ActiveSessionsService(client);

    const result = await service.revokeSession('ref-xyz');

    expect(client.executeVoid).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
  });
});
