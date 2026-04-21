import * as crypto from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';
import { ExclusiveCanonicalization } from 'xml-crypto';
import { SignatureService } from '../../../src/crypto/signature-service.js';
import { KSeFError } from '../../../src/errors/ksef-error.js';
import { getEcPair } from './_helpers.js';

const TEST_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<Invoice xmlns="urn:test"><Number>FV/1/2025</Number></Invoice>';

function getElementText(xml: string, tagName: string): string | null {
  const re = new RegExp(`<(?:[\\w]+:)?${tagName}[^>]*>([\\s\\S]*?)</(?:[\\w]+:)?${tagName}>`);
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

// Curve → expected hash name (Node) + URI fragments we expect to appear in
// the signed XML. The host differs between xmlenc and xmldsig-more — these
// literals are copied straight from `ref/ksef-docs/auth/podpis-xades.md`.
const CURVE_CASES: Array<{
  curve: 'P-256' | 'P-384' | 'P-521';
  hashName: 'sha256' | 'sha384' | 'sha512';
  signatureUri: string;
  digestUri: string;
}> = [
  {
    curve: 'P-256',
    hashName: 'sha256',
    signatureUri: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256',
    digestUri: 'http://www.w3.org/2001/04/xmlenc#sha256',
  },
  {
    curve: 'P-384',
    hashName: 'sha384',
    signatureUri: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384',
    digestUri: 'http://www.w3.org/2001/04/xmldsig-more#sha384',
  },
  {
    curve: 'P-521',
    hashName: 'sha512',
    signatureUri: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512',
    digestUri: 'http://www.w3.org/2001/04/xmlenc#sha512',
  },
];

describe('SignatureService — ECDSA curve → digest mapping', () => {
  describe.each(CURVE_CASES)(
    '$curve (hash=$hashName)',
    ({ curve, hashName, signatureUri, digestUri }) => {
      let signedXml: string;
      let certPem: string;

      beforeAll(async () => {
        const pair = await getEcPair(curve);
        certPem = pair.certPem;
        signedXml = SignatureService.sign(TEST_XML, pair.certPem, pair.keyPem);
      });

      it('emits the matching SignatureMethod URI', () => {
        expect(signedXml).toContain(`<ds:SignatureMethod Algorithm="${signatureUri}"/>`);
      });

      it('emits the matching reference DigestMethod URI (both references)', () => {
        const occurrences = signedXml.match(
          new RegExp(`<ds:DigestMethod Algorithm="${escapeRe(digestUri)}"/>`, 'g'),
        );
        // Two <ds:Reference> entries both use the same DigestMethod.
        expect(occurrences?.length).toBe(2);
      });

      it('emits the matching SigningCertificate/CertDigest DigestMethod URI', () => {
        // Note: xades:CertDigest uses non-prefixed <DigestMethod>.
        expect(signedXml).toContain(`<DigestMethod Algorithm="${digestUri}"/>`);
      });

      it('produces a signature that verifies with the expected hash', () => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(signedXml, 'text/xml');

        const signedInfoElem = doc
          .getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'SignedInfo')
          .item(0)!;

        const c14n = new ExclusiveCanonicalization();
        const canonicalSignedInfo = c14n.process(signedInfoElem, {}) as string;

        const sigValueB64 = getElementText(signedXml, 'SignatureValue')!.replace(/\s/g, '');
        const sigBuffer = Buffer.from(sigValueB64, 'base64');

        const x509 = new crypto.X509Certificate(certPem);
        const valid = crypto.verify(
          hashName,
          Buffer.from(canonicalSignedInfo, 'utf-8'),
          { key: x509.publicKey, dsaEncoding: 'ieee-p1363' },
          sigBuffer,
        );
        expect(valid).toBe(true);
      });
    },
  );

  it('throws KSeFError for an unsupported curve (secp256k1)', async () => {
    // Generate a secp256k1 key pair (not NIST, supported by Node but not by KSeF).
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
    const keyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

    // We need a cert to pass the arg-shape check, but it'll fail before cert usage.
    // Use an unrelated RSA cert — secp256k1-key-vs-RSA-cert mismatch is OK here
    // because the error fires inside pickEcdsaAlgo() before signing.
    const { getRsaPair } = await import('./_helpers.js');
    const rsa = await getRsaPair();

    expect(() => SignatureService.sign(TEST_XML, rsa.certPem, keyPem)).toThrow(KSeFError);
    expect(() => SignatureService.sign(TEST_XML, rsa.certPem, keyPem)).toThrow(/secp256k1/);
  });
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
