import * as crypto from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';
import { ExclusiveCanonicalization } from 'xml-crypto';
import { SignatureService } from '../../../src/crypto/signature-service.js';
import { getRsaPair, getEcPair } from './_helpers.js';

const TEST_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<Invoice xmlns="urn:test"><Number>FV/1/2025</Number></Invoice>';

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

// ---------------------------------------------------------------------------
// Helpers for parsing signed XML
// ---------------------------------------------------------------------------

function getElementText(xml: string, tagName: string): string | null {
  const re = new RegExp(`<(?:[\\w]+:)?${tagName}[^>]*>([\\s\\S]*?)</(?:[\\w]+:)?${tagName}>`);
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

function countOccurrences(xml: string, pattern: string): number {
  return (xml.match(new RegExp(pattern, 'g')) ?? []).length;
}

describe('SignatureService', () => {
  // -------------------------------------------------------------------
  // sign() with RSA key
  // -------------------------------------------------------------------
  describe('sign() with RSA key', () => {
    let signedXml: string;

    beforeAll(() => {
      signedXml = SignatureService.sign(TEST_XML, rsaCertPem, rsaKeyPem);
    });

    it('returns valid XML', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(signedXml, 'text/xml');
      expect(doc.documentElement).toBeTruthy();
      expect(doc.documentElement!.localName).toBe('Invoice');
    });

    it('appends ds:Signature to root', () => {
      expect(signedXml).toContain('<ds:Signature');
    });

    it('contains ds:SignatureValue with non-empty base64', () => {
      const sigValue = getElementText(signedXml, 'SignatureValue');
      expect(sigValue).toBeTruthy();
      expect(sigValue!.replace(/\s/g, '').length).toBeGreaterThan(0);
      // Should be valid base64
      expect(() =>
        Buffer.from(sigValue!.replace(/\s/g, ''), 'base64'),
      ).not.toThrow();
    });

    it('contains X509Certificate with cert base64', () => {
      const certB64 = getElementText(signedXml, 'X509Certificate');
      expect(certB64).toBeTruthy();
      expect(certB64!.length).toBeGreaterThan(0);
    });

    it('contains SignedProperties with Id="SignedProperties"', () => {
      expect(signedXml).toContain('Id="SignedProperties"');
    });

    it('contains SigningTime with ISO 8601 timestamp', () => {
      const signingTime = getElementText(signedXml, 'SigningTime');
      expect(signingTime).toBeTruthy();
      expect(signingTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('contains two ds:Reference elements', () => {
      const count = countOccurrences(signedXml, '<ds:Reference ');
      expect(count).toBe(2);
      // One with URI="" (root document)
      expect(signedXml).toContain('URI=""');
      // One with URI="#SignedProperties"
      expect(signedXml).toContain('URI="#SignedProperties"');
    });

    it('uses RSA-SHA256 algorithm URI', () => {
      expect(signedXml).toContain('rsa-sha256');
      expect(signedXml).not.toContain('ecdsa-sha256');
    });

    it('signature is cryptographically valid', () => {
      // Extract canonical SignedInfo and verify
      const parser = new DOMParser();
      const doc = parser.parseFromString(signedXml, 'text/xml');

      // Find ds:SignedInfo element
      const signedInfoElements = doc.getElementsByTagNameNS(
        'http://www.w3.org/2000/09/xmldsig#',
        'SignedInfo',
      );
      expect(signedInfoElements.length).toBe(1);
      const signedInfoElem = signedInfoElements.item(0)!;

      // Canonicalize
      const c14n = new ExclusiveCanonicalization();
      const canonicalSignedInfo = c14n.process(signedInfoElem, {}) as string;

      // Get signature value
      const sigValueB64 = getElementText(signedXml, 'SignatureValue')!
        .replace(/\s/g, '');
      const sigBuffer = Buffer.from(sigValueB64, 'base64');

      // Verify with cert public key
      const x509 = new crypto.X509Certificate(rsaCertPem);
      const valid = crypto.verify(
        'sha256',
        Buffer.from(canonicalSignedInfo, 'utf-8'),
        x509.publicKey,
        sigBuffer,
      );
      expect(valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // sign() with ECDSA key
  // -------------------------------------------------------------------
  describe('sign() with ECDSA key', () => {
    let signedXml: string;

    beforeAll(() => {
      signedXml = SignatureService.sign(TEST_XML, ecCertPem, ecKeyPem);
    });

    it('uses ECDSA-SHA256 algorithm URI', () => {
      expect(signedXml).toContain('ecdsa-sha256');
      expect(signedXml).not.toContain('rsa-sha256');
    });

    it('produces valid XML with ds:Signature', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(signedXml, 'text/xml');
      expect(doc.documentElement).toBeTruthy();
      expect(signedXml).toContain('<ds:Signature');
    });

    it('signature is cryptographically valid (IEEE P1363)', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(signedXml, 'text/xml');

      const signedInfoElements = doc.getElementsByTagNameNS(
        'http://www.w3.org/2000/09/xmldsig#',
        'SignedInfo',
      );
      const signedInfoElem = signedInfoElements.item(0)!;

      const c14n = new ExclusiveCanonicalization();
      const canonicalSignedInfo = c14n.process(signedInfoElem, {}) as string;

      const sigValueB64 = getElementText(signedXml, 'SignatureValue')!
        .replace(/\s/g, '');
      const sigBuffer = Buffer.from(sigValueB64, 'base64');

      const x509 = new crypto.X509Certificate(ecCertPem);
      const valid = crypto.verify(
        'sha256',
        Buffer.from(canonicalSignedInfo, 'utf-8'),
        { key: x509.publicKey, dsaEncoding: 'ieee-p1363' },
        sigBuffer,
      );
      expect(valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // sign() error cases
  // -------------------------------------------------------------------
  describe('sign() error cases', () => {
    it('throws when xml is empty', () => {
      expect(() => SignatureService.sign('', rsaCertPem, rsaKeyPem)).toThrow(
        'xml, certPem, and privateKeyPem are required',
      );
    });

    it('throws when certPem is empty', () => {
      expect(() => SignatureService.sign(TEST_XML, '', rsaKeyPem)).toThrow(
        'xml, certPem, and privateKeyPem are required',
      );
    });

    it('throws when privateKeyPem is empty', () => {
      expect(() => SignatureService.sign(TEST_XML, rsaCertPem, '')).toThrow(
        'xml, certPem, and privateKeyPem are required',
      );
    });
  });
});
