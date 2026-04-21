import * as crypto from 'node:crypto';
import { ExclusiveCanonicalization } from 'xml-crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { KSeFError } from '../errors/ksef-error.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';
const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
const SIGNED_PROPERTIES_TYPE = 'http://uri.etsi.org/01903#SignedProperties';
const EXC_C14N_ALGORITHM = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const ENVELOPED_SIGNATURE_TRANSFORM = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

// URIs authorised by KSeF XAdES spec (ref/ksef-docs/auth/podpis-xades.md §§ SignatureMethod, DigestMethod).
// Note the asymmetric hosts: sha256/sha512 digests are under xmlenc, sha384 digest is under xmldsig-more.
type NodeHashName = 'sha256' | 'sha384' | 'sha512';

interface SigningAlgo {
  nodeHashName: NodeHashName;
  signatureUri: string;
  digestUri: string;
}

const DIGEST_URI: Record<NodeHashName, string> = {
  sha256: 'http://www.w3.org/2001/04/xmlenc#sha256',
  sha384: 'http://www.w3.org/2001/04/xmldsig-more#sha384',
  sha512: 'http://www.w3.org/2001/04/xmlenc#sha512',
};

const ECDSA_SIGNATURE_URI: Record<NodeHashName, string> = {
  sha256: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256',
  sha384: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384',
  sha512: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512',
};

const RSA_SHA256_SIGNATURE_URI = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';

/** Clock-skew buffer applied to the signing time (−1 minute). */
const CLOCK_SKEW_BUFFER_MS = -60_000;

const SIGNATURE_ID = 'Signature';
const SIGNED_PROPERTIES_ID = 'SignedProperties';

// ---------------------------------------------------------------------------
// SignatureService
// ---------------------------------------------------------------------------

/**
 * XAdES-B enveloped XML signature service.
 *
 * Produces signatures compatible with the Polish KSeF API.
 *
 * The implementation builds the entire `ds:Signature` element manually,
 * using `xml-crypto`'s {@link ExclusiveCanonicalization} for XML C14N
 * and `node:crypto` for the actual cryptographic signing.
 */
export class SignatureService {
  /**
   * Sign an XML document with an XAdES-B enveloped signature.
   *
   * @param xml          - The XML document to sign (string).
   * @param certPem      - The signing certificate in PEM format.
   * @param privateKeyPem - The private key in PEM format.
   * @param passphrase   - Optional passphrase for encrypted PEM private keys.
   * @returns The signed XML document as a string.
   */
  static sign(xml: string, certPem: string, privateKeyPem: string, passphrase?: string): string {
    if (!xml || !certPem || !privateKeyPem) {
      throw new Error('xml, certPem, and privateKeyPem are required');
    }

    // -- Parse certificate metadata ------------------------------------------
    const certDer = extractDerFromPem(certPem);
    const certBase64 = certDer.toString('base64');

    const x509 = new crypto.X509Certificate(certPem);
    const issuerName = normalizeIssuerDn(x509.issuer);
    const serialNumber = hexSerialToDecimal(x509.serialNumber);

    // -- Determine signature algorithm from private key ----------------------
    const privateKey = crypto.createPrivateKey(
      passphrase ? { key: privateKeyPem, format: 'pem', passphrase } : privateKeyPem,
    );
    const keyType = privateKey.asymmetricKeyType;
    if (keyType !== 'ec' && keyType !== 'rsa') {
      throw new KSeFError(
        `Unsupported private key type: ${keyType ?? 'unknown'}. Supported: RSA and ECDSA.`,
      );
    }
    const isEc = keyType === 'ec';
    const algo = isEc ? pickEcdsaAlgo(privateKey) : pickRsaAlgo();

    // Certificate digest for xades:SigningCertificate/CertDigest uses the same hash as the signature.
    const certDigest = crypto.createHash(algo.nodeHashName).update(certDer).digest('base64');

    // -- Signing time with clock-skew buffer ---------------------------------
    const signingTime = new Date(Date.now() + CLOCK_SKEW_BUFFER_MS).toISOString();

    // -- Parse the input XML document ----------------------------------------
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const root = doc.documentElement;
    if (!root) {
      throw new Error('XML document has no root element');
    }

    // -- Build QualifyingProperties ------------------------------------------
    const qualifyingPropertiesXml = buildQualifyingProperties(
      SIGNATURE_ID,
      SIGNED_PROPERTIES_ID,
      certDigest,
      issuerName,
      serialNumber,
      signingTime,
      algo.digestUri,
    );

    // -- Compute reference digests -------------------------------------------

    // Reference 1: root document with enveloped-signature + exc-c14n transforms
    const rootDigest = computeRootDigest(doc, algo.nodeHashName);

    // Reference 2: SignedProperties with exc-c14n transform
    const signedPropertiesDigest = computeSignedPropertiesDigest(
      qualifyingPropertiesXml,
      algo.nodeHashName,
    );

    // -- Build SignedInfo XML -------------------------------------------------
    const signedInfoXml = buildSignedInfo(
      algo.signatureUri,
      algo.digestUri,
      rootDigest,
      signedPropertiesDigest,
    );

    // -- Canonicalise SignedInfo and sign -------------------------------------
    const signedInfoDoc = parser.parseFromString(signedInfoXml, 'text/xml');
    const canonicalSignedInfo = canonicalize(signedInfoDoc.documentElement!);
    const signatureValue = computeSignatureValue(
      canonicalSignedInfo,
      privateKey,
      isEc,
      algo.nodeHashName,
    );

    // -- Build the complete ds:Signature element -----------------------------
    const signatureXml = buildSignatureElement(
      signedInfoXml,
      signatureValue,
      certBase64,
      qualifyingPropertiesXml,
    );

    // -- Append ds:Signature to the document root ----------------------------
    const signatureDoc = parser.parseFromString(signatureXml, 'text/xml');
    const importedNode = doc.importNode(signatureDoc.documentElement!, true);
    root.appendChild(importedNode);

    return new XMLSerializer().serializeToString(doc);
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * RSA signing always uses SHA-256 — KSeF does not benefit from larger hashes
 * on RSA-2048, which is the minimum and de-facto standard across all
 * reference implementations.
 */
function pickRsaAlgo(): SigningAlgo {
  return {
    nodeHashName: 'sha256',
    signatureUri: RSA_SHA256_SIGNATURE_URI,
    digestUri: DIGEST_URI.sha256,
  };
}

/**
 * Map an ECDSA private key's named curve to the matching hash algorithm
 * per NIST SP 800-57 pairing (and the Java reference implementation).
 *
 *   - prime256v1 (P-256) → SHA-256
 *   - secp384r1  (P-384) → SHA-384
 *   - secp521r1  (P-521) → SHA-512
 *
 * Any other curve throws {@link KSeFError}.
 */
function pickEcdsaAlgo(privateKey: crypto.KeyObject): SigningAlgo {
  const curve = privateKey.asymmetricKeyDetails?.namedCurve;
  switch (curve) {
    case 'prime256v1':
      return {
        nodeHashName: 'sha256',
        signatureUri: ECDSA_SIGNATURE_URI.sha256,
        digestUri: DIGEST_URI.sha256,
      };
    case 'secp384r1':
      return {
        nodeHashName: 'sha384',
        signatureUri: ECDSA_SIGNATURE_URI.sha384,
        digestUri: DIGEST_URI.sha384,
      };
    case 'secp521r1':
      return {
        nodeHashName: 'sha512',
        signatureUri: ECDSA_SIGNATURE_URI.sha512,
        digestUri: DIGEST_URI.sha512,
      };
    default:
      throw new KSeFError(
        `Unsupported ECDSA curve: ${curve ?? 'unknown'}. Supported: P-256 (prime256v1), P-384 (secp384r1), P-521 (secp521r1).`,
      );
  }
}

/**
 * Strip PEM headers/footers and decode the base64 body to a DER Buffer.
 */
function extractDerFromPem(pem: string): Buffer {
  const base64 = pem
    .replace(/-----BEGIN [A-Z\s]+-----/g, '')
    .replace(/-----END [A-Z\s]+-----/g, '')
    .replace(/\s+/g, '');
  return Buffer.from(base64, 'base64');
}

/**
 * Convert a hex-encoded serial number (from `X509Certificate.serialNumber`)
 * to its decimal string representation for use in XML.
 */
function hexSerialToDecimal(hex: string): string {
  return BigInt('0x' + hex).toString(10);
}

/**
 * Normalise the issuer distinguished name to comma-separated RFC 2253 format.
 *
 * Node.js `X509Certificate.issuer` returns newline-separated RDN components
 * (e.g. `"CN=Test\nO=Org\nC=PL"`), whereas the XML signature expects the
 * comma-separated form used by .NET and RFC 2253 (`"CN=Test, O=Org, C=PL"`).
 */
function normalizeIssuerDn(issuer: string): string {
  return issuer
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Exclusive XML canonicalization of a DOM element.
 */
function canonicalize(elem: Element): string {
  const c14n = new ExclusiveCanonicalization();
  return c14n.process(elem, {}) as string;
}

/**
 * Compute the reference digest (base64) of the root document content
 * after applying the enveloped-signature transform and exclusive C14N.
 *
 * The enveloped-signature transform removes any existing `ds:Signature`
 * element from the document before canonicalization. Since we haven't
 * inserted the signature yet, this is effectively just exc-c14n of the root.
 */
function computeRootDigest(doc: Document, hashName: NodeHashName): string {
  const root = doc.documentElement!;
  const canonical = canonicalize(root);
  return crypto.createHash(hashName).update(canonical, 'utf-8').digest('base64');
}

/**
 * Compute the reference digest (base64) of the SignedProperties element
 * after exclusive canonicalization.
 */
function computeSignedPropertiesDigest(
  qualifyingPropertiesXml: string,
  hashName: NodeHashName,
): string {
  const parser = new DOMParser();
  const qpDoc = parser.parseFromString(qualifyingPropertiesXml, 'text/xml');

  // Find the xades:SignedProperties element
  const signedProps = findElementByLocalName(qpDoc.documentElement!, 'SignedProperties');
  if (!signedProps) {
    throw new Error('SignedProperties element not found in QualifyingProperties');
  }

  const canonical = canonicalize(signedProps);
  return crypto.createHash(hashName).update(canonical, 'utf-8').digest('base64');
}

/**
 * Build the `ds:SignedInfo` XML fragment containing both references.
 */
function buildSignedInfo(
  signatureAlgorithm: string,
  digestAlgorithm: string,
  rootDigest: string,
  signedPropertiesDigest: string,
): string {
  return [
    `<ds:SignedInfo xmlns:ds="${DS_NS}">`,
    `<ds:CanonicalizationMethod Algorithm="${EXC_C14N_ALGORITHM}"/>`,
    `<ds:SignatureMethod Algorithm="${signatureAlgorithm}"/>`,

    // Reference 1: root document (enveloped)
    `<ds:Reference URI="">`,
    `<ds:Transforms>`,
    `<ds:Transform Algorithm="${ENVELOPED_SIGNATURE_TRANSFORM}"/>`,
    `<ds:Transform Algorithm="${EXC_C14N_ALGORITHM}"/>`,
    `</ds:Transforms>`,
    `<ds:DigestMethod Algorithm="${digestAlgorithm}"/>`,
    `<ds:DigestValue>${rootDigest}</ds:DigestValue>`,
    `</ds:Reference>`,

    // Reference 2: SignedProperties
    `<ds:Reference URI="#${SIGNED_PROPERTIES_ID}" Type="${SIGNED_PROPERTIES_TYPE}">`,
    `<ds:Transforms>`,
    `<ds:Transform Algorithm="${EXC_C14N_ALGORITHM}"/>`,
    `</ds:Transforms>`,
    `<ds:DigestMethod Algorithm="${digestAlgorithm}"/>`,
    `<ds:DigestValue>${signedPropertiesDigest}</ds:DigestValue>`,
    `</ds:Reference>`,

    `</ds:SignedInfo>`,
  ].join('');
}

/**
 * Cryptographically sign the canonicalized SignedInfo.
 *
 * - RSA: `RSASSA-PKCS1-v1_5` with SHA-256.
 * - ECDSA: hash matches the key's curve (SHA-256/384/512), with IEEE P1363
 *   `R || S` encoding as required by XMLDSig/XAdES.
 */
function computeSignatureValue(
  canonicalSignedInfo: string,
  privateKey: crypto.KeyObject,
  isEc: boolean,
  hashName: NodeHashName,
): string {
  const data = Buffer.from(canonicalSignedInfo, 'utf-8');

  let signature: Buffer;
  if (isEc) {
    signature = crypto.sign(hashName, data, {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    });
  } else {
    signature = crypto.sign(hashName, data, privateKey);
  }

  return signature.toString('base64');
}

/**
 * Build the complete `ds:Signature` XML element containing:
 *   - `ds:SignedInfo` (with references)
 *   - `ds:SignatureValue`
 *   - `ds:KeyInfo` (with X509Data)
 *   - `ds:Object` (with XAdES QualifyingProperties)
 */
function buildSignatureElement(
  signedInfoXml: string,
  signatureValue: string,
  certBase64: string,
  qualifyingPropertiesXml: string,
): string {
  // Wrap the base64 signature value in 76-char lines for readability
  const wrappedSignatureValue = wrapBase64(signatureValue);

  return [
    `<ds:Signature xmlns:ds="${DS_NS}" Id="${SIGNATURE_ID}">`,
    signedInfoXml,
    `<ds:SignatureValue>${wrappedSignatureValue}</ds:SignatureValue>`,
    `<ds:KeyInfo>`,
    `<ds:X509Data>`,
    `<ds:X509Certificate>${certBase64}</ds:X509Certificate>`,
    `</ds:X509Data>`,
    `</ds:KeyInfo>`,
    `<ds:Object>`,
    qualifyingPropertiesXml,
    `</ds:Object>`,
    `</ds:Signature>`,
  ].join('');
}

/**
 * Build the XAdES QualifyingProperties XML fragment.
 *
 * Structure matches the C# reference implementation.
 * Non-prefixed elements (`DigestMethod`, `DigestValue`, `X509IssuerName`,
 * `X509SerialNumber`) use the default `ds` namespace.
 */
function buildQualifyingProperties(
  signatureId: string,
  signedPropertiesId: string,
  certDigest: string,
  issuerName: string,
  serialNumber: string,
  signingTime: string,
  digestAlgorithm: string,
): string {
  return [
    `<xades:QualifyingProperties`,
    ` Target="#${signatureId}"`,
    ` xmlns:xades="${XADES_NS}"`,
    ` xmlns="${DS_NS}">`,
    `<xades:SignedProperties Id="${signedPropertiesId}">`,
    `<xades:SignedSignatureProperties>`,
    `<xades:SigningTime>${signingTime}</xades:SigningTime>`,
    `<xades:SigningCertificate>`,
    `<xades:Cert>`,
    `<xades:CertDigest>`,
    `<DigestMethod Algorithm="${digestAlgorithm}"/>`,
    `<DigestValue>${certDigest}</DigestValue>`,
    `</xades:CertDigest>`,
    `<xades:IssuerSerial>`,
    `<X509IssuerName>${escapeXml(issuerName)}</X509IssuerName>`,
    `<X509SerialNumber>${serialNumber}</X509SerialNumber>`,
    `</xades:IssuerSerial>`,
    `</xades:Cert>`,
    `</xades:SigningCertificate>`,
    `</xades:SignedSignatureProperties>`,
    `</xades:SignedProperties>`,
    `</xades:QualifyingProperties>`,
  ].join('');
}

/**
 * Find a descendant element by its local name (namespace-agnostic).
 */
function findElementByLocalName(root: Element, localName: string): Element | null {
  if (root.localName === localName) return root;
  const children = root.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children.item(i);
    if (child && child.nodeType === 1 /* ELEMENT_NODE */) {
      const found = findElementByLocalName(child as Element, localName);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Escape special XML characters in text content.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wrap a base64 string at 76-character line boundaries.
 */
function wrapBase64(base64: string): string {
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 76) {
    lines.push(base64.substring(i, i + 76));
  }
  return lines.join('\n');
}
