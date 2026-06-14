import { AuthService } from '../../../src/services/auth.js';
import { KSEF_FEATURE_HEADER, ENFORCE_XADES_COMPLIANCE } from '../../../src/http/ksef-feature.js';
import { Routes } from '../../../src/http/routes.js';
import { createMockRestClient, getRequest, mockResponse } from './_helpers.js';

describe('AuthService', () => {
  let client: ReturnType<typeof createMockRestClient>;
  let service: AuthService;

  beforeEach(() => {
    client = createMockRestClient();
    service = new AuthService(client);
  });

  it('getChallenge sends POST to auth/challenge and returns body', async () => {
    const body = { challenge: 'abc123', timestamp: '2026-01-01T00:00:00Z' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.getChallenge();

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Authorization.challenge);
    expect(result).toEqual(body);
  });

  it('submitXadesAuthRequest sends POST with XML body, correct Content-Type and verifyCertificateChain=false by default', async () => {
    const body = { referenceNumber: 'ref-1', processDescription: 'ok' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const signedXml = '<SignedXml>data</SignedXml>';
    const result = await service.submitXadesAuthRequest(signedXml);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Authorization.xadesSignature);
    expect(req.getBody()).toBe(signedXml);
    expect(req.getHeaders()).toHaveProperty('Content-Type', 'application/xml');
    expect(req.getQuery()).toEqual([['verifyCertificateChain', 'false']]);
    expect(result).toEqual(body);
  });

  it('submitXadesAuthRequest with verifyCertificateChain=true sends query param true', async () => {
    const body = { referenceNumber: 'ref-2', processDescription: 'ok' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    await service.submitXadesAuthRequest('<xml/>', true);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.getQuery()).toEqual([['verifyCertificateChain', 'true']]);
  });

  it('submitXadesAuthRequest without enforceXadesCompliance does not set X-KSeF-Feature header', async () => {
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse({ referenceNumber: 'ref-3' }));

    await service.submitXadesAuthRequest('<xml/>');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.getHeaders()).not.toHaveProperty(KSEF_FEATURE_HEADER);
  });

  it('submitXadesAuthRequest with enforceXadesCompliance=true sets X-KSeF-Feature header', async () => {
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse({ referenceNumber: 'ref-4' }));

    await service.submitXadesAuthRequest('<xml/>', false, true);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.getHeaders()).toHaveProperty(KSEF_FEATURE_HEADER, ENFORCE_XADES_COMPLIANCE);
  });

  it('submitKsefTokenAuthRequest sends POST with payload body', async () => {
    const payload = { token: 'ksef-token-abc', nip: '1234567890' };
    const body = { referenceNumber: 'ref-3', processDescription: 'ok' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.submitKsefTokenAuthRequest(payload as any);

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Authorization.ksefToken);
    expect(req.getBody()).toEqual(payload);
    expect(result).toEqual(body);
  });

  it('getAuthStatus sends GET with reference number in path and Authorization header', async () => {
    const body = { processingCode: 200, processingDescription: 'ok' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.getAuthStatus('ref-number-42', 'my-auth-token');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('GET');
    expect(req.path).toBe('auth/ref-number-42');
    expect(req.getHeaders()).toHaveProperty('Authorization', 'Bearer my-auth-token');
    expect(result).toEqual(body);
  });

  it('getAccessToken sends POST to auth/token/redeem with Authorization header', async () => {
    const body = { accessToken: 'new-access', refreshToken: 'new-refresh' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.getAccessToken('my-auth-token');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Authorization.Token.redeem);
    expect(req.getHeaders()).toHaveProperty('Authorization', 'Bearer my-auth-token');
    expect(result).toEqual(body);
  });

  it('refreshAccessToken sends POST with Authorization header and skipAuthRetry enabled', async () => {
    const body = { accessToken: 'refreshed-access', refreshToken: 'refreshed-refresh' };
    vi.mocked(client.execute).mockResolvedValueOnce(mockResponse(body));

    const result = await service.refreshAccessToken('my-refresh-token');

    const req = getRequest(vi.mocked(client.execute));
    expect(req.method).toBe('POST');
    expect(req.path).toBe(Routes.Authorization.Token.refresh);
    expect(req.getHeaders()).toHaveProperty('Authorization', 'Bearer my-refresh-token');
    expect(req.isSkipAuthRetry()).toBe(true);
    expect(result).toEqual(body);
  });
});
