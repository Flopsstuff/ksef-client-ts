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
    if (Number.isNaN(date.getTime())) {
      throw new Error(
        `Invalid issueDate for verification URL: ${JSON.stringify(issueDate)} (expected a parseable date, e.g. "2026-06-08").`,
      );
    }
    // A day that does not exist does not fail to parse — it rolls forward, so
    // "2026-02-30" becomes 2026-03-02 and the code would verify a different
    // issue date than the invoice carries, visible only to whoever scans it.
    //
    // The written calendar fields are checked on their own terms rather than
    // against the parsed UTC date: with an offset the two legitimately differ
    // ("2026-01-01T00:30:00+01:00" is 2025-12-31 in UTC), so comparing them
    // would refuse real dates. This holds for a bare date and a timestamp
    // alike. A Date the caller built has no written form to check.
    if (typeof issueDate === 'string') {
      const written = /^(\d{4})-(\d{2})-(\d{2})/.exec(issueDate.trim());
      if (written) {
        const [year, month, day] = written.slice(1).map(Number) as [number, number, number];
        const asUtc = new Date(Date.UTC(year, month - 1, day));
        const real =
          asUtc.getUTCFullYear() === year &&
          asUtc.getUTCMonth() === month - 1 &&
          asUtc.getUTCDate() === day;
        if (!real) {
          throw new Error(
            `Invalid issueDate for verification URL: ${JSON.stringify(issueDate)} is not a real calendar date ` +
              `(there is no ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}).`,
          );
        }
      }
    }
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
