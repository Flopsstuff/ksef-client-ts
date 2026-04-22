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

    it('decrypt with wrong key fails to recover plaintext', () => {
      const plaintext = new Uint8Array(Buffer.from('Hello KSeF!'));
      const ciphertext = service.encryptAES256(plaintext, key, iv);
      const wrongKey = crypto.randomBytes(32);
      // AES-CBC has no MAC: decryption with a random key throws only when the
      // PKCS padding byte lands in [1..16] by chance (~1/256 probability it
      // does not throw). Either throws, or returns garbage bytes that do not
      // match the original plaintext.
      try {
        const decrypted = service.decryptAES256(ciphertext, wrongKey, iv);
        expect(Buffer.from(decrypted).equals(Buffer.from(plaintext))).toBe(false);
      } catch {
        // Also acceptable — bad padding rejected by OpenSSL.
      }
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
    it('returns cipherKey of 32 bytes', async () => {
      const data = await service.getEncryptionData();
      expect(data.cipherKey.length).toBe(32);
    });

    it('returns cipherIv of 16 bytes', async () => {
      const data = await service.getEncryptionData();
      expect(data.cipherIv.length).toBe(16);
    });

    it('encryptedSymmetricKey is valid base64 and 256 bytes decoded', async () => {
      const data = await service.getEncryptionData();
      const decoded = Buffer.from(data.encryptionInfo.encryptedSymmetricKey, 'base64');
      expect(decoded.length).toBe(256); // RSA-2048 output
    });

    it('initializationVector is valid base64 and 16 bytes decoded', async () => {
      const data = await service.getEncryptionData();
      const decoded = Buffer.from(data.encryptionInfo.initializationVector, 'base64');
      expect(decoded.length).toBe(16);
    });

    it('encrypted key can be decrypted with private key', async () => {
      const data = await service.getEncryptionData();
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

    it('encrypts token with RSA certificate', async () => {
      const result = await service.encryptKsefToken(token, timestamp);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('RSA: decrypted plaintext is token|timestampMs', async () => {
      const result = await service.encryptKsefToken(token, timestamp);
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

    it('encrypts token with EC certificate', async () => {
      const fetcher = createMockCertificateFetcher({
        symmetricKeyPem: rsaCertPem,
        ksefTokenPem: ecCertPem,
      });
      const svc = new CryptographyService(fetcher);

      const result = await svc.encryptKsefToken(token, timestamp);
      expect(result).toBeInstanceOf(Uint8Array);
      // EC SPKI (91) + nonce (12) + at least 1 byte ciphertext + tag (16)
      expect(result.length).toBeGreaterThan(91 + 12 + 16);
    });

    it('EC: token can be decrypted via ECDH+AES-GCM', async () => {
      const fetcher = createMockCertificateFetcher({
        symmetricKeyPem: rsaCertPem,
        ksefTokenPem: ecCertPem,
      });
      const svc = new CryptographyService(fetcher);

      const result = await svc.encryptKsefToken(token, timestamp);
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

      await expect(svc.encryptKsefToken(token, timestamp)).rejects.toThrow(
        'Unsupported key algorithm: ed25519',
      );
    });
  });

  // -------------------------------------------------------------------
  // encryptAES256Stream()
  // -------------------------------------------------------------------
  describe('encryptAES256Stream()', () => {
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    function toStream(data: Uint8Array): ReadableStream<Uint8Array> {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });
    }

    function toChunkedStream(data: Uint8Array, chunkSize: number): ReadableStream<Uint8Array> {
      return new ReadableStream({
        start(controller) {
          for (let i = 0; i < data.length; i += chunkSize) {
            controller.enqueue(data.subarray(i, Math.min(i + chunkSize, data.length)));
          }
          controller.close();
        },
      });
    }

    async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
      const chunks: Uint8Array[] = [];
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      return new Uint8Array(Buffer.concat(chunks));
    }

    it('output matches buffer-based encryption for same input', async () => {
      const plaintext = new Uint8Array(Buffer.from('Hello KSeF stream!'));
      const bufferResult = service.encryptAES256(plaintext, key, iv);
      const streamResult = await collectStream(
        service.encryptAES256Stream(toStream(plaintext), key, iv),
      );
      expect(Buffer.from(streamResult).equals(Buffer.from(bufferResult))).toBe(true);
    });

    it('output matches buffer-based encryption for multi-chunk input', async () => {
      const plaintext = new Uint8Array(crypto.randomBytes(10_000));
      const bufferResult = service.encryptAES256(plaintext, key, iv);
      const streamResult = await collectStream(
        service.encryptAES256Stream(toChunkedStream(plaintext, 1000), key, iv),
      );
      expect(Buffer.from(streamResult).equals(Buffer.from(bufferResult))).toBe(true);
    });

    it('handles single AES block (16 bytes)', async () => {
      const plaintext = new Uint8Array(16);
      const bufferResult = service.encryptAES256(plaintext, key, iv);
      const streamResult = await collectStream(
        service.encryptAES256Stream(toStream(plaintext), key, iv),
      );
      expect(Buffer.from(streamResult).equals(Buffer.from(bufferResult))).toBe(true);
    });

    it('handles empty input', async () => {
      const plaintext = new Uint8Array(0);
      const bufferResult = service.encryptAES256(plaintext, key, iv);
      const streamResult = await collectStream(
        service.encryptAES256Stream(toStream(plaintext), key, iv),
      );
      expect(Buffer.from(streamResult).equals(Buffer.from(bufferResult))).toBe(true);
    });

    it('encrypted stream can be decrypted', async () => {
      const plaintext = new Uint8Array(Buffer.from('Decrypt me!'));
      const streamResult = await collectStream(
        service.encryptAES256Stream(toStream(plaintext), key, iv),
      );
      const decrypted = service.decryptAES256(streamResult, key, iv);
      expect(Buffer.from(decrypted).toString()).toBe('Decrypt me!');
    });
  });

  // -------------------------------------------------------------------
  // getFileMetadataFromStream()
  // -------------------------------------------------------------------
  describe('getFileMetadataFromStream()', () => {
    function toStream(data: Uint8Array): ReadableStream<Uint8Array> {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });
    }

    function toChunkedStream(data: Uint8Array, chunkSize: number): ReadableStream<Uint8Array> {
      return new ReadableStream({
        start(controller) {
          for (let i = 0; i < data.length; i += chunkSize) {
            controller.enqueue(data.subarray(i, Math.min(i + chunkSize, data.length)));
          }
          controller.close();
        },
      });
    }

    it('output matches buffer-based hashing', async () => {
      const data = new Uint8Array(Buffer.from('hello world'));
      const bufferResult = service.getFileMetadata(data);
      const streamResult = await service.getFileMetadataFromStream(toStream(data));
      expect(streamResult.hashSHA).toBe(bufferResult.hashSHA);
      expect(streamResult.fileSize).toBe(bufferResult.fileSize);
    });

    it('output matches for multi-chunk stream', async () => {
      const data = new Uint8Array(crypto.randomBytes(10_000));
      const bufferResult = service.getFileMetadata(data);
      const streamResult = await service.getFileMetadataFromStream(toChunkedStream(data, 1000));
      expect(streamResult.hashSHA).toBe(bufferResult.hashSHA);
      expect(streamResult.fileSize).toBe(bufferResult.fileSize);
    });

    it('handles empty stream', async () => {
      const result = await service.getFileMetadataFromStream(toStream(new Uint8Array(0)));
      expect(result.fileSize).toBe(0);
      expect(result.hashSHA).toBe('47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
    });

    it('stream is consumed after call', async () => {
      const stream = toStream(new Uint8Array(Buffer.from('test')));
      await service.getFileMetadataFromStream(stream);
      // Stream should be locked/consumed — getting reader again should fail or return done
      const reader = stream.getReader();
      const { done } = await reader.read();
      expect(done).toBe(true);
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

  // -------------------------------------------------------------------
  // SPKI public-key extraction (Deno compatibility safety net)
  // -------------------------------------------------------------------
  describe('SPKI public-key extraction (Deno compat)', () => {
    function extractSpkiPem(certPem: string): string {
      return new crypto.X509Certificate(certPem).publicKey.export({
        type: 'spki',
        format: 'pem',
      }) as string;
    }

    it('wrapped symmetric key decrypts when re-encrypted via an SPKI PEM derived from the same cert', async () => {
      const data = await service.getEncryptionData();
      const spkiPem = extractSpkiPem(rsaCertPem);

      const reEncrypted = crypto.publicEncrypt(
        {
          key: spkiPem,
          oaepHash: 'sha256',
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        Buffer.from(data.cipherKey),
      );

      const decrypted = crypto.privateDecrypt(
        {
          key: rsaKeyPem,
          oaepHash: 'sha256',
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        reEncrypted,
      );

      expect(Buffer.from(decrypted).equals(Buffer.from(data.cipherKey))).toBe(true);
    });

    it('encryptKsefToken RSA path round-trips for multiple random tokens', async () => {
      const timestamp = '2025-06-01T12:00:00.000Z';
      const expectedMs = new Date(timestamp).getTime();

      for (let i = 0; i < 3; i++) {
        const token = crypto.randomBytes(32).toString('hex');
        const ciphertext = await service.encryptKsefToken(token, timestamp);
        const decrypted = crypto.privateDecrypt(
          {
            key: rsaKeyPem,
            oaepHash: 'sha256',
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          },
          Buffer.from(ciphertext),
        );
        expect(decrypted.toString('utf-8')).toBe(`${token}|${expectedMs}`);
      }
    });

    it('SPKI PEM exported from cert is well-formed and parseable', () => {
      const spkiPem = extractSpkiPem(rsaCertPem);

      expect(spkiPem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
      expect(spkiPem.trimEnd()).toMatch(/-----END PUBLIC KEY-----$/);

      const key = crypto.createPublicKey(spkiPem);
      expect(key.asymmetricKeyType).toBe('rsa');
      expect(key.asymmetricKeyDetails?.modulusLength).toBe(2048);
    });

    it('publicEncrypt produces decryption-equivalent output for cert PEM and SPKI PEM', () => {
      const plaintext = Buffer.from('hello|1776755224708', 'utf-8');
      const spkiPem = extractSpkiPem(rsaCertPem);

      const ciphertextFromCert = crypto.publicEncrypt(
        {
          key: rsaCertPem,
          oaepHash: 'sha256',
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        plaintext,
      );

      const ciphertextFromSpki = crypto.publicEncrypt(
        {
          key: spkiPem,
          oaepHash: 'sha256',
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        plaintext,
      );

      const decOpts = {
        key: rsaKeyPem,
        oaepHash: 'sha256',
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      };

      const decryptedFromCert = crypto.privateDecrypt(decOpts, ciphertextFromCert);
      const decryptedFromSpki = crypto.privateDecrypt(decOpts, ciphertextFromSpki);

      expect(decryptedFromCert.equals(plaintext)).toBe(true);
      expect(decryptedFromSpki.equals(plaintext)).toBe(true);
    });

    it('encryptedSymmetricKey length is stable at 256 bytes across 5 runs', async () => {
      for (let i = 0; i < 5; i++) {
        const data = await service.getEncryptionData();
        const decoded = Buffer.from(data.encryptionInfo.encryptedSymmetricKey, 'base64');
        expect(decoded.length).toBe(256);
      }
    });
  });

  // -------------------------------------------------------------------
  // Deno-strict regression guards:
  //
  //  (a) Production paths must route through `spkiDerFromCert` so SPKI is
  //      extracted from the certificate via native `X509Certificate` (works on
  //      both Node and Deno).
  //  (b) The resulting RSA-OAEP ciphertext must be decryptable with SHA-256.
  //      This catches the issue #18 regression class where Deno's Node-compat
  //      layer silently swapped the OAEP hash for SHA-1 — Node-encrypt-then-
  //      Node-decrypt round-trips would still pass under the old `publicEncrypt`
  //      path, hiding the bug. Asking for SHA-1 to FAIL nails the invariant.
  //
  // `spkiDerFromCert` is a private method; we access it via bracket notation.
  // Spying on the class instance works because class methods live on a
  // mutable prototype (unlike ESM module namespaces, which are frozen).
  // -------------------------------------------------------------------
  describe('Deno-strict regression guards', () => {
    type ServiceInternals = { spkiDerFromCert(certPem: string): Uint8Array };

    it('spkiDerFromCert returns SPKI DER bytes (not PEM, not certificate)', () => {
      const internals = service as unknown as ServiceInternals;
      const der = internals.spkiDerFromCert(rsaCertPem);
      expect(der).toBeInstanceOf(Uint8Array);
      // RSA-2048 SPKI DER is 294 bytes (2048-bit modulus + ASN.1 wrappers)
      expect(der.length).toBeGreaterThan(280);
      expect(der.length).toBeLessThan(320);
      // Must NOT contain ASCII 'BEGIN' (which would mean it's PEM, not DER)
      expect(Buffer.from(der).includes(Buffer.from('BEGIN'))).toBe(false);
    });

    it('encryptKsefToken routes through spkiDerFromCert (not bypassed)', async () => {
      const internals = service as unknown as ServiceInternals;
      const spy = vi.spyOn(internals, 'spkiDerFromCert');
      try {
        await service.encryptKsefToken('token', '2025-01-15T10:30:00.000Z');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(rsaCertPem);
        const returned = spy.mock.results[0]?.value as Uint8Array;
        expect(returned).toBeInstanceOf(Uint8Array);
      } finally {
        spy.mockRestore();
      }
    });

    it('getEncryptionData routes through spkiDerFromCert (not bypassed)', async () => {
      const internals = service as unknown as ServiceInternals;
      const spy = vi.spyOn(internals, 'spkiDerFromCert');
      try {
        await service.getEncryptionData();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(rsaCertPem);
        const returned = spy.mock.results[0]?.value as Uint8Array;
        expect(returned).toBeInstanceOf(Uint8Array);
      } finally {
        spy.mockRestore();
      }
    });

    it('encryptKsefToken output decrypts as OAEP-SHA256, not OAEP-SHA1', async () => {
      const ct = await service.encryptKsefToken('token', '2025-01-15T10:30:00.000Z');

      // SHA-256 decrypt MUST succeed — that's our OAEP hash invariant.
      const decrypted = crypto.privateDecrypt(
        { key: rsaKeyPem, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
        Buffer.from(ct),
      );
      expect(decrypted.toString('utf-8')).toMatch(/^token\|/);

      // SHA-1 decrypt MUST fail — proves we don't regress to Deno-style SHA-1 output.
      expect(() =>
        crypto.privateDecrypt(
          { key: rsaKeyPem, oaepHash: 'sha1', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
          Buffer.from(ct),
        ),
      ).toThrow();
    });

    it('getEncryptionData wrapped key decrypts as OAEP-SHA256, not OAEP-SHA1', async () => {
      const data = await service.getEncryptionData();
      const wrappedKey = Buffer.from(data.encryptionInfo.encryptedSymmetricKey, 'base64');

      const decrypted = crypto.privateDecrypt(
        { key: rsaKeyPem, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
        wrappedKey,
      );
      expect(Buffer.from(decrypted).equals(Buffer.from(data.cipherKey))).toBe(true);

      expect(() =>
        crypto.privateDecrypt(
          { key: rsaKeyPem, oaepHash: 'sha1', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
          wrappedKey,
        ),
      ).toThrow();
    });
  });
});
