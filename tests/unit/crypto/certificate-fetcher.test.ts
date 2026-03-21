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

    it('selects earliest KsefTokenEncryption cert by validFrom', async () => {
      const earlyDer = CERT_DER_BASE64;
      const lateDer = CERT_DER_BASE64_ALT;
      const restClient = createMockRestClient();
      vi.mocked(restClient.execute).mockResolvedValue(
        mockResponse([
          makeCertFixture(['SymmetricKeyEncryption'], CERT_DER_BASE64),
          makeCertFixture(['KsefTokenEncryption'], lateDer, '2025-06-01T00:00:00Z'),
          makeCertFixture(['KsefTokenEncryption'], earlyDer, '2025-01-01T00:00:00Z'),
        ]),
      );
      const fetcher = new CertificateFetcher(restClient);

      await fetcher.init();

      const pem = fetcher.getKsefTokenEncryptionPem();
      // PEM should contain the base64 lines from earlyDer, not lateDer
      const pemBody = pem
        .replace(/-----BEGIN CERTIFICATE-----/, '')
        .replace(/-----END CERTIFICATE-----/, '')
        .replace(/\s+/g, '');
      expect(pemBody).toBe(earlyDer);
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
