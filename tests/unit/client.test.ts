import { KSeFClient } from '../../src/client.js';
import type { AuthManager } from '../../src/http/auth-manager.js';
import type {
  AuthChallengeResponse,
  AuthenticationInitResponse,
  AuthenticationTokensResponse,
} from '../../src/models/auth/types.js';

const mockSign = vi.fn().mockReturnValue('<signed-xml/>');
vi.mock('../../src/crypto/signature-service.js', () => ({
  SignatureService: { sign: mockSign },
}));

const mockPkcs12Load = vi.fn().mockReturnValue({
  certificatePem: '-----BEGIN CERTIFICATE-----\nP12CERT\n-----END CERTIFICATE-----',
  privateKeyPem: '-----BEGIN RSA PRIVATE KEY-----\nP12KEY\n-----END RSA PRIVATE KEY-----',
});
vi.mock('../../src/crypto/pkcs12-loader.js', () => ({
  Pkcs12Loader: { load: (...args: unknown[]) => mockPkcs12Load(...args) },
}));

const FIXTURES = {
  nip: '1234567890',
  token: 'test-ksef-token-abc123',
  certPem: '-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----',
  keyPem: '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----',
  challengeResponse: {
    challenge: 'challenge-uuid-12345',
    timestamp: '2025-01-15T10:30:00.000Z',
    timestampMs: 1736935800000,
    clientIp: '192.168.1.1',
  } satisfies AuthChallengeResponse,
  authInitResponse: {
    referenceNumber: 'ref-20250115-001',
    authenticationToken: { token: 'auth-token-xyz789', validUntil: '2025-01-15T11:30:00.000Z' },
  } satisfies AuthenticationInitResponse,
  tokensResponse: {
    accessToken: { token: 'access-token-final-abc', validUntil: '2025-01-15T12:30:00.000Z' },
    refreshToken: { token: 'refresh-token-final-def', validUntil: '2025-01-16T10:30:00.000Z' },
  } satisfies AuthenticationTokensResponse,
};

function createMockAuthManager(): AuthManager {
  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  return {
    getAccessToken: () => accessToken,
    setAccessToken: vi.fn((t: string | undefined) => { accessToken = t; }),
    getRefreshToken: () => refreshToken,
    setRefreshToken: vi.fn((t: string | undefined) => { refreshToken = t; }),
    onUnauthorized: vi.fn().mockResolvedValue(null),
  };
}

describe('KSeFClient', () => {
  it('constructs with default options', () => {
    const client = new KSeFClient();
    expect(client.options.apiVersion).toBe('v2');
    expect(client.auth).toBeDefined();
    expect(client.crypto).toBeDefined();
    expect(client.qr).toBeDefined();
  });

  it('accepts transport config options', () => {
    const transport = vi.fn();
    const client = new KSeFClient({
      transport,
      retry: { maxRetries: 5 },
      rateLimit: { globalRps: 20 },
      presignedUrlHosts: ['*.s3.amazonaws.com'],
    });

    expect(client.options).toBeDefined();
    expect(client.auth).toBeDefined();
  });

  it('accepts null rateLimit to disable rate limiting', () => {
    const client = new KSeFClient({ rateLimit: null });
    expect(client.options).toBeDefined();
  });

  it('forwards onSystemWarning to RestClient and invokes it on X-System-Warning', async () => {
    const onSystemWarning = vi.fn();
    const transport = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(FIXTURES.challengeResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-System-Warning': 'Planned maintenance window approaching',
        },
      }),
    );
    const client = new KSeFClient({ transport, onSystemWarning });

    await client.auth.getChallenge();

    expect(onSystemWarning).toHaveBeenCalledOnce();
    expect(onSystemWarning).toHaveBeenCalledWith('Planned maintenance window approaching');
  });

  it('creates all service properties', () => {
    const client = new KSeFClient();
    expect(client.auth).toBeDefined();
    expect(client.activeSessions).toBeDefined();
    expect(client.onlineSession).toBeDefined();
    expect(client.batchSession).toBeDefined();
    expect(client.sessionStatus).toBeDefined();
    expect(client.invoices).toBeDefined();
    expect(client.permissions).toBeDefined();
    expect(client.tokens).toBeDefined();
    expect(client.certificates).toBeDefined();
    expect(client.lighthouse).toBeDefined();
    expect(client.limits).toBeDefined();
    expect(client.peppol).toBeDefined();
    expect(client.testData).toBeDefined();
    expect(client.crypto).toBeDefined();
    expect(client.qr).toBeDefined();
  });

  describe('authManager', () => {
    it('uses custom authManager passed via options', () => {
      const authManager = createMockAuthManager();
      const client = new KSeFClient({ authManager });
      expect(client.authManager).toBe(authManager);
    });
  });

  describe('loginWithToken', () => {
    let client: KSeFClient;
    let authManager: AuthManager;
    let getChallengespy: ReturnType<typeof vi.spyOn>;
    let submitSpy: ReturnType<typeof vi.spyOn>;
    let getAccessTokenSpy: ReturnType<typeof vi.spyOn>;
    let getAuthStatusSpy: ReturnType<typeof vi.spyOn>;
    let cryptoInitSpy: ReturnType<typeof vi.spyOn>;
    let encryptSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      authManager = createMockAuthManager();
      client = new KSeFClient({ authManager });

      getChallengespy = vi.spyOn(client.auth, 'getChallenge')
        .mockResolvedValue(FIXTURES.challengeResponse);
      submitSpy = vi.spyOn(client.auth, 'submitKsefTokenAuthRequest')
        .mockResolvedValue(FIXTURES.authInitResponse);
      getAuthStatusSpy = vi.spyOn(client.auth, 'getAuthStatus')
        .mockResolvedValue({
          startDate: '2025-01-15T10:30:00.000Z',
          authenticationMethodInfo: { category: 'Token', code: 'TOKEN', displayName: 'Token' },
          authenticationMethod: 'Token',
          status: { code: 200, description: 'OK' },
        });
      getAccessTokenSpy = vi.spyOn(client.auth, 'getAccessToken')
        .mockResolvedValue(FIXTURES.tokensResponse);
      cryptoInitSpy = vi.spyOn(client.crypto, 'init')
        .mockResolvedValue(undefined);
      encryptSpy = vi.spyOn(client.crypto, 'encryptKsefToken')
        .mockReturnValue(new Uint8Array([1, 2, 3]));
      vi.spyOn(client.crypto, 'getKsefTokenPublicKeyId')
        .mockReturnValue('ksef-token-public-key-id');
    });

    it('happy path — stores tokens after successful login', async () => {
      await client.loginWithToken(FIXTURES.token, FIXTURES.nip);

      expect(getChallengespy).toHaveBeenCalledOnce();
      expect(cryptoInitSpy).toHaveBeenCalledOnce();
      expect(encryptSpy).toHaveBeenCalledOnce();
      expect(submitSpy).toHaveBeenCalledOnce();
      expect(getAccessTokenSpy).toHaveBeenCalledWith('auth-token-xyz789');
      expect(authManager.setAccessToken).toHaveBeenCalledWith('access-token-final-abc');
      expect(authManager.setRefreshToken).toHaveBeenCalledWith('refresh-token-final-def');
    });

    it('returns clientIp from challenge', async () => {
      const result = await client.loginWithToken(FIXTURES.token, FIXTURES.nip);
      expect(result).toEqual({ clientIp: '192.168.1.1' });
    });

    it('calls crypto.init before encryptKsefToken', async () => {
      const callOrder: string[] = [];
      cryptoInitSpy.mockImplementation(async () => { callOrder.push('init'); });
      encryptSpy.mockImplementation(() => { callOrder.push('encrypt'); return new Uint8Array([1, 2, 3]); });

      await client.loginWithToken(FIXTURES.token, FIXTURES.nip);

      expect(callOrder).toEqual(['init', 'encrypt']);
    });

    it('passes correct payload to submitKsefTokenAuthRequest', async () => {
      await client.loginWithToken(FIXTURES.token, FIXTURES.nip);

      expect(submitSpy).toHaveBeenCalledWith({
        challenge: 'challenge-uuid-12345',
        contextIdentifier: { type: 'Nip', value: '1234567890' },
        encryptedToken: Buffer.from(new Uint8Array([1, 2, 3])).toString('base64'),
        publicKeyId: 'ksef-token-public-key-id',
      });
    });

    it('propagates getChallenge error', async () => {
      const error = new Error('challenge failed');
      getChallengespy.mockRejectedValue(error);

      await expect(client.loginWithToken(FIXTURES.token, FIXTURES.nip)).rejects.toThrow('challenge failed');
      expect(cryptoInitSpy).not.toHaveBeenCalled();
    });

    it('propagates crypto.init error', async () => {
      const error = new Error('init failed');
      cryptoInitSpy.mockRejectedValue(error);

      await expect(client.loginWithToken(FIXTURES.token, FIXTURES.nip)).rejects.toThrow('init failed');
      expect(encryptSpy).not.toHaveBeenCalled();
    });

    it('propagates submitKsefTokenAuthRequest error', async () => {
      const error = new Error('submit failed');
      submitSpy.mockRejectedValue(error);

      await expect(client.loginWithToken(FIXTURES.token, FIXTURES.nip)).rejects.toThrow('submit failed');
      expect(getAccessTokenSpy).not.toHaveBeenCalled();
    });

    it('propagates getAccessToken error', async () => {
      const error = new Error('access token failed');
      getAccessTokenSpy.mockRejectedValue(error);

      await expect(client.loginWithToken(FIXTURES.token, FIXTURES.nip)).rejects.toThrow('access token failed');
      expect(authManager.setAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('loginWithCertificate', () => {
    let client: KSeFClient;
    let authManager: AuthManager;
    let getChallengeSpy: ReturnType<typeof vi.spyOn>;
    let submitXadesSpy: ReturnType<typeof vi.spyOn>;
    let getAccessTokenSpy: ReturnType<typeof vi.spyOn>;
    let getAuthStatusSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockSign.mockReset().mockReturnValue('<signed-xml/>');
      authManager = createMockAuthManager();
      client = new KSeFClient({ authManager });

      getChallengeSpy = vi.spyOn(client.auth, 'getChallenge')
        .mockResolvedValue(FIXTURES.challengeResponse);
      submitXadesSpy = vi.spyOn(client.auth, 'submitXadesAuthRequest')
        .mockResolvedValue(FIXTURES.authInitResponse);
      getAuthStatusSpy = vi.spyOn(client.auth, 'getAuthStatus')
        .mockResolvedValue({
          startDate: '2025-01-15T10:30:00.000Z',
          authenticationMethodInfo: { category: 'XadesSignature', code: 'XADES', displayName: 'XAdES' },
          authenticationMethod: 'XadesSignature',
          status: { code: 200, description: 'OK' },
        });
      getAccessTokenSpy = vi.spyOn(client.auth, 'getAccessToken')
        .mockResolvedValue(FIXTURES.tokensResponse);
    });

    it('happy path — stores tokens after successful login', async () => {
      await client.loginWithCertificate(FIXTURES.certPem, FIXTURES.keyPem, FIXTURES.nip);

      expect(getChallengeSpy).toHaveBeenCalledOnce();
      expect(mockSign).toHaveBeenCalledOnce();
      expect(submitXadesSpy).toHaveBeenCalledOnce();
      expect(getAccessTokenSpy).toHaveBeenCalledWith('auth-token-xyz789');
      expect(authManager.setAccessToken).toHaveBeenCalledWith('access-token-final-abc');
      expect(authManager.setRefreshToken).toHaveBeenCalledWith('refresh-token-final-def');
    });

    it('returns clientIp from challenge', async () => {
      const result = await client.loginWithCertificate(FIXTURES.certPem, FIXTURES.keyPem, FIXTURES.nip);
      expect(result).toEqual({ clientIp: '192.168.1.1' });
    });

    it('generates auth request XML containing challenge and NIP', async () => {
      let capturedXml = '';
      mockSign.mockImplementation((xml: string) => { capturedXml = xml; return '<signed/>'; });

      await client.loginWithCertificate(FIXTURES.certPem, FIXTURES.keyPem, FIXTURES.nip);

      expect(capturedXml).toContain('<AuthTokenRequest');
      expect(capturedXml).toContain('<Challenge>challenge-uuid-12345</Challenge>');
      expect(capturedXml).toContain(`<Nip>${FIXTURES.nip}</Nip>`);
      expect(capturedXml).toContain('certificateSubject');
    });

    it('calls SignatureService.sign with correct args', async () => {
      await client.loginWithCertificate(FIXTURES.certPem, FIXTURES.keyPem, FIXTURES.nip);

      expect(mockSign).toHaveBeenCalledWith(
        expect.any(String),
        FIXTURES.certPem,
        FIXTURES.keyPem,
        undefined,
      );
    });

    it('passes signed XML to submitXadesAuthRequest', async () => {
      mockSign.mockReturnValue('<custom-signed-xml/>');

      await client.loginWithCertificate(FIXTURES.certPem, FIXTURES.keyPem, FIXTURES.nip);

      expect(submitXadesSpy).toHaveBeenCalledWith('<custom-signed-xml/>');
    });

    it('does not call crypto.init', async () => {
      const cryptoInitSpy = vi.spyOn(client.crypto, 'init').mockResolvedValue(undefined);

      await client.loginWithCertificate(FIXTURES.certPem, FIXTURES.keyPem, FIXTURES.nip);

      expect(cryptoInitSpy).not.toHaveBeenCalled();
    });

    it('propagates getChallenge error', async () => {
      const error = new Error('challenge failed');
      getChallengeSpy.mockRejectedValue(error);

      await expect(client.loginWithCertificate(FIXTURES.certPem, FIXTURES.keyPem, FIXTURES.nip))
        .rejects.toThrow('challenge failed');
      expect(mockSign).not.toHaveBeenCalled();
    });

    it('propagates SignatureService.sign error', async () => {
      mockSign.mockImplementation(() => { throw new Error('sign failed'); });

      await expect(client.loginWithCertificate(FIXTURES.certPem, FIXTURES.keyPem, FIXTURES.nip))
        .rejects.toThrow('sign failed');
      expect(submitXadesSpy).not.toHaveBeenCalled();
    });

    it('propagates submitXadesAuthRequest error', async () => {
      const error = new Error('submit failed');
      submitXadesSpy.mockRejectedValue(error);

      await expect(client.loginWithCertificate(FIXTURES.certPem, FIXTURES.keyPem, FIXTURES.nip))
        .rejects.toThrow('submit failed');
      expect(getAccessTokenSpy).not.toHaveBeenCalled();
    });

    it('propagates getAccessToken error', async () => {
      const error = new Error('access token failed');
      getAccessTokenSpy.mockRejectedValue(error);

      await expect(client.loginWithCertificate(FIXTURES.certPem, FIXTURES.keyPem, FIXTURES.nip))
        .rejects.toThrow('access token failed');
      expect(authManager.setAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('loginWithPkcs12', () => {
    let client: KSeFClient;
    let authManager: AuthManager;
    let loginWithCertSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockSign.mockReset().mockReturnValue('<signed-xml/>');
      mockPkcs12Load.mockReset().mockReturnValue({
        certificatePem: FIXTURES.certPem,
        privateKeyPem: FIXTURES.keyPem,
      });
      authManager = createMockAuthManager();
      client = new KSeFClient({ authManager });

      vi.spyOn(client.auth, 'getChallenge')
        .mockResolvedValue(FIXTURES.challengeResponse);
      vi.spyOn(client.auth, 'submitXadesAuthRequest')
        .mockResolvedValue(FIXTURES.authInitResponse);
      vi.spyOn(client.auth, 'getAuthStatus')
        .mockResolvedValue({
          startDate: '2025-01-15T10:30:00.000Z',
          authenticationMethodInfo: { category: 'XadesSignature', code: 'XADES', displayName: 'XAdES' },
          authenticationMethod: 'XadesSignature',
          status: { code: 200, description: 'OK' },
        });
      vi.spyOn(client.auth, 'getAccessToken')
        .mockResolvedValue(FIXTURES.tokensResponse);

      loginWithCertSpy = vi.spyOn(client, 'loginWithCertificate');
    });

    it('calls Pkcs12Loader.load with buffer and password', async () => {
      const p12 = Buffer.from('mock-p12');
      await client.loginWithPkcs12(p12, 'my-password', FIXTURES.nip);

      expect(mockPkcs12Load).toHaveBeenCalledWith(p12, 'my-password');
    });

    it('delegates to loginWithCertificate with extracted PEM', async () => {
      await client.loginWithPkcs12(Buffer.from('mock-p12'), 'pass', FIXTURES.nip);

      expect(loginWithCertSpy).toHaveBeenCalledWith(FIXTURES.certPem, FIXTURES.keyPem, FIXTURES.nip);
    });

    it('stores tokens after successful login', async () => {
      await client.loginWithPkcs12(Buffer.from('mock-p12'), 'pass', FIXTURES.nip);

      expect(authManager.setAccessToken).toHaveBeenCalledWith('access-token-final-abc');
      expect(authManager.setRefreshToken).toHaveBeenCalledWith('refresh-token-final-def');
    });

    it('returns clientIp from challenge', async () => {
      const result = await client.loginWithPkcs12(Buffer.from('mock-p12'), 'pass', FIXTURES.nip);
      expect(result).toEqual({ clientIp: '192.168.1.1' });
    });

    it('propagates Pkcs12Loader error', async () => {
      mockPkcs12Load.mockImplementation(() => { throw new Error('Invalid PKCS#12'); });

      await expect(client.loginWithPkcs12(Buffer.from('bad'), 'pass', FIXTURES.nip))
        .rejects.toThrow('Invalid PKCS#12');
      expect(loginWithCertSpy).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('clears access token', async () => {
      const authManager = createMockAuthManager();
      const client = new KSeFClient({ authManager });

      await client.logout();

      expect(authManager.setAccessToken).toHaveBeenCalledWith(undefined);
    });

    it('clears refresh token', async () => {
      const authManager = createMockAuthManager();
      const client = new KSeFClient({ authManager });

      await client.logout();

      expect(authManager.setRefreshToken).toHaveBeenCalledWith(undefined);
    });

    it('clears both tokens after login', async () => {
      const authManager = createMockAuthManager();
      const client = new KSeFClient({ authManager });

      vi.spyOn(client.auth, 'getChallenge').mockResolvedValue(FIXTURES.challengeResponse);
      vi.spyOn(client.auth, 'submitKsefTokenAuthRequest').mockResolvedValue(FIXTURES.authInitResponse);
      vi.spyOn(client.auth, 'getAuthStatus').mockResolvedValue({
        startDate: '2025-01-15T10:30:00.000Z',
        authenticationMethodInfo: { category: 'Token', code: 'TOKEN', displayName: 'Token' },
        authenticationMethod: 'Token',
        status: { code: 200, description: 'OK' },
      });
      vi.spyOn(client.auth, 'getAccessToken').mockResolvedValue(FIXTURES.tokensResponse);
      vi.spyOn(client.crypto, 'init').mockResolvedValue(undefined);
      vi.spyOn(client.crypto, 'encryptKsefToken').mockReturnValue(new Uint8Array([1, 2, 3]));
      vi.spyOn(client.crypto, 'getKsefTokenPublicKeyId').mockReturnValue('ksef-token-public-key-id');

      await client.loginWithToken(FIXTURES.token, FIXTURES.nip);
      expect(authManager.setAccessToken).toHaveBeenCalledWith('access-token-final-abc');
      expect(authManager.setRefreshToken).toHaveBeenCalledWith('refresh-token-final-def');

      await client.logout();
      expect(authManager.setAccessToken).toHaveBeenLastCalledWith(undefined);
      expect(authManager.setRefreshToken).toHaveBeenLastCalledWith(undefined);
    });
  });
});
