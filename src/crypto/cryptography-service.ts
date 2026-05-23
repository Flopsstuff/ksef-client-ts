import * as crypto from 'node:crypto';
import * as x509 from '@peculiar/x509';
import type { CertificateFetcher } from './certificate-fetcher.js';
import type { EncryptionData, CsrResult, X500NameFields } from '../models/crypto/types.js';
import type { EncryptionInfo, FileMetadata } from '../models/common.js';

/**
 * Cryptographic operations for the KSeF system.
 *
 * Provides AES-256-CBC encryption/decryption, RSA-OAEP key wrapping,
 * KSeF token encryption (RSA or ECDH+AES-GCM), SHA-256 hashing,
 * and CSR generation (RSA-2048 / ECDSA P-256).
 */
export class CryptographyService {
  private readonly fetcher: CertificateFetcher;

  constructor(fetcher: CertificateFetcher) {
    this.fetcher = fetcher;
  }

  /** Initialise the underlying certificate fetcher. */
  async init(): Promise<void> {
    await this.fetcher.init();
  }

  /** Re-fetch KSeF public certificates, discarding the cached selection (used for key-rotation recovery). */
  async refresh(): Promise<void> {
    await this.fetcher.refresh();
  }

  /** Identifier of the KsefTokenEncryption public key used by {@link encryptKsefToken} (KSeF API v2.5.0). */
  getKsefTokenPublicKeyId(): string {
    return this.fetcher.getKsefTokenPublicKeyId();
  }

  // ---------------------------------------------------------------------------
  // AES-256-CBC
  // ---------------------------------------------------------------------------

  /** Encrypt with AES-256-CBC (PKCS7 padding is automatic in Node). */
  encryptAES256(content: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    return new Uint8Array(Buffer.concat([cipher.update(content), cipher.final()]));
  }

  /**
   * Encrypt with AES-256-CBC as a streaming transform.
   * Returns a ReadableStream that yields encrypted chunks as the input is read.
   */
  encryptAES256Stream(
    input: ReadableStream<Uint8Array>,
    key: Uint8Array,
    iv: Uint8Array,
  ): ReadableStream<Uint8Array> {
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const transform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const encrypted = cipher.update(chunk);
        if (encrypted.length > 0) {
          controller.enqueue(new Uint8Array(encrypted));
        }
      },
      flush(controller) {
        const final = cipher.final();
        if (final.length > 0) {
          controller.enqueue(new Uint8Array(final));
        }
      },
    });
    return input.pipeThrough(transform);
  }

  /** Decrypt with AES-256-CBC. */
  decryptAES256(content: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return new Uint8Array(Buffer.concat([decipher.update(content), decipher.final()]));
  }

  // ---------------------------------------------------------------------------
  // Encryption data (AES key + IV wrapped with RSA-OAEP)
  // ---------------------------------------------------------------------------

  /**
   * Generate a random AES-256 key and IV, then wrap the key with the
   * SymmetricKeyEncryption certificate's RSA public key (RSA-OAEP SHA-256).
   */
  async getEncryptionData(): Promise<EncryptionData> {
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    // Snapshot pem + publicKeyId together BEFORE the await: a concurrent refresh()
    // could otherwise swap the cached certificate between encrypting the key and
    // reading its id, tagging the ciphertext with a key it wasn't encrypted under.
    const cert = this.fetcher.getSymmetricKeyEncryption();
    const encryptedKey = await this.rsaOaepEncrypt(cert.pem, new Uint8Array(key));

    const encryptionInfo: EncryptionInfo = {
      encryptedSymmetricKey: Buffer.from(encryptedKey).toString('base64'),
      initializationVector: iv.toString('base64'),
      publicKeyId: cert.publicKeyId,
    };

    return {
      cipherKey: new Uint8Array(key),
      cipherIv: new Uint8Array(iv),
      encryptionInfo,
    };
  }

  // ---------------------------------------------------------------------------
  // KSeF token encryption
  // ---------------------------------------------------------------------------

  /**
   * Encrypt a KSeF token for session authorisation.
   *
   * Token payload: `"<token>|<challengeTimestampMs>"`.
   *
   * The algorithm is chosen automatically based on the KsefTokenEncryption
   * certificate's public key type:
   *  - **RSA** — RSA-OAEP with SHA-256
   *  - **EC**  — ECDH key-agreement (P-256) + AES-256-GCM
   *
   * The EC variant outputs bytes in the Java-compatible format:
   * `[ephemeralSPKI | nonce(12) | ciphertext+tag]`.
   */
  async encryptKsefToken(token: string, challengeTimestamp: string): Promise<Uint8Array> {
    return this.encryptKsefTokenWithCertPem(
      this.fetcher.getKsefTokenEncryptionPem(),
      token,
      challengeTimestamp,
    );
  }

  /**
   * Encrypt a KSeF token and return it together with the public key id of the
   * exact certificate used.
   *
   * Both values come from a single certificate snapshot taken before any
   * `await`, so a concurrent {@link refresh} cannot tag the ciphertext with a
   * different key than it was encrypted under (KSeF API v2.5.0). Prefer this over
   * pairing {@link encryptKsefToken} with a separate {@link getKsefTokenPublicKeyId}.
   */
  async encryptKsefTokenWithKeyId(
    token: string,
    challengeTimestamp: string,
  ): Promise<{ encryptedToken: Uint8Array; publicKeyId: string }> {
    const cert = this.fetcher.getKsefTokenEncryption();
    const encryptedToken = await this.encryptKsefTokenWithCertPem(cert.pem, token, challengeTimestamp);
    return { encryptedToken, publicKeyId: cert.publicKeyId };
  }

  private async encryptKsefTokenWithCertPem(
    certPem: string,
    token: string,
    challengeTimestamp: string,
  ): Promise<Uint8Array> {
    const timestampMs = new Date(challengeTimestamp).getTime();
    const plaintext = Buffer.from(`${token}|${timestampMs}`, 'utf-8');

    const cert = new crypto.X509Certificate(certPem);
    const publicKey = cert.publicKey;

    if (publicKey.asymmetricKeyType === 'rsa') {
      return this.rsaOaepEncrypt(certPem, plaintext);
    }

    if (publicKey.asymmetricKeyType === 'ec') {
      return this.encryptEcdhAesGcm(publicKey, plaintext);
    }

    throw new Error(`Unsupported key algorithm: ${publicKey.asymmetricKeyType ?? 'unknown'}`);
  }

  // ---------------------------------------------------------------------------
  // File metadata
  // ---------------------------------------------------------------------------

  /** Compute SHA-256 hash (base64) and byte length. */
  getFileMetadata(file: Uint8Array): FileMetadata {
    const hash = crypto.createHash('sha256').update(file).digest('base64');
    return { hashSHA: hash, fileSize: file.length };
  }

  /** Compute SHA-256 hash (base64) and byte length from a ReadableStream. */
  async getFileMetadataFromStream(stream: ReadableStream<Uint8Array>): Promise<FileMetadata> {
    const hash = crypto.createHash('sha256');
    let fileSize = 0;
    const reader = stream.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        fileSize += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    return { hashSHA: hash.digest('base64'), fileSize };
  }

  // ---------------------------------------------------------------------------
  // CSR generation
  // ---------------------------------------------------------------------------

  /** Generate an RSA-2048 CSR (PKCS#10, DER) and return it together with the private key PEM. */
  async generateCsrRsa(fields: X500NameFields): Promise<CsrResult> {
    setCryptoProvider();

    const algorithm = {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
      publicExponent: new Uint8Array([1, 0, 1]),
      modulusLength: 2048,
    };

    const keys = await crypto.webcrypto.subtle.generateKey(
      algorithm, true, ['sign', 'verify'],
    ) as crypto.webcrypto.CryptoKeyPair;

    const csr = await x509.Pkcs10CertificateRequestGenerator.create({
      name: buildX500Name(fields),
      keys,
      signingAlgorithm: algorithm,
    });

    const csrDer = new Uint8Array(csr.rawData);
    const pkcs8 = await crypto.webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
    const privateKeyPem = pemEncode(new Uint8Array(pkcs8), 'PRIVATE KEY');

    return { csrDer, privateKeyPem };
  }

  /** Generate an ECDSA P-256 CSR (PKCS#10, DER) and return it together with the private key PEM. */
  async generateCsrEcdsa(fields: X500NameFields): Promise<CsrResult> {
    setCryptoProvider();

    const algorithm = {
      name: 'ECDSA',
      namedCurve: 'P-256',
    };

    const keys = await crypto.webcrypto.subtle.generateKey(
      algorithm, true, ['sign', 'verify'],
    ) as crypto.webcrypto.CryptoKeyPair;

    const csr = await x509.Pkcs10CertificateRequestGenerator.create({
      name: buildX500Name(fields),
      keys,
      signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
    });

    const csrDer = new Uint8Array(csr.rawData);
    const pkcs8 = await crypto.webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
    const privateKeyPem = pemEncode(new Uint8Array(pkcs8), 'PRIVATE KEY');

    return { csrDer, privateKeyPem };
  }

  // ---------------------------------------------------------------------------
  // Key parsing
  // ---------------------------------------------------------------------------

  /** Parse a PEM-encoded private key into a Node.js KeyObject. */
  parsePrivateKey(pem: string): crypto.KeyObject {
    return crypto.createPrivateKey(pem);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract the public-key SPKI DER bytes from a CERTIFICATE PEM. Web Crypto's
   * `importKey('spki', ...)` consumes raw DER; we parse the cert via native
   * `X509Certificate` (available on Node and Deno) and export the key directly.
   */
  private spkiDerFromCert(certPem: string): Uint8Array {
    const publicKey = new crypto.X509Certificate(certPem).publicKey;
    return new Uint8Array(publicKey.export({ type: 'spki', format: 'der' }));
  }

  /**
   * RSA-OAEP SHA-256 encryption via Web Crypto.
   *
   * Uses `crypto.webcrypto.subtle` instead of `node:crypto.publicEncrypt`
   * because Deno's Node-compat layer silently ignores the `oaepHash` option
   * and defaults MGF1+OAEP to SHA-1, producing ciphertext KSeF rejects as
   * "Invalid token encryption". Web Crypto requires the hash up-front in
   * `importKey` as part of the key's algorithm identity, so there is no room
   * for a runtime to swap it — output is identical OAEP-SHA256 on every
   * Web Crypto implementation (Node 18+, Deno, Bun, browsers, edge runtimes).
   */
  private async rsaOaepEncrypt(certPem: string, plaintext: Uint8Array): Promise<Uint8Array> {
    const key = await crypto.webcrypto.subtle.importKey(
      'spki',
      this.spkiDerFromCert(certPem),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
    const ciphertext = await crypto.webcrypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      key,
      plaintext,
    );
    return new Uint8Array(ciphertext);
  }

  /**
   * ECDH (P-256) + AES-256-GCM encryption.
   *
   * 1. Generate an ephemeral EC key pair on the same curve (P-256).
   * 2. Derive a shared secret via ECDH with the receiver's public key.
   * 3. Use the shared secret (32 bytes) as the AES-256-GCM key.
   * 4. Encrypt with a random 12-byte nonce.
   * 5. Output: `[ephemeralSPKI | nonce(12) | ciphertext+tag]`
   *    (Java-compatible — GCM appends the 16-byte tag to the ciphertext).
   */
  private encryptEcdhAesGcm(receiverPublicKey: crypto.KeyObject, plaintext: Buffer): Uint8Array {
    const { privateKey: ephPrivKey, publicKey: ephPubKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });

    const sharedSecret = crypto.diffieHellman({
      privateKey: ephPrivKey,
      publicKey: receiverPublicKey,
    });

    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', sharedSecret, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag(); // 16 bytes

    const ephemeralSpki = ephPubKey.export({ type: 'spki', format: 'der' });

    // Java format: [spki | nonce | ciphertext+tag]
    return new Uint8Array(Buffer.concat([ephemeralSpki, nonce, ciphertext, tag]));
  }
}

// =============================================================================
// Module-level types & helpers
// =============================================================================

/** Set the @peculiar/x509 crypto provider to Node.js webcrypto (idempotent). */
function setCryptoProvider(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  x509.cryptoProvider.set(crypto.webcrypto as any);
}

/**
 * Build an X.500 distinguished name string from individual fields.
 *
 * Uses OID notation for attributes that have no standard short name
 * (givenName, surname, serialNumber, organizationIdentifier, uniqueIdentifier).
 */
function buildX500Name(fields: X500NameFields): string {
  const parts: string[] = [];
  if (fields.commonName) parts.push(`CN=${fields.commonName}`);
  if (fields.givenName) parts.push(`2.5.4.42=${fields.givenName}`);
  if (fields.surname) parts.push(`2.5.4.4=${fields.surname}`);
  if (fields.serialNumber) parts.push(`2.5.4.5=${fields.serialNumber}`);
  if (fields.organizationName) parts.push(`O=${fields.organizationName}`);
  if (fields.organizationIdentifier) parts.push(`2.5.4.97=${fields.organizationIdentifier}`);
  if (fields.uniqueIdentifier) parts.push(`2.5.4.45=${fields.uniqueIdentifier}`);
  if (fields.countryCode) parts.push(`C=${fields.countryCode}`);
  return parts.join(', ');
}

/** Encode raw DER bytes as a PEM string with the given label. */
function pemEncode(der: Uint8Array, label: string): string {
  const base64 = Buffer.from(der).toString('base64');
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 64) {
    lines.push(base64.substring(i, i + 64));
  }
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}
