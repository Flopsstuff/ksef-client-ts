import { TokenService } from '../../../src/services/tokens.js';
import { Routes } from '../../../src/http/routes.js';
import { createMockRestClient, getRequest, mockResponse } from './_helpers.js';

describe('TokenService', () => {
  it('generateToken sends POST with body to tokens route', async () => {
    const client = createMockRestClient();
    const service = new TokenService(client);
    const request = { name: 'my-token', description: 'test token' };
    const expected = { tokenReference: 'ref-123', token: 'abc' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

    const result = await service.generateToken(request as any);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Tokens.root);
    expect(req.getBody()).toEqual(request);
    expect(result).toEqual(expected);
  });

  it('queryTokens without options sends GET to tokens route with empty query', async () => {
    const client = createMockRestClient();
    const service = new TokenService(client);
    const expected = { tokens: [], numberOfElements: 0 };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

    const result = await service.queryTokens();

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.path).toBe(Routes.Tokens.root);
    expect(req.getQuery()).toEqual([]);
    expect(req.getHeaders()).not.toHaveProperty('x-continuation-token');
    expect(result).toEqual(expected);
  });

  it('queryTokens with all options sends correct multi-value query params', async () => {
    const client = createMockRestClient();
    const service = new TokenService(client);
    const expected = { tokens: [], numberOfElements: 0 };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

    await service.queryTokens({
      continuationToken: 'abc-token-123',
      pageSize: 10,
      status: ['Active', 'Pending'],
      description: 'test',
      authorIdentifier: '1234567890',
      authorIdentifierType: 'Nip',
    });

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.path).toBe(Routes.Tokens.root);
    expect(req.getHeaders()).toHaveProperty('x-continuation-token', 'abc-token-123');
    expect(req.getQuery()).toEqual([
      ['pageSize', '10'],
      ['status', 'Active'],
      ['status', 'Pending'],
      ['description', 'test'],
      ['authorIdentifier', '1234567890'],
      ['authorIdentifierType', 'Nip'],
    ]);
  });

  it('getToken sends GET with ref in path', async () => {
    const client = createMockRestClient();
    const service = new TokenService(client);
    const expected = { tokenReference: 'token-ref-42', description: 'a token' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(expected));

    const result = await service.getToken('token-ref-42');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.path).toBe(Routes.Tokens.byReference('token-ref-42'));
    expect(result).toEqual(expected);
  });

  it('revokeToken sends DELETE with ref in path', async () => {
    const client = createMockRestClient();
    const service = new TokenService(client);

    await service.revokeToken('token-ref-99');

    const req = getRequest(vi.mocked(client.executeVoid));
    expect(req.method).toBe('DELETE');
    expect(req.path).toBe(Routes.Tokens.byReference('token-ref-99'));
  });

  it('revokeToken returns void (execute called once, result is undefined)', async () => {
    const client = createMockRestClient();
    const service = new TokenService(client);

    const result = await service.revokeToken('ref-xyz');

    expect(client.executeVoid).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
  });
});
