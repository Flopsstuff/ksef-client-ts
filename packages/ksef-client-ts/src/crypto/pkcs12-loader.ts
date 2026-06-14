import forge from 'node-forge';

export interface Pkcs12Result {
  certificatePem: string;
  privateKeyPem: string;
}

export class Pkcs12Loader {
  static load(p12: Buffer | Uint8Array, password: string): Pkcs12Result {
    const { pki, pkcs12, asn1 } = forge;

    const p12Der = Buffer.from(p12).toString('binary');
    const p12Asn1 = asn1.fromDer(p12Der);
    const p12Parsed = pkcs12.pkcs12FromAsn1(p12Asn1, password);

    // Extract certificate
    const certBagType = pki.oids.certBag!;
    const certBags = p12Parsed.getBags({ bagType: certBagType });
    const certs = certBags[certBagType];
    if (!certs || certs.length === 0) {
      throw new Error('PKCS#12 file does not contain a certificate.');
    }

    // Extract private key (try shrouded first, then plain)
    const shroudedType = pki.oids.pkcs8ShroudedKeyBag!;
    let keyBags = p12Parsed.getBags({ bagType: shroudedType });
    let keys = keyBags[shroudedType];

    if (!keys || keys.length === 0) {
      const plainType = pki.oids.keyBag!;
      keyBags = p12Parsed.getBags({ bagType: plainType });
      keys = keyBags[plainType];
    }

    if (!keys || keys.length === 0) {
      throw new Error('PKCS#12 file does not contain a private key.');
    }

    const cert = certs[0]!.cert;
    const key = keys[0]!.key;

    if (!cert) {
      throw new Error('PKCS#12 certificate bag is empty.');
    }
    if (!key) {
      throw new Error('PKCS#12 key bag is empty.');
    }

    const certificatePem = pki.certificateToPem(cert);

    let privateKeyPem: string;
    try {
      privateKeyPem = pki.privateKeyToPem(key);
    } catch {
      throw new Error(
        'Failed to export private key from PKCS#12 to PEM. ' +
        'This can happen with EC keys. Use separate --cert and --key PEM files instead.',
      );
    }

    return { certificatePem, privateKeyPem };
  }
}
