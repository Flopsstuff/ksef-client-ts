import forge from 'node-forge';
import crypto from 'node:crypto';
import { Pkcs12Loader } from '../../../src/crypto/pkcs12-loader.js';

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
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(p12Der, 'binary');
}

let cachedP12: Buffer;
let cachedPassword: string;

beforeAll(() => {
  cachedPassword = 'test-password-123';
  cachedP12 = createRsaP12(cachedPassword);
});

describe('Pkcs12Loader', () => {
  describe('load() with RSA key', () => {
    it('returns certificatePem with correct headers', () => {
      const result = Pkcs12Loader.load(cachedP12, cachedPassword);
      expect(result.certificatePem).toContain('-----BEGIN CERTIFICATE-----');
      expect(result.certificatePem).toContain('-----END CERTIFICATE-----');
    });

    it('returns privateKeyPem with RSA key headers', () => {
      const result = Pkcs12Loader.load(cachedP12, cachedPassword);
      expect(result.privateKeyPem).toContain('-----BEGIN RSA PRIVATE KEY-----');
      expect(result.privateKeyPem).toContain('-----END RSA PRIVATE KEY-----');
    });

    it('cert PEM is parseable by node:crypto', () => {
      const result = Pkcs12Loader.load(cachedP12, cachedPassword);
      const x509 = new crypto.X509Certificate(result.certificatePem);
      expect(x509.subject).toContain('CN=Test P12 RSA');
    });

    it('key PEM is parseable by node:crypto', () => {
      const result = Pkcs12Loader.load(cachedP12, cachedPassword);
      const key = crypto.createPrivateKey(result.privateKeyPem);
      expect(key.asymmetricKeyType).toBe('rsa');
    });

    it('accepts Uint8Array input', () => {
      const uint8 = new Uint8Array(cachedP12);
      const result = Pkcs12Loader.load(uint8, cachedPassword);
      expect(result.certificatePem).toContain('-----BEGIN CERTIFICATE-----');
      expect(result.privateKeyPem).toContain('-----BEGIN RSA PRIVATE KEY-----');
    });
  });

  describe('load() with empty password', () => {
    it('works with passwordless P12', () => {
      const p12 = createRsaP12('');
      const result = Pkcs12Loader.load(p12, '');
      expect(result.certificatePem).toContain('-----BEGIN CERTIFICATE-----');
      expect(result.privateKeyPem).toContain('-----BEGIN RSA PRIVATE KEY-----');
    });
  });

  describe('error cases', () => {
    it('throws on invalid P12 data', () => {
      expect(() => Pkcs12Loader.load(Buffer.from('garbage'), 'pass')).toThrow();
    });

    it('throws on wrong password', () => {
      expect(() => Pkcs12Loader.load(cachedP12, 'wrong-password')).toThrow();
    });
  });
});
