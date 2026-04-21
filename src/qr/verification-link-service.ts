import crypto from 'node:crypto';

export class VerificationLinkService {
  constructor(private readonly baseQrUrl: string) {}

  /**
   * Build invoice verification URL (Code I).
   * Format: {baseQrUrl}/invoice/{NIP}/{DD-MM-YYYY}/{hash_base64url}
   */
  buildInvoiceVerificationUrl(
    nip: string,
    issueDate: Date | string,
    invoiceHashBase64: string,
  ): string {
    const date = typeof issueDate === 'string' ? new Date(issueDate) : issueDate;
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = date.getUTCFullYear();
    const dateStr = `${dd}-${mm}-${yyyy}`;

    const hashBase64Url = this.base64ToBase64Url(invoiceHashBase64);

    return `${this.baseQrUrl}/invoice/${nip}/${dateStr}/${hashBase64Url}`;
  }

  /**
   * Build certificate verification URL (Code II).
   * Format: {baseQrUrl}/certificate/{contextType}/{contextId}/{sellerNip}/{certSerial}/{hash_base64url}/{signature_base64url}
   */
  buildCertificateVerificationUrl(
    contextType: string,
    contextId: string,
    sellerNip: string,
    certSerial: string,
    invoiceHashBase64: string,
    privateKeyPem: string,
    privateKeyPassword?: string,
  ): string {
    const hashBase64Url = this.base64ToBase64Url(invoiceHashBase64);

    const pathWithoutSignature = `${this.baseQrUrl}/certificate/${contextType}/${contextId}/${sellerNip}/${certSerial}/${hashBase64Url}`;

    // Path to sign = full URL without https:// prefix
    const dataToSign = pathWithoutSignature.replace(/^https?:\/\//, '');

    const key =
      privateKeyPassword !== undefined
        ? crypto.createPrivateKey({ key: privateKeyPem, format: 'pem', passphrase: privateKeyPassword })
        : crypto.createPrivateKey(privateKeyPem);
    let signature: Buffer;

    if (key.asymmetricKeyType === 'rsa') {
      signature = crypto.sign('sha256', Buffer.from(dataToSign), {
        key,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: 32,
      });
    } else if (key.asymmetricKeyType === 'ec') {
      signature = crypto.sign('sha256', Buffer.from(dataToSign), {
        key,
        dsaEncoding: 'ieee-p1363',
      });
    } else {
      throw new Error(`Unsupported key type: ${key.asymmetricKeyType}`);
    }

    const signatureBase64Url = signature
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return `${pathWithoutSignature}/${signatureBase64Url}`;
  }

  private base64ToBase64Url(base64: string): string {
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
