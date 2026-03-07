import type { EncryptionInfo } from '../common.js';

export type PublicKeyCertificateUsage = 'KsefTokenEncryption' | 'SymmetricKeyEncryption';

export interface PublicKeyCertificateInfo {
  certificate: string;
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
