import type { EncryptionInfo } from '../common.js';

export type PublicKeyCertificateUsage = 'KsefTokenEncryption' | 'SymmetricKeyEncryption';

export interface PublicKeyCertificate {
  certificate: string;
  /** SHA-256 of the DER certificate, Base64-encoded (KSeF API v2.5.0). */
  certificateId: string;
  /** SHA-256 of the certificate's SubjectPublicKeyInfo, Base64 (44 chars) — key-rotation selector (KSeF API v2.5.0). */
  publicKeyId: string;
  validFrom: string;
  validTo: string;
  usage: PublicKeyCertificateUsage[];
}

export interface EncryptionData {
  cipherKey: Uint8Array;
  cipherIv: Uint8Array;
  encryptionInfo: EncryptionInfo;
}

export interface CsrResult {
  csrDer: Uint8Array;
  privateKeyPem: string;
}

export interface SelfSignedCertificateResult {
  certificatePem: string;
  privateKeyPem: string;
  fingerprint: string;
}

export interface X500NameFields {
  commonName?: string;
  givenName?: string;
  surname?: string;
  serialNumber?: string;
  organizationName?: string;
  organizationIdentifier?: string;
  uniqueIdentifier?: string;
  countryCode?: string;
}

export type CryptoEncryptionMethod = 'RSA' | 'ECDSA';

/**
 * NIST elliptic curves for which KSeF XAdES signing is supported.
 *
 * The signing digest is paired with the curve per NIST SP 800-57:
 * P-256 → SHA-256, P-384 → SHA-384, P-521 → SHA-512.
 */
export type ECDigestCurve = 'P-256' | 'P-384' | 'P-521';
