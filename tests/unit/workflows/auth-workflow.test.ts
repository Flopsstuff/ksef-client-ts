import { describe, it, expect, vi, beforeEach } from 'vitest';
import forge from 'node-forge';
import { authenticateWithToken, authenticateWithCertificate, authenticateWithExternalSignature, authenticateWithPkcs12 } from '../../../src/workflows/auth-workflow.js';
import { KSeFAuthStatusError } from '../../../src/errors/ksef-auth-status-error.js';

function createRsaP12(password: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs = [
    { name: 'commonName', value: 'Test P12 RSA' },
    { name: 'countryName', value: 'PL' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, password, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}

function createMockClient() {
  return {
    crypto: {
      init: vi.fn(),
      refresh: vi.fn(),
      encryptKsefTokenWithKeyId: vi.fn().mockReturnValue({ encryptedToken: new Uint8Array([1, 2, 3]), publicKeyId: 'ksef-token-public-key-id' }),
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
    expect(client.crypto.encryptKsefTokenWithKeyId).toHaveBeenCalledWith('my-ksef-token', '2026-01-01T00:00:00.000Z');
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

  it('throws KSeFAuthStatusError on a terminal failure status, surfacing details', async () => {
    client.auth.getAuthStatus.mockResolvedValue({
      status: {
        code: 450,
        description: 'Uwierzytelnianie zakończone niepowodzeniem z powodu błędnego tokenu',
        details: ['Token nieaktywny', 'Nieprawidłowe szyfrowanie tokena'],
      },
    });

    await expect(
      authenticateWithToken(client, { nip: '1234567890', token: 'tok', pollOptions: { intervalMs: 1 } }),
    ).rejects.toThrow(KSeFAuthStatusError);

    await expect(
      authenticateWithToken(client, { nip: '1234567890', token: 'tok', pollOptions: { intervalMs: 1 } }),
    ).rejects.toThrow(/450.*Token nieaktywny; Nieprawidłowe szyfrowanie tokena/s);

    // Must not attempt to exchange the auth token after a failure.
    expect(client.auth.getAccessToken).not.toHaveBeenCalled();
  });

  it('throws without a details suffix when the failure status carries no details', async () => {
    client.auth.getAuthStatus.mockResolvedValue({
      status: { code: 450, description: 'Uwierzytelnianie nieudane' },
    });

    await expect(
      authenticateWithToken(client, { nip: '1234567890', token: 'tok', pollOptions: { intervalMs: 1 } }),
    ).rejects.toThrow(/status 450: Uwierzytelnianie nieudane$/);
    expect(client.auth.getAccessToken).not.toHaveBeenCalled();
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

describe('authenticateWithPkcs12', () => {
  let p12: Buffer;

  beforeEach(() => {
    p12 = createRsaP12('p12-pass');
  });

  it('loads cert/key from the P12 and delegates to the certificate flow', async () => {
    vi.doMock('../../../src/client.js', () => ({
      buildAuthTokenRequestXml: vi.fn().mockReturnValue('<AuthTokenRequest/>'),
    }));
    const signSpy = vi.fn().mockReturnValue('<SignedXml/>');
    vi.doMock('../../../src/crypto/signature-service.js', () => ({
      SignatureService: { sign: signSpy },
    }));

    // Re-import so the dynamic imports inside the cert flow pick up the mocks.
    const { authenticateWithPkcs12: authP12 } = await import('../../../src/workflows/auth-workflow.js');

    const result = await authP12(client, {
      nip: '1234567890',
      p12,
      password: 'p12-pass',
      pollOptions: { intervalMs: 1 },
    });

    // The real cert + key extracted from the P12 must reach the signer.
    expect(signSpy).toHaveBeenCalledOnce();
    const [, certPem, keyPem] = signSpy.mock.calls[0];
    expect(certPem).toContain('-----BEGIN CERTIFICATE-----');
    expect(keyPem).toContain('PRIVATE KEY-----');
    expect(client.auth.submitXadesAuthRequest).toHaveBeenCalledWith('<SignedXml/>', false, false);
    expect(result.accessToken).toBe('access-tok');
    expect(result.refreshToken).toBe('refresh-tok');

    vi.doUnmock('../../../src/client.js');
    vi.doUnmock('../../../src/crypto/signature-service.js');
  });

  it('forwards verifyCertificateChain and enforceXadesCompliance', async () => {
    vi.doMock('../../../src/client.js', () => ({
      buildAuthTokenRequestXml: vi.fn().mockReturnValue('<AuthTokenRequest/>'),
    }));
    vi.doMock('../../../src/crypto/signature-service.js', () => ({
      SignatureService: { sign: vi.fn().mockReturnValue('<SignedXml/>') },
    }));

    const { authenticateWithPkcs12: authP12 } = await import('../../../src/workflows/auth-workflow.js');

    await authP12(client, {
      nip: '1234567890',
      p12,
      password: 'p12-pass',
      verifyCertificateChain: true,
      enforceXadesCompliance: true,
      pollOptions: { intervalMs: 1 },
    });

    expect(client.auth.submitXadesAuthRequest).toHaveBeenCalledWith('<SignedXml/>', true, true);

    vi.doUnmock('../../../src/client.js');
    vi.doUnmock('../../../src/crypto/signature-service.js');
  });

  it('propagates a load failure for an invalid P12', async () => {
    await expect(
      authenticateWithPkcs12(client, {
        nip: '1234567890',
        p12: Buffer.from('not-a-p12'),
        password: 'whatever',
        pollOptions: { intervalMs: 1 },
      }),
    ).rejects.toThrow();
    expect(client.auth.submitXadesAuthRequest).not.toHaveBeenCalled();
  });
});

describe('authenticateWithExternalSignature', () => {
  it('performs full external signing flow: challenge → build XML → signXml → submit → poll → redeem', async () => {
    const signXml = vi.fn().mockReturnValue('<SignedXml/>');

    const result = await authenticateWithExternalSignature(client, {
      contextIdentifier: { type: 'Nip', value: '1234567890' },
      signXml,
      pollOptions: { intervalMs: 1 },
    });

    expect(client.auth.getChallenge).toHaveBeenCalledOnce();
    expect(signXml).toHaveBeenCalledOnce();
    // Verify the unsigned XML was passed to signXml
    const unsignedXml = signXml.mock.calls[0][0] as string;
    expect(unsignedXml).toContain('<AuthTokenRequest');
    expect(unsignedXml).toContain('<Nip>1234567890</Nip>');
    expect(unsignedXml).toContain('<Challenge>ch-123</Challenge>');

    expect(client.auth.submitXadesAuthRequest).toHaveBeenCalledWith('<SignedXml/>', false, false);
    expect(client.auth.getAuthStatus).toHaveBeenCalledWith('auth-ref-2', 'auth-token-xades');
    expect(client.auth.getAccessToken).toHaveBeenCalledWith('auth-token-xades');
    expect(client.authManager.setAccessToken).toHaveBeenCalledWith('access-tok');
    expect(client.authManager.setRefreshToken).toHaveBeenCalledWith('refresh-tok');
    expect(result.accessToken).toBe('access-tok');
    expect(result.refreshToken).toBe('refresh-tok');
  });

  it('supports async signXml callback', async () => {
    const signXml = vi.fn().mockResolvedValue('<AsyncSignedXml/>');

    const result = await authenticateWithExternalSignature(client, {
      contextIdentifier: { type: 'Nip', value: '1234567890' },
      signXml,
      pollOptions: { intervalMs: 1 },
    });

    expect(client.auth.submitXadesAuthRequest).toHaveBeenCalledWith('<AsyncSignedXml/>', false, false);
    expect(result.accessToken).toBe('access-tok');
  });

  it('propagates signXml callback error without submitting', async () => {
    const signXml = vi.fn().mockRejectedValue(new Error('HSM unavailable'));

    await expect(
      authenticateWithExternalSignature(client, {
        contextIdentifier: { type: 'Nip', value: '1234567890' },
        signXml,
        pollOptions: { intervalMs: 1 },
      }),
    ).rejects.toThrow('HSM unavailable');

    expect(client.auth.submitXadesAuthRequest).not.toHaveBeenCalled();
  });

  it('propagates synchronous signXml callback error', async () => {
    const signXml = vi.fn().mockImplementation(() => { throw new Error('Smart card removed'); });

    await expect(
      authenticateWithExternalSignature(client, {
        contextIdentifier: { type: 'Nip', value: '1234567890' },
        signXml,
        pollOptions: { intervalMs: 1 },
      }),
    ).rejects.toThrow('Smart card removed');

    expect(client.auth.submitXadesAuthRequest).not.toHaveBeenCalled();
  });

  it('forwards verifyCertificateChain and enforceXadesCompliance options', async () => {
    const signXml = vi.fn().mockReturnValue('<Signed/>');

    await authenticateWithExternalSignature(client, {
      contextIdentifier: { type: 'Nip', value: '1234567890' },
      signXml,
      verifyCertificateChain: true,
      enforceXadesCompliance: true,
      pollOptions: { intervalMs: 1 },
    });

    expect(client.auth.submitXadesAuthRequest).toHaveBeenCalledWith('<Signed/>', true, true);
  });

  it('uses the provided contextIdentifier type in the unsigned XML', async () => {
    const signXml = vi.fn().mockReturnValue('<Signed/>');

    await authenticateWithExternalSignature(client, {
      contextIdentifier: { type: 'PeppolId', value: '0088:123' },
      signXml,
      pollOptions: { intervalMs: 1 },
    });

    const unsignedXml = signXml.mock.calls[0][0] as string;
    expect(unsignedXml).toContain('<PeppolId>0088:123</PeppolId>');
  });
});
