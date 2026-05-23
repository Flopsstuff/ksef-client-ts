import { CertificateFetcher } from '../../../src/crypto/certificate-fetcher.js';
import { Routes } from '../../../src/http/routes.js';
import {
  createMockRestClient,
  getRequest,
  mockResponse,
  getRsaPair,
  makeCertFixture,
} from './_helpers.js';

let CERT_DER_BASE64: string;
let CERT_DER_BASE64_ALT: string;

beforeAll(async () => {
  const pair = await getRsaPair();
  CERT_DER_BASE64 = pair.certDerBase64;
  // Second distinct base64 for sorting tests
  CERT_DER_BASE64_ALT = CERT_DER_BASE64.slice(0, -4) + 'AAAA';
});

function makeBothCerts(overrides?: {
  symmetricDer?: string;
  tokenDer?: string;
  tokenValidFrom?: string;
}) {
  return [
    makeCertFixture(
      ['SymmetricKeyEncryption'],
      overrides?.symmetricDer ?? CERT_DER_BASE64,
    ),
    makeCertFixture(
      ['KsefTokenEncryption'],
      overrides?.tokenDer ?? CERT_DER_BASE64,
      overrides?.tokenValidFrom ?? '2025-01-01T00:00:00Z',
    ),
  ];
}

describe('CertificateFetcher', () => {
  // -------------------------------------------------------------------
  // init()
  // -------------------------------------------------------------------
  describe('init()', () => {
    it('fetches certificates on first call', async () => {
      const restClient = createMockRestClient();
      vi.mocked(restClient.execute).mockResolvedValue(
        mockResponse(makeBothCerts()),
      );
      const fetcher = new CertificateFetcher(restClient);

      await fetcher.init();

      expect(restClient.execute).toHaveBeenCalledTimes(1);
      expect(fetcher.getSymmetricKeyEncryptionPem()).toContain(
        '-----BEGIN CERTIFICATE-----',
      );
    });

    it('is idempotent — second call does not re-fetch', async () => {
      const restClient = createMockRestClient();
      vi.mocked(restClient.execute).mockResolvedValue(
        mockResponse(makeBothCerts()),
      );
      const fetcher = new CertificateFetcher(restClient);

      await fetcher.init();
      await fetcher.init();

      expect(restClient.execute).toHaveBeenCalledTimes(1);
    });

    it('throws when API returns null body', async () => {
      const restClient = createMockRestClient();
      vi.mocked(restClient.execute).mockResolvedValue(mockResponse(null));
      const fetcher = new CertificateFetcher(restClient);

      await expect(fetcher.init()).rejects.toThrow(
        'No public key certificates returned from KSeF API.',
      );
    });

    it('throws when API returns empty array', async () => {
      const restClient = createMockRestClient();
      vi.mocked(restClient.execute).mockResolvedValue(mockResponse([]));
      const fetcher = new CertificateFetcher(restClient);

      await expect(fetcher.init()).rejects.toThrow(
        'No public key certificates returned from KSeF API.',
      );
    });

    it('throws when no SymmetricKeyEncryption cert found', async () => {
      const restClient = createMockRestClient();
      vi.mocked(restClient.execute).mockResolvedValue(
        mockResponse([
          makeCertFixture(['KsefTokenEncryption'], CERT_DER_BASE64),
        ]),
      );
      const fetcher = new CertificateFetcher(restClient);

      await expect(fetcher.init()).rejects.toThrow(
        'No SymmetricKeyEncryption certificate found.',
      );
    });

    it('throws when no KsefTokenEncryption cert found', async () => {
      const restClient = createMockRestClient();
      vi.mocked(restClient.execute).mockResolvedValue(
        mockResponse([
          makeCertFixture(['SymmetricKeyEncryption'], CERT_DER_BASE64),
        ]),
      );
      const fetcher = new CertificateFetcher(restClient);

      await expect(fetcher.init()).rejects.toThrow(
        'No KsefTokenEncryption certificate found.',
      );
    });

    const pemBodyOf = (pem: string): string =>
      pem
        .replace(/-----BEGIN CERTIFICATE-----/, '')
        .replace(/-----END CERTIFICATE-----/, '')
        .replace(/\s+/g, '');

    it('selects the newest currently-valid KsefTokenEncryption cert by validFrom', async () => {
      const olderDer = CERT_DER_BASE64;
      const newerDer = CERT_DER_BASE64_ALT;
      const restClient = createMockRestClient();
      vi.mocked(restClient.execute).mockResolvedValue(
        mockResponse([
          makeCertFixture(['SymmetricKeyEncryption'], CERT_DER_BASE64),
          makeCertFixture(['KsefTokenEncryption'], olderDer, '2025-01-01T00:00:00Z'),
          makeCertFixture(['KsefTokenEncryption'], newerDer, '2025-06-01T00:00:00Z'),
        ]),
      );
      const fetcher = new CertificateFetcher(restClient);

      await fetcher.init();

      // Both windows are open → the newer validFrom wins (rotation-safe selection).
      expect(pemBodyOf(fetcher.getKsefTokenEncryptionPem())).toBe(newerDer);
    });

    it('ignores expired and not-yet-valid certs when a valid one exists', async () => {
      const expiredDer = CERT_DER_BASE64;
      const futureDer = CERT_DER_BASE64_ALT;
      const validDer = CERT_DER_BASE64.slice(0, -4) + 'BBBB';
      const restClient = createMockRestClient();
      vi.mocked(restClient.execute).mockResolvedValue(
        mockResponse([
          makeCertFixture(['SymmetricKeyEncryption'], CERT_DER_BASE64),
          // expired window
          makeCertFixture(['KsefTokenEncryption'], expiredDer, '2020-01-01T00:00:00Z', '2021-01-01T00:00:00Z'),
          // not yet valid
          makeCertFixture(['KsefTokenEncryption'], futureDer, '2099-01-01T00:00:00Z', '2099-12-31T00:00:00Z'),
          // currently valid (newest validFrom among valid)
          makeCertFixture(['KsefTokenEncryption'], validDer, '2025-01-01T00:00:00Z', '2099-01-01T00:00:00Z'),
        ]),
      );
      const fetcher = new CertificateFetcher(restClient);

      await fetcher.init();

      expect(pemBodyOf(fetcher.getKsefTokenEncryptionPem())).toBe(validDer);
    });

    it('falls back to the newest cert by validFrom when none are currently valid', async () => {
      const olderExpiredDer = CERT_DER_BASE64;
      const newerExpiredDer = CERT_DER_BASE64_ALT;
      const restClient = createMockRestClient();
      vi.mocked(restClient.execute).mockResolvedValue(
        mockResponse([
          makeCertFixture(['SymmetricKeyEncryption'], CERT_DER_BASE64),
          makeCertFixture(['KsefTokenEncryption'], olderExpiredDer, '2020-01-01T00:00:00Z', '2021-01-01T00:00:00Z'),
          makeCertFixture(['KsefTokenEncryption'], newerExpiredDer, '2022-01-01T00:00:00Z', '2023-01-01T00:00:00Z'),
        ]),
      );
      const fetcher = new CertificateFetcher(restClient);

      await fetcher.init();

      // No window is open now → newest validFrom (2022) is chosen so the server can reject it clearly.
      expect(pemBodyOf(fetcher.getKsefTokenEncryptionPem())).toBe(newerExpiredDer);
    });

    it('exposes the selected certs publicKeyId per usage', async () => {
      const restClient = createMockRestClient();
      const certs = makeBothCerts();
      vi.mocked(restClient.execute).mockResolvedValue(mockResponse(certs));
      const fetcher = new CertificateFetcher(restClient);

      await fetcher.init();

      const symmetric = certs.find(c => c.usage.includes('SymmetricKeyEncryption'))!;
      const token = certs.find(c => c.usage.includes('KsefTokenEncryption'))!;
      expect(fetcher.getSymmetricKeyPublicKeyId()).toBe(symmetric.publicKeyId);
      expect(fetcher.getKsefTokenPublicKeyId()).toBe(token.publicKeyId);
    });

    it('sends GET to Routes.Security.publicKeyCertificates', async () => {
      const restClient = createMockRestClient();
      vi.mocked(restClient.execute).mockResolvedValue(
        mockResponse(makeBothCerts()),
      );
      const fetcher = new CertificateFetcher(restClient);

      await fetcher.init();

      const req = getRequest(vi.mocked(restClient.execute));
      expect(req.method).toBe('GET');
      expect(req.path).toBe(Routes.Security.publicKeyCertificates);
    });
  });

  // -------------------------------------------------------------------
  // refresh()
  // -------------------------------------------------------------------
  describe('refresh()', () => {
    it('clears cache and re-fetches certificates', async () => {
      const restClient = createMockRestClient();
      const firstCerts = makeBothCerts();
      const secondCerts = makeBothCerts({ symmetricDer: CERT_DER_BASE64_ALT });

      vi.mocked(restClient.execute)
        .mockResolvedValueOnce(mockResponse(firstCerts))
        .mockResolvedValueOnce(mockResponse(secondCerts));

      const fetcher = new CertificateFetcher(restClient);
      await fetcher.init();
      const firstPem = fetcher.getSymmetricKeyEncryptionPem();

      await fetcher.refresh();
      const secondPem = fetcher.getSymmetricKeyEncryptionPem();

      expect(restClient.execute).toHaveBeenCalledTimes(2);
      expect(firstPem).not.toBe(secondPem);
    });

    it('works after init()', async () => {
      const restClient = createMockRestClient();
      vi.mocked(restClient.execute).mockResolvedValue(
        mockResponse(makeBothCerts()),
      );
      const fetcher = new CertificateFetcher(restClient);

      await fetcher.init();
      await expect(fetcher.refresh()).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------
  // getSymmetricKeyEncryptionPem()
  // -------------------------------------------------------------------
  describe('getSymmetricKeyEncryptionPem()', () => {
    it('throws if not initialized', () => {
      const restClient = createMockRestClient();
      const fetcher = new CertificateFetcher(restClient);

      expect(() => fetcher.getSymmetricKeyEncryptionPem()).toThrow(
        'CertificateFetcher not initialized. Call init() first.',
      );
    });

    it('returns valid PEM after init()', async () => {
      const restClient = createMockRestClient();
      vi.mocked(restClient.execute).mockResolvedValue(
        mockResponse(makeBothCerts()),
      );
      const fetcher = new CertificateFetcher(restClient);
      await fetcher.init();

      const pem = fetcher.getSymmetricKeyEncryptionPem();
      expect(pem).toMatch(/^-----BEGIN CERTIFICATE-----/);
      expect(pem).toMatch(/-----END CERTIFICATE-----$/);
    });
  });

  // -------------------------------------------------------------------
  // getKsefTokenEncryptionPem()
  // -------------------------------------------------------------------
  describe('getKsefTokenEncryptionPem()', () => {
    it('throws if not initialized', () => {
      const restClient = createMockRestClient();
      const fetcher = new CertificateFetcher(restClient);

      expect(() => fetcher.getKsefTokenEncryptionPem()).toThrow(
        'CertificateFetcher not initialized. Call init() first.',
      );
    });

    it('returns valid PEM after init()', async () => {
      const restClient = createMockRestClient();
      vi.mocked(restClient.execute).mockResolvedValue(
        mockResponse(makeBothCerts()),
      );
      const fetcher = new CertificateFetcher(restClient);
      await fetcher.init();

      const pem = fetcher.getKsefTokenEncryptionPem();
      expect(pem).toMatch(/^-----BEGIN CERTIFICATE-----/);
      expect(pem).toMatch(/-----END CERTIFICATE-----$/);
    });
  });
});
