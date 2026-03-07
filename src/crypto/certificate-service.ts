import * as crypto from 'node:crypto';
import * as x509 from '@peculiar/x509';
import type { SelfSignedCertificateResult, CryptoEncryptionMethod } from '../models/crypto/types.js';

export class CertificateService {
  static getSha256Fingerprint(certPem: string): string {
    const der = extractDerFromPem(certPem);
    return crypto.createHash('sha256').update(der).digest('hex').toUpperCase();
  }

  static async generatePersonalCertificate(
    givenName: string,
    surname: string,
    serialNumber: string,
    commonName: string,
    method: CryptoEncryptionMethod = 'RSA',
  ): Promise<SelfSignedCertificateResult> {
    // OIDs: givenName=2.5.4.42, surname=2.5.4.4, serialNumber=2.5.4.5, CN=2.5.4.3, C=2.5.4.6
    const nameParts: string[] = [];
    nameParts.push(`2.5.4.42=${givenName}`);
    nameParts.push(`2.5.4.4=${surname}`);
    nameParts.push(`2.5.4.5=${serialNumber}`);
    nameParts.push(`CN=${commonName}`);
    nameParts.push(`C=PL`);
    const subject = nameParts.join(', ');

    return generateSelfSigned(subject, method);
  }

  static async generateCompanySeal(
    orgName: string,
    orgIdentifier: string,
    commonName: string,
    method: CryptoEncryptionMethod = 'RSA',
  ): Promise<SelfSignedCertificateResult> {
    // OIDs: O=2.5.4.10, organizationIdentifier=2.5.4.97, CN=2.5.4.3, C=2.5.4.6
    const nameParts: string[] = [];
    nameParts.push(`O=${orgName}`);
    nameParts.push(`2.5.4.97=${orgIdentifier}`);
    nameParts.push(`CN=${commonName}`);
    nameParts.push(`C=PL`);
    const subject = nameParts.join(', ');

    return generateSelfSigned(subject, method);
  }
}

async function generateSelfSigned(
  subject: string,
  method: CryptoEncryptionMethod,
): Promise<SelfSignedCertificateResult> {
  // Set WebCrypto provider
  x509.cryptoProvider.set(crypto.webcrypto as unknown as Crypto);

  let algorithm: Algorithm;
  let signingAlgorithm: Algorithm;

  if (method === 'ECDSA') {
    algorithm = { name: 'ECDSA', namedCurve: 'P-256' } as EcKeyGenParams;
    signingAlgorithm = { name: 'ECDSA', hash: 'SHA-256' } as EcdsaParams;
  } else {
    algorithm = {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
      publicExponent: new Uint8Array([1, 0, 1]),
      modulusLength: 2048,
    } as RsaHashedKeyGenParams;
    signingAlgorithm = algorithm;
  }

  const keys = await crypto.webcrypto.subtle.generateKey(
    algorithm, true, ['sign', 'verify'],
  ) as crypto.webcrypto.CryptoKeyPair;

  const now = new Date();
  const notBefore = new Date(now.getTime() - 61 * 60_000); // -61 minutes (matching C# reference)
  const notAfter = new Date(now.getTime() + 365 * 24 * 60 * 60_000); // +365 days

  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    name: subject,
    keys,
    notBefore,
    notAfter,
    signingAlgorithm,
    serialNumber: Date.now().toString(16),
  });

  const certPem = cert.toString('pem');

  // Export private key as PEM
  const pkcs8 = await crypto.webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
  const privateKeyPem = pemEncode(new Uint8Array(pkcs8), 'PRIVATE KEY');

  // Compute fingerprint
  const fingerprint = crypto
    .createHash('sha256')
    .update(Buffer.from(cert.rawData))
    .digest('hex')
    .toUpperCase();

  return { certificatePem: certPem, privateKeyPem, fingerprint };
}

function extractDerFromPem(pem: string): Buffer {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s/g, '');
  return Buffer.from(base64, 'base64');
}

function pemEncode(der: Uint8Array, label: string): string {
  const base64 = Buffer.from(der).toString('base64');
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 64) {
    lines.push(base64.substring(i, i + 64));
  }
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}
