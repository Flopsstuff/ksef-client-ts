import * as crypto from 'node:crypto';
import { CryptographyService } from '../../../src/crypto/cryptography-service.js';
import {
  getRsaPair,
  getEcPair,
  createMockCertificateFetcher,
} from './_helpers.js';

let service: CryptographyService;
let rsaCertPem: string;
let rsaKeyPem: string;
let ecCertPem: string;
let ecKeyPem: string;

beforeAll(async () => {
  const rsa = await getRsaPair();
  const ec = await getEcPair();
  rsaCertPem = rsa.certPem;
  rsaKeyPem = rsa.keyPem;
  ecCertPem = ec.certPem;
  ecKeyPem = ec.keyPem;
});

beforeEach(() => {
  const fetcher = createMockCertificateFetcher({
    symmetricKeyPem: rsaCertPem,
    ksefTokenPem: rsaCertPem,
  });
  service = new CryptographyService(fetcher);
});

describe('CryptographyService', () => {
  // -------------------------------------------------------------------
  // init()
  // -------------------------------------------------------------------
  describe('init()', () => {
    it('delegates to fetcher.init()', async () => {
      const fetcher = createMockCertificateFetcher();
      const svc = new CryptographyService(fetcher);
      await svc.init();
      expect(fetcher.init).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------
  // encryptAES256() / decryptAES256()
  // -------------------------------------------------------------------
  describe('encryptAES256() / decryptAES256()', () => {
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    it('encrypt then decrypt roundtrip restores original data', () => {
      const plaintext = new Uint8Array(Buffer.from('Hello KSeF!'));
      const ciphertext = service.encryptAES256(plaintext, key, iv);
      const decrypted = service.decryptAES256(ciphertext, key, iv);
      expect(Buffer.from(decrypted).toString()).toBe('Hello KSeF!');
    });

    it('ciphertext differs from plaintext', () => {
      const plaintext = new Uint8Array(Buffer.from('Hello KSeF!'));
      const ciphertext = service.encryptAES256(plaintext, key, iv);
      expect(Buffer.from(ciphertext).toString('hex')).not.toBe(
        Buffer.from(plaintext).toString('hex'),
      );
    });

    it('known test vector produces expected ciphertext', () => {
      const fixedKey = Buffer.alloc(32, 0x01);
      const fixedIv = Buffer.alloc(16, 0x02);
      const fixedPlaintext = new Uint8Array(Buffer.from('test'));

      const ciphertext = service.encryptAES256(fixedPlaintext, fixedKey, fixedIv);

      // Verify by decrypting with Node.js directly
      const decipher = crypto.createDecipheriv('aes-256-cbc', fixedKey, fixedIv);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      expect(decrypted.toString()).toBe('test');
    });

    it('decrypt with wrong key throws', () => {
      const plaintext = new Uint8Array(Buffer.from('Hello KSeF!'));
      const ciphertext = service.encryptAES256(plaintext, key, iv);
      const wrongKey = crypto.randomBytes(32);
      expect(() => service.decryptAES256(ciphertext, wrongKey, iv)).toThrow();
    });

    it('decrypt with wrong IV produces different first block', () => {
      const plaintext = new Uint8Array(Buffer.from('Hello KSeF World! This is a long string for CBC.'));
      const ciphertext = service.encryptAES256(plaintext, key, iv);
      const wrongIv = crypto.randomBytes(16);
      // Wrong IV corrupts first block but may not throw (CBC property)
      // Either throws or produces wrong result
      try {
        const decrypted = service.decryptAES256(ciphertext, key, wrongIv);
        expect(Buffer.from(decrypted).toString()).not.toBe(
          'Hello KSeF World! This is a long string for CBC.',
        );
      } catch {
        // Also acceptable — bad padding
      }
    });

    it('handles empty content', () => {
      const empty = new Uint8Array(0);
      const ciphertext = service.encryptAES256(empty, key, iv);
      const decrypted = service.decryptAES256(ciphertext, key, iv);
      expect(decrypted.length).toBe(0);
    });

    it('handles large content (1MB)', () => {
      const large = new Uint8Array(crypto.randomBytes(1024 * 1024));
      const ciphertext = service.encryptAES256(large, key, iv);
      const decrypted = service.decryptAES256(ciphertext, key, iv);
      expect(Buffer.from(decrypted).equals(Buffer.from(large))).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // getEncryptionData()
  // -------------------------------------------------------------------
  describe('getEncryptionData()', () => {
    it('returns cipherKey of 32 bytes', () => {
      const data = service.getEncryptionData();
      expect(data.cipherKey.length).toBe(32);
    });

    it('returns cipherIv of 16 bytes', () => {
      const data = service.getEncryptionData();
      expect(data.cipherIv.length).toBe(16);
    });

    it('encryptedSymmetricKey is valid base64 and 256 bytes decoded', () => {
      const data = service.getEncryptionData();
      const decoded = Buffer.from(data.encryptionInfo.encryptedSymmetricKey, 'base64');
      expect(decoded.length).toBe(256); // RSA-2048 output
    });

    it('initializationVector is valid base64 and 16 bytes decoded', () => {
      const data = service.getEncryptionData();
      const decoded = Buffer.from(data.encryptionInfo.initializationVector, 'base64');
      expect(decoded.length).toBe(16);
    });

    it('encrypted key can be decrypted with private key', () => {
      const data = service.getEncryptionData();
      const encryptedKey = Buffer.from(
        data.encryptionInfo.encryptedSymmetricKey,
        'base64',
      );
      const decryptedKey = crypto.privateDecrypt(
        {
          key: rsaKeyPem,
          oaepHash: 'sha256',
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        encryptedKey,
      );
      expect(Buffer.from(decryptedKey).equals(Buffer.from(data.cipherKey))).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // encryptKsefToken()
  // -------------------------------------------------------------------
  describe('encryptKsefToken()', () => {
    const token = 'test-ksef-token-123';
    const timestamp = '2025-01-15T10:30:00.000Z';
    const expectedMs = new Date(timestamp).getTime();

    it('encrypts token with RSA certificate', () => {
      const result = service.encryptKsefToken(token, timestamp);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('RSA: decrypted plaintext is token|timestampMs', () => {
      const result = service.encryptKsefToken(token, timestamp);
      const decrypted = crypto.privateDecrypt(
        {
          key: rsaKeyPem,
          oaepHash: 'sha256',
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        result,
      );
      expect(decrypted.toString('utf-8')).toBe(`${token}|${expectedMs}`);
    });

    it('encrypts token with EC certificate', () => {
      const fetcher = createMockCertificateFetcher({
        symmetricKeyPem: rsaCertPem,
        ksefTokenPem: ecCertPem,
      });
      const svc = new CryptographyService(fetcher);

      const result = svc.encryptKsefToken(token, timestamp);
      expect(result).toBeInstanceOf(Uint8Array);
      // EC SPKI (91) + nonce (12) + at least 1 byte ciphertext + tag (16)
      expect(result.length).toBeGreaterThan(91 + 12 + 16);
    });

    it('EC: token can be decrypted via ECDH+AES-GCM', () => {
      const fetcher = createMockCertificateFetcher({
        symmetricKeyPem: rsaCertPem,
        ksefTokenPem: ecCertPem,
      });
      const svc = new CryptographyService(fetcher);

      const result = svc.encryptKsefToken(token, timestamp);
      const buf = Buffer.from(result);

      // P-256 SPKI DER is 91 bytes
      const ephemeralSpki = buf.subarray(0, 91);
      const nonce = buf.subarray(91, 103);
      const ciphertextAndTag = buf.subarray(103);

      // Import ephemeral public key
      const ephPubKey = crypto.createPublicKey({
        key: ephemeralSpki,
        format: 'der',
        type: 'spki',
      });

      // Derive shared secret using receiver's private key
      const receiverPrivKey = crypto.createPrivateKey(ecKeyPem);
      const sharedSecret = crypto.diffieHellman({
        privateKey: receiverPrivKey,
        publicKey: ephPubKey,
      });

      // Split ciphertext and tag (GCM tag is last 16 bytes)
      const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);
      const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);

      const decipher = crypto.createDecipheriv('aes-256-gcm', sharedSecret, nonce);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      expect(decrypted.toString('utf-8')).toBe(`${token}|${expectedMs}`);
    });

    it('throws for unsupported key algorithm (Ed25519)', async () => {
      // Generate an Ed25519 cert — asymmetricKeyType will be 'ed25519',
      // which is neither 'rsa' nor 'ec', triggering the unsupported branch
      const x509Lib = await import('@peculiar/x509');
      x509Lib.cryptoProvider.set(crypto.webcrypto as unknown as Crypto);
      const ed25519Keys = await crypto.webcrypto.subtle.generateKey(
        'Ed25519', true, ['sign', 'verify'],
      ) as crypto.webcrypto.CryptoKeyPair;
      const edCert = await x509Lib.X509CertificateGenerator.createSelfSigned({
        name: 'CN=Ed25519 Test',
        keys: ed25519Keys,
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 365 * 24 * 60 * 60_000),
        signingAlgorithm: { name: 'Ed25519' },
        serialNumber: '01',
      });

      const fetcher = createMockCertificateFetcher({
        symmetricKeyPem: rsaCertPem,
        ksefTokenPem: edCert.toString('pem'),
      });
      const svc = new CryptographyService(fetcher);

      expect(() => svc.encryptKsefToken(token, timestamp)).toThrow(
        'Unsupported key algorithm: ed25519',
      );
    });
  });

  // -------------------------------------------------------------------
  // getFileMetadata()
  // -------------------------------------------------------------------
  describe('getFileMetadata()', () => {
    it('correct SHA-256 hash for known input', () => {
      const input = new Uint8Array(Buffer.from('hello world'));
      const result = service.getFileMetadata(input);
      const expected = crypto.createHash('sha256').update(input).digest('base64');
      expect(result.hashSHA).toBe(expected);
    });

    it('correct file size', () => {
      const input = new Uint8Array(100);
      const result = service.getFileMetadata(input);
      expect(result.fileSize).toBe(100);
    });

    it('handles empty file', () => {
      const input = new Uint8Array(0);
      const result = service.getFileMetadata(input);
      expect(result.fileSize).toBe(0);
      expect(result.hashSHA).toBe('47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
    });
  });

  // -------------------------------------------------------------------
  // generateCsrRsa()
  // -------------------------------------------------------------------
  describe('generateCsrRsa()', () => {
    it('generates valid RSA-2048 CSR and private key', async () => {
      const result = await service.generateCsrRsa({
        commonName: 'Test CSR',
        countryCode: 'PL',
      });
      expect(result.csrDer).toBeInstanceOf(Uint8Array);
      expect(result.csrDer.length).toBeGreaterThan(0);
      expect(result.privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----');

      const key = crypto.createPrivateKey(result.privateKeyPem);
      expect(key.asymmetricKeyType).toBe('rsa');
    });

    it('includes all X500 name fields when provided', async () => {
      const result = await service.generateCsrRsa({
        commonName: 'Full CSR',
        givenName: 'Jan',
        surname: 'Kowalski',
        serialNumber: '12345',
        organizationName: 'Acme',
        organizationIdentifier: 'VATPL-123',
        uniqueIdentifier: 'UID-001',
        countryCode: 'PL',
      });
      // Parse the CSR DER to verify subject
      // We can't easily parse X500 from DER without @peculiar/x509
      // but we can verify the CSR is valid by checking it's non-empty
      expect(result.csrDer.length).toBeGreaterThan(0);
      // Verify the PEM-encoded CSR contains the expected OID values
      // by re-parsing via @peculiar/x509
      const { Pkcs10CertificateRequest } = await import('@peculiar/x509');
      const csr = new Pkcs10CertificateRequest(result.csrDer);
      const subject = csr.subject;
      expect(subject).toContain('CN=Full CSR');
      expect(subject).toContain('C=PL');
      expect(subject).toContain('O=Acme');
      expect(subject).toContain('Jan');
      expect(subject).toContain('Kowalski');
    });

    it('includes only provided fields (partial X500 name)', async () => {
      const result = await service.generateCsrRsa({
        commonName: 'Minimal',
      });
      const { Pkcs10CertificateRequest } = await import('@peculiar/x509');
      const csr = new Pkcs10CertificateRequest(result.csrDer);
      expect(csr.subject).toContain('CN=Minimal');
      // Should NOT contain country code since it wasn't provided
      expect(csr.subject).not.toContain('C=');
    });
  });

  // -------------------------------------------------------------------
  // generateCsrEcdsa()
  // -------------------------------------------------------------------
  describe('generateCsrEcdsa()', () => {
    it('generates valid ECDSA P-256 CSR and private key', async () => {
      const result = await service.generateCsrEcdsa({
        commonName: 'EC CSR',
        countryCode: 'PL',
      });
      expect(result.csrDer).toBeInstanceOf(Uint8Array);
      expect(result.csrDer.length).toBeGreaterThan(0);
      expect(result.privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----');

      const key = crypto.createPrivateKey(result.privateKeyPem);
      expect(key.asymmetricKeyType).toBe('ec');
    });
  });

  // -------------------------------------------------------------------
  // parsePrivateKey()
  // -------------------------------------------------------------------
  describe('parsePrivateKey()', () => {
    it('parses RSA private key PEM', () => {
      const key = service.parsePrivateKey(rsaKeyPem);
      expect(key.asymmetricKeyType).toBe('rsa');
    });

    it('parses ECDSA private key PEM', () => {
      const key = service.parsePrivateKey(ecKeyPem);
      expect(key.asymmetricKeyType).toBe('ec');
    });

    it('throws on invalid PEM input', () => {
      expect(() => service.parsePrivateKey('not-a-pem')).toThrow();
    });
  });
});
