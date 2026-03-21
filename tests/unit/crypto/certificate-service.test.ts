import * as crypto from 'node:crypto';
import { CertificateService } from '../../../src/crypto/certificate-service.js';
import type { SelfSignedCertificateResult } from '../../../src/models/crypto/types.js';

describe('CertificateService', () => {
  // -------------------------------------------------------------------
  // getSha256Fingerprint()
  // -------------------------------------------------------------------
  describe('getSha256Fingerprint()', () => {
    let rsaResult: SelfSignedCertificateResult;

    beforeAll(async () => {
      rsaResult = await CertificateService.generatePersonalCertificate(
        'Jan', 'Kowalski', '12345678901', 'Test CN',
      );
    });

    it('returns 64-char uppercase hex string', () => {
      const fp = CertificateService.getSha256Fingerprint(rsaResult.certificatePem);
      expect(fp).toMatch(/^[0-9A-F]{64}$/);
    });

    it('returns consistent fingerprint for same certificate', () => {
      const fp1 = CertificateService.getSha256Fingerprint(rsaResult.certificatePem);
      const fp2 = CertificateService.getSha256Fingerprint(rsaResult.certificatePem);
      expect(fp1).toBe(fp2);
    });

    it('returns different fingerprints for different certificates', async () => {
      const other = await CertificateService.generatePersonalCertificate(
        'Anna', 'Nowak', '98765432109', 'Other CN',
      );
      const fp1 = CertificateService.getSha256Fingerprint(rsaResult.certificatePem);
      const fp2 = CertificateService.getSha256Fingerprint(other.certificatePem);
      expect(fp1).not.toBe(fp2);
    });

    it('matches the fingerprint from generatePersonalCertificate', () => {
      const fp = CertificateService.getSha256Fingerprint(rsaResult.certificatePem);
      expect(fp).toBe(rsaResult.fingerprint);
    });
  });

  // -------------------------------------------------------------------
  // generatePersonalCertificate()
  // -------------------------------------------------------------------
  describe('generatePersonalCertificate()', () => {
    let rsaResult: SelfSignedCertificateResult;

    beforeAll(async () => {
      rsaResult = await CertificateService.generatePersonalCertificate(
        'Jan', 'Kowalski', '12345678901', 'Test Personal',
      );
    });

    it('generates valid RSA cert+key (default)', () => {
      expect(rsaResult.certificatePem).toMatch(/^-----BEGIN CERTIFICATE-----/);
      expect(rsaResult.privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
      expect(rsaResult.fingerprint).toMatch(/^[0-9A-F]{64}$/);
    });

    it('RSA cert has correct key type', () => {
      const x509 = new crypto.X509Certificate(rsaResult.certificatePem);
      expect(x509.publicKey.asymmetricKeyType).toBe('rsa');
    });

    it('subject contains givenName, surname, serialNumber, CN, C=PL', () => {
      const x509 = new crypto.X509Certificate(rsaResult.certificatePem);
      const subject = x509.subject;
      expect(subject).toContain('CN=Test Personal');
      expect(subject).toContain('C=PL');
      // OID-based fields appear in the subject string
      expect(subject).toContain('Jan');
      expect(subject).toContain('Kowalski');
      expect(subject).toContain('12345678901');
    });

    it('generates ECDSA cert when method=ECDSA', async () => {
      const result = await CertificateService.generatePersonalCertificate(
        'Jan', 'Kowalski', '12345678901', 'EC Personal', 'ECDSA',
      );
      const x509 = new crypto.X509Certificate(result.certificatePem);
      expect(x509.publicKey.asymmetricKeyType).toBe('ec');
    });

    it('private key matches cert public key (sign+verify)', () => {
      const data = Buffer.from('test payload');
      const signature = crypto.sign('sha256', data, rsaResult.privateKeyPem);
      const x509 = new crypto.X509Certificate(rsaResult.certificatePem);
      const valid = crypto.verify('sha256', data, x509.publicKey, signature);
      expect(valid).toBe(true);
    });

    it('notBefore is approximately now - 61 minutes', () => {
      const x509 = new crypto.X509Certificate(rsaResult.certificatePem);
      const notBefore = new Date(x509.validFrom).getTime();
      const expected = Date.now() - 61 * 60_000;
      // Allow 5-minute tolerance for test run time
      expect(Math.abs(notBefore - expected)).toBeLessThan(5 * 60_000);
    });

    it('notAfter is approximately now + 365 days', () => {
      const x509 = new crypto.X509Certificate(rsaResult.certificatePem);
      const notAfter = new Date(x509.validTo).getTime();
      const expected = Date.now() + 365 * 24 * 60 * 60_000;
      expect(Math.abs(notAfter - expected)).toBeLessThan(5 * 60_000);
    });
  });

  // -------------------------------------------------------------------
  // generateCompanySeal()
  // -------------------------------------------------------------------
  describe('generateCompanySeal()', () => {
    let rsaResult: SelfSignedCertificateResult;

    beforeAll(async () => {
      rsaResult = await CertificateService.generateCompanySeal(
        'Acme Corp', 'VATPL-1234567890', 'Test Seal',
      );
    });

    it('generates valid RSA cert+key (default)', () => {
      expect(rsaResult.certificatePem).toMatch(/^-----BEGIN CERTIFICATE-----/);
      expect(rsaResult.privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
      expect(rsaResult.fingerprint).toMatch(/^[0-9A-F]{64}$/);
    });

    it('subject contains O, orgIdentifier OID, CN, C=PL', () => {
      const x509 = new crypto.X509Certificate(rsaResult.certificatePem);
      const subject = x509.subject;
      expect(subject).toContain('CN=Test Seal');
      expect(subject).toContain('C=PL');
      expect(subject).toContain('O=Acme Corp');
      expect(subject).toContain('VATPL-1234567890');
    });

    it('generates ECDSA cert when method=ECDSA', async () => {
      const result = await CertificateService.generateCompanySeal(
        'Acme Corp', 'VATPL-1234567890', 'EC Seal', 'ECDSA',
      );
      const x509 = new crypto.X509Certificate(result.certificatePem);
      expect(x509.publicKey.asymmetricKeyType).toBe('ec');
    });

    it('private key matches cert public key (sign+verify)', () => {
      const data = Buffer.from('test payload');
      const signature = crypto.sign('sha256', data, rsaResult.privateKeyPem);
      const x509 = new crypto.X509Certificate(rsaResult.certificatePem);
      const valid = crypto.verify('sha256', data, x509.publicKey, signature);
      expect(valid).toBe(true);
    });

    it('defaults to RSA when method omitted', () => {
      const x509 = new crypto.X509Certificate(rsaResult.certificatePem);
      expect(x509.publicKey.asymmetricKeyType).toBe('rsa');
    });
  });
});
