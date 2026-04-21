import * as crypto from 'node:crypto';
import * as x509 from '@peculiar/x509';
import type { CertificateFetcher } from '../../../src/crypto/certificate-fetcher.js';
import type { PublicKeyCertificate } from '../../../src/models/crypto/types.js';
export { createMockRestClient, getRequest, mockResponse } from '../services/_helpers.js';

// ---------------------------------------------------------------------------
// Lazy-cached RSA and EC cert+key pairs (generated once per test run)
// ---------------------------------------------------------------------------

interface CertKeyPair {
  certPem: string;
  keyPem: string;
  certDerBase64: string;
}

type EcCurveName = 'P-256' | 'P-384' | 'P-521';

let rsaPair: CertKeyPair | undefined;
const ecPairs = new Map<EcCurveName, CertKeyPair>();

const CURVE_TO_HASH: Record<EcCurveName, 'SHA-256' | 'SHA-384' | 'SHA-512'> = {
  'P-256': 'SHA-256',
  'P-384': 'SHA-384',
  'P-521': 'SHA-512',
};

async function generatePair(
  method: 'RSA' | 'ECDSA',
  curve: EcCurveName = 'P-256',
): Promise<CertKeyPair> {
  x509.cryptoProvider.set(crypto.webcrypto as unknown as Crypto);

  const algorithm =
    method === 'ECDSA'
      ? ({ name: 'ECDSA', namedCurve: curve } as EcKeyGenParams)
      : ({
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256',
          publicExponent: new Uint8Array([1, 0, 1]),
          modulusLength: 2048,
        } as RsaHashedKeyGenParams);

  const signingAlgorithm =
    method === 'ECDSA'
      ? ({ name: 'ECDSA', hash: CURVE_TO_HASH[curve] } as EcdsaParams)
      : algorithm;

  const keys = (await crypto.webcrypto.subtle.generateKey(
    algorithm,
    true,
    ['sign', 'verify'],
  )) as crypto.webcrypto.CryptoKeyPair;

  const now = new Date();
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    name: 'CN=Test, C=PL',
    keys,
    notBefore: new Date(now.getTime() - 61 * 60_000),
    notAfter: new Date(now.getTime() + 365 * 24 * 60 * 60_000),
    signingAlgorithm,
    serialNumber: Date.now().toString(16),
  });

  const certPem = cert.toString('pem');
  const certDerBase64 = Buffer.from(cert.rawData).toString('base64');

  const pkcs8 = await crypto.webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
  const base64 = Buffer.from(pkcs8).toString('base64');
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 64) {
    lines.push(base64.substring(i, i + 64));
  }
  const keyPem = `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;

  return { certPem, keyPem, certDerBase64 };
}

export async function getRsaPair(): Promise<CertKeyPair> {
  if (!rsaPair) rsaPair = await generatePair('RSA');
  return rsaPair;
}

export async function getEcPair(curve: EcCurveName = 'P-256'): Promise<CertKeyPair> {
  let pair = ecPairs.get(curve);
  if (!pair) {
    pair = await generatePair('ECDSA', curve);
    ecPairs.set(curve, pair);
  }
  return pair;
}

// ---------------------------------------------------------------------------
// Mock CertificateFetcher
// ---------------------------------------------------------------------------

export function createMockCertificateFetcher(overrides?: {
  symmetricKeyPem?: string;
  ksefTokenPem?: string;
}): CertificateFetcher {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    getSymmetricKeyEncryptionPem: vi.fn().mockReturnValue(
      overrides?.symmetricKeyPem ?? 'PLACEHOLDER',
    ),
    getKsefTokenEncryptionPem: vi.fn().mockReturnValue(
      overrides?.ksefTokenPem ?? 'PLACEHOLDER',
    ),
  } as unknown as CertificateFetcher;
}

// ---------------------------------------------------------------------------
// Sample certificate fixtures for CertificateFetcher tests
// ---------------------------------------------------------------------------

export function makeCertFixture(
  usage: ('SymmetricKeyEncryption' | 'KsefTokenEncryption')[],
  certDerBase64: string,
  validFrom = '2025-01-01T00:00:00Z',
): PublicKeyCertificate {
  return {
    certificate: certDerBase64,
    validFrom,
    validTo: '2026-01-01T00:00:00Z',
    usage,
  };
}
