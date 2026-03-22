import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authenticateWithToken, authenticateWithCertificate } from '../../../src/workflows/auth-workflow.js';

function createMockClient() {
  return {
    crypto: {
      init: vi.fn(),
      encryptKsefToken: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
    },
    auth: {
      getChallenge: vi.fn().mockResolvedValue({
        challenge: 'ch-123',
        timestamp: '2026-01-01T00:00:00.000Z',
        timestampMs: 1735689600000,
        clientIp: '127.0.0.1',
      }),
      submitKsefTokenAuthRequest: vi.fn().mockResolvedValue({
        referenceNumber: 'auth-ref-1',
        authenticationToken: { token: 'auth-token-abc', validUntil: '2026-01-02T00:00:00Z' },
      }),
      submitXadesAuthRequest: vi.fn().mockResolvedValue({
        referenceNumber: 'auth-ref-2',
        authenticationToken: { token: 'auth-token-xades', validUntil: '2026-01-02T00:00:00Z' },
      }),
      getAuthStatus: vi.fn().mockResolvedValue({
        status: { code: 200, description: 'OK' },
      }),
      getAccessToken: vi.fn().mockResolvedValue({
        accessToken: { token: 'access-tok', validUntil: '2026-01-02T00:00:00Z' },
        refreshToken: { token: 'refresh-tok', validUntil: '2026-01-10T00:00:00Z' },
      }),
    },
    authManager: {
      setAccessToken: vi.fn(),
      setRefreshToken: vi.fn(),
    },
  } as any;
}

let client: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  client = createMockClient();
});

describe('authenticateWithToken', () => {
  it('performs full token auth flow: challenge → encrypt → submit → poll → get tokens', async () => {
    const result = await authenticateWithToken(client, {
      nip: '1234567890',
      token: 'my-ksef-token',
      pollOptions: { intervalMs: 1 },
    });

    expect(client.auth.getChallenge).toHaveBeenCalledOnce();
    expect(client.crypto.init).toHaveBeenCalledOnce();
    expect(client.crypto.encryptKsefToken).toHaveBeenCalledWith('my-ksef-token', '2026-01-01T00:00:00.000Z');
    expect(client.auth.submitKsefTokenAuthRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        challenge: 'ch-123',
        contextIdentifier: { type: 'Nip', value: '1234567890' },
        encryptedToken: expect.any(String),
      }),
    );
    expect(client.auth.getAuthStatus).toHaveBeenCalledWith('auth-ref-1', 'auth-token-abc');
    expect(client.auth.getAccessToken).toHaveBeenCalledWith('auth-token-abc');
    expect(client.authManager.setAccessToken).toHaveBeenCalledWith('access-tok');
    expect(client.authManager.setRefreshToken).toHaveBeenCalledWith('refresh-tok');
    expect(result.accessToken).toBe('access-tok');
    expect(result.refreshToken).toBe('refresh-tok');
  });

  it('passes authorizationPolicy through', async () => {
    const policy = { allowedIps: { ip4Addresses: ['1.2.3.4'] } };
    await authenticateWithToken(client, {
      nip: '1234567890',
      token: 'tok',
      authorizationPolicy: policy,
      pollOptions: { intervalMs: 1 },
    });

    expect(client.auth.submitKsefTokenAuthRequest).toHaveBeenCalledWith(
      expect.objectContaining({ authorizationPolicy: policy }),
    );
  });

  it('polls past code 100 before getting tokens', async () => {
    let call = 0;
    client.auth.getAuthStatus.mockImplementation(async () => {
      call++;
      if (call < 3) return { status: { code: 100, description: 'Pending' } };
      return { status: { code: 200, description: 'OK' } };
    });

    const result = await authenticateWithToken(client, {
      nip: '1234567890',
      token: 'tok',
      pollOptions: { intervalMs: 1, maxAttempts: 10 },
    });

    expect(client.auth.getAuthStatus).toHaveBeenCalledTimes(3);
    expect(result.accessToken).toBe('access-tok');
  });
});

describe('authenticateWithCertificate', () => {
  it('performs full certificate auth flow: challenge → sign → submit → poll → get tokens', async () => {
    // Mock dynamic imports
    vi.doMock('../../../src/client.js', () => ({
      buildAuthTokenRequestXml: vi.fn().mockReturnValue('<AuthTokenRequest/>'),
    }));
    vi.doMock('../../../src/crypto/signature-service.js', () => ({
      SignatureService: { sign: vi.fn().mockReturnValue('<SignedXml/>') },
    }));

    // Re-import to pick up mocks
    const { authenticateWithCertificate: authCert } = await import('../../../src/workflows/auth-workflow.js');

    const result = await authCert(client, {
      nip: '1234567890',
      certPem: '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----',
      keyPem: '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----',
      pollOptions: { intervalMs: 1 },
    });

    expect(client.auth.getChallenge).toHaveBeenCalledOnce();
    expect(client.auth.submitXadesAuthRequest).toHaveBeenCalledWith('<SignedXml/>', false, false);
    expect(client.auth.getAuthStatus).toHaveBeenCalledWith('auth-ref-2', 'auth-token-xades');
    expect(client.auth.getAccessToken).toHaveBeenCalledWith('auth-token-xades');
    expect(result.accessToken).toBe('access-tok');
    expect(result.refreshToken).toBe('refresh-tok');

    vi.doUnmock('../../../src/client.js');
    vi.doUnmock('../../../src/crypto/signature-service.js');
  });

  it('passes verifyCertificateChain and enforceXadesCompliance', async () => {
    vi.doMock('../../../src/client.js', () => ({
      buildAuthTokenRequestXml: vi.fn().mockReturnValue('<AuthTokenRequest/>'),
    }));
    vi.doMock('../../../src/crypto/signature-service.js', () => ({
      SignatureService: { sign: vi.fn().mockReturnValue('<SignedXml/>') },
    }));

    const { authenticateWithCertificate: authCert } = await import('../../../src/workflows/auth-workflow.js');

    await authCert(client, {
      nip: '1234567890',
      certPem: 'cert',
      keyPem: 'key',
      verifyCertificateChain: true,
      enforceXadesCompliance: true,
      pollOptions: { intervalMs: 1 },
    });

    expect(client.auth.submitXadesAuthRequest).toHaveBeenCalledWith('<SignedXml/>', true, true);

    vi.doUnmock('../../../src/client.js');
    vi.doUnmock('../../../src/crypto/signature-service.js');
  });
});
