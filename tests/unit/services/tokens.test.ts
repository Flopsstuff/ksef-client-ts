import { TokenService } from '../../../src/services/tokens.js';
import { Routes } from '../../../src/http/routes.js';
import { KSeFApiError } from '../../../src/errors/ksef-api-error.js';
import { KSeFError } from '../../../src/errors/ksef-error.js';
import { createMockRestClient, getRequest, mockResponse } from './_helpers.js';

function buildTestJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

const CTX_TOKEN_PAYLOAD = {
  typ: 'ContextToken',
  cit: 'Nip',
  civ: '8952265388',
  aum: 'Token',
  asi: JSON.stringify({ type: 'Nip', value: '8952265388' }),
};

function makeListItem(overrides: Record<string, unknown> = {}) {
  return {
    referenceNumber: 'ref-from-list',
    status: 'Active',
    description: 'x',
    dateCreated: '2026-04-18T00:00:00Z',
    authorIdentifier: { type: 'Nip', value: '8952265388' },
    contextIdentifier: { type: 'Nip', value: '8952265388' },
    requestedPermissions: [],
    ...overrides,
  };
}

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

  describe('findSelfReferenceNumber', () => {
    it('returns payload.trn when present in JWT', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);
      const jwt = buildTestJwt({ ...CTX_TOKEN_PAYLOAD, trn: 'ref-from-jwt' });

      const ref = await service.findSelfReferenceNumber(jwt);

      expect(ref).toBe('ref-from-jwt');
      expect(client.execute).not.toHaveBeenCalled();
    });

    it('returns payload.jti when trn absent but jti present', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);
      const jwt = buildTestJwt({ ...CTX_TOKEN_PAYLOAD, jti: 'ref-from-jti' });

      const ref = await service.findSelfReferenceNumber(jwt);

      expect(ref).toBe('ref-from-jti');
      expect(client.execute).not.toHaveBeenCalled();
    });

    it('falls back to list and returns the single active match', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);
      const jwt = buildTestJwt(CTX_TOKEN_PAYLOAD);
      vi.mocked(client.execute).mockResolvedValueOnce(
        mockResponse({ tokens: [makeListItem({ referenceNumber: 'only-active' })] }),
      );

      const ref = await service.findSelfReferenceNumber(jwt);

      const req = getRequest(vi.mocked(client.execute));
      expect(req.method).toBe('GET');
      expect(req.path).toBe(Routes.Tokens.root);
      expect(req.getQuery()).toEqual(
        expect.arrayContaining([
          ['status', 'Active'],
          ['authorIdentifier', '8952265388'],
          ['authorIdentifierType', 'Nip'],
        ]),
      );
      expect(ref).toBe('only-active');
    });

    it('returns undefined when list returns 0 matches in the current context', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);
      const jwt = buildTestJwt(CTX_TOKEN_PAYLOAD);
      vi.mocked(client.execute).mockResolvedValueOnce(mockResponse({ tokens: [] }));

      expect(await service.findSelfReferenceNumber(jwt)).toBeUndefined();
    });

    it('returns undefined when list returns 2+ matches (ambiguous)', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);
      const jwt = buildTestJwt(CTX_TOKEN_PAYLOAD);
      vi.mocked(client.execute).mockResolvedValueOnce(
        mockResponse({
          tokens: [
            makeListItem({ referenceNumber: 'a' }),
            makeListItem({ referenceNumber: 'b' }),
          ],
        }),
      );

      expect(await service.findSelfReferenceNumber(jwt)).toBeUndefined();
    });

    it('filters out list items from a different context', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);
      const jwt = buildTestJwt(CTX_TOKEN_PAYLOAD);
      vi.mocked(client.execute).mockResolvedValueOnce(
        mockResponse({
          tokens: [
            makeListItem({ referenceNumber: 'other-ctx', contextIdentifier: { type: 'Nip', value: '9999999999' } }),
            makeListItem({ referenceNumber: 'same-ctx' }),
          ],
        }),
      );

      expect(await service.findSelfReferenceNumber(jwt)).toBe('same-ctx');
    });

    it('returns undefined when accessToken is empty', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);

      expect(await service.findSelfReferenceNumber('')).toBeUndefined();
      expect(client.execute).not.toHaveBeenCalled();
    });

    it('returns undefined for unrecognized author identifier types', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);
      const jwt = buildTestJwt({
        ...CTX_TOKEN_PAYLOAD,
        asi: JSON.stringify({ type: 'NotARealType', value: '8952265388' }),
      });

      expect(await service.findSelfReferenceNumber(jwt)).toBeUndefined();
      expect(client.execute).not.toHaveBeenCalled();
    });

    it('walks continuation pages and returns the single matching token', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);
      const jwt = buildTestJwt(CTX_TOKEN_PAYLOAD);
      vi.mocked(client.execute)
        .mockResolvedValueOnce(
          mockResponse({
            tokens: [
              makeListItem({ referenceNumber: 'other-ctx', contextIdentifier: { type: 'Nip', value: '9999999999' } }),
            ],
            continuationToken: 'next-page',
          }),
        )
        .mockResolvedValueOnce(
          mockResponse({ tokens: [makeListItem({ referenceNumber: 'on-page-2' })] }),
        );

      const ref = await service.findSelfReferenceNumber(jwt);

      expect(ref).toBe('on-page-2');
      expect(client.execute).toHaveBeenCalledTimes(2);
    });

    it('returns undefined (ambiguous) when a second match appears on a later page', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);
      const jwt = buildTestJwt(CTX_TOKEN_PAYLOAD);
      vi.mocked(client.execute)
        .mockResolvedValueOnce(
          mockResponse({
            tokens: [makeListItem({ referenceNumber: 'first' })],
            continuationToken: 'next-page',
          }),
        )
        .mockResolvedValueOnce(
          mockResponse({ tokens: [makeListItem({ referenceNumber: 'second' })] }),
        );

      expect(await service.findSelfReferenceNumber(jwt)).toBeUndefined();
    });
  });

  describe('revokeSelf', () => {
    it('uses referenceNumber when provided and skips discovery', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);

      const result = await service.revokeSelf({ referenceNumber: 'known-ref' });

      const req = getRequest(vi.mocked(client.executeVoid));
      expect(req.method).toBe('DELETE');
      expect(req.path).toBe(Routes.Tokens.byReference('known-ref'));
      expect(client.execute).not.toHaveBeenCalled();
      expect(result).toEqual({ referenceNumber: 'known-ref', alreadyRevoked: false });
    });

    it('discovers via JWT payload when referenceNumber absent', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);
      const jwt = buildTestJwt({ ...CTX_TOKEN_PAYLOAD, trn: 'jwt-ref' });

      const result = await service.revokeSelf({ accessToken: jwt });

      const req = getRequest(vi.mocked(client.executeVoid));
      expect(req.path).toBe(Routes.Tokens.byReference('jwt-ref'));
      expect(result.referenceNumber).toBe('jwt-ref');
    });

    it('discovers via list-fallback when JWT lacks reference', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);
      const jwt = buildTestJwt(CTX_TOKEN_PAYLOAD);
      vi.mocked(client.execute).mockResolvedValueOnce(
        mockResponse({ tokens: [makeListItem({ referenceNumber: 'list-ref' })] }),
      );

      const result = await service.revokeSelf({ accessToken: jwt });

      expect(result.referenceNumber).toBe('list-ref');
      const deleteReq = getRequest(vi.mocked(client.executeVoid));
      expect(deleteReq.path).toBe(Routes.Tokens.byReference('list-ref'));
    });

    it('throws KSeFError on ambiguous discovery', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);
      const jwt = buildTestJwt(CTX_TOKEN_PAYLOAD);
      vi.mocked(client.execute).mockResolvedValue(
        mockResponse({
          tokens: [
            makeListItem({ referenceNumber: 'a' }),
            makeListItem({ referenceNumber: 'b' }),
          ],
        }),
      );

      const err = await service.revokeSelf({ accessToken: jwt }).catch((e) => e);
      expect(err).toBeInstanceOf(KSeFError);
      expect(err.name).toBe('KSeFError');
      expect(client.executeVoid).not.toHaveBeenCalled();
    });

    it('throws when no accessToken and no referenceNumber', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);

      await expect(service.revokeSelf({})).rejects.toBeInstanceOf(KSeFError);
      expect(client.executeVoid).not.toHaveBeenCalled();
    });

    it.each([404, 409, 410])('treats %d on DELETE as already-revoked', async (statusCode) => {
      const client = createMockRestClient();
      const service = new TokenService(client);
      vi.mocked(client.executeVoid).mockRejectedValueOnce(
        new KSeFApiError('already gone', statusCode),
      );

      const result = await service.revokeSelf({ referenceNumber: 'gone' });

      expect(result).toEqual({ referenceNumber: 'gone', alreadyRevoked: true });
    });

    it('rethrows non-idempotent errors from DELETE', async () => {
      const client = createMockRestClient();
      const service = new TokenService(client);
      vi.mocked(client.executeVoid).mockRejectedValueOnce(new KSeFApiError('server boom', 500));

      await expect(service.revokeSelf({ referenceNumber: 'x' })).rejects.toMatchObject({
        statusCode: 500,
      });
    });
  });
});
