import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type {
  PublicKeyCertificate,
  PublicKeyCertificateUsage,
} from '../models/crypto/types.js';

/** A selected encryption certificate: its PEM plus the key-rotation selector. */
export interface SelectedCertificate {
  readonly pem: string;
  readonly publicKeyId: string;
}

export class CertificateFetcher {
  private readonly restClient: RestClient;
  private symmetricKey: SelectedCertificate | undefined;
  private ksefToken: SelectedCertificate | undefined;
  private initialized = false;

  constructor(restClient: RestClient) {
    this.restClient = restClient;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.fetchCertificates();
  }

  async refresh(): Promise<void> {
    this.initialized = false;
    await this.fetchCertificates();
  }

  /**
   * Immutable snapshot ({@link SelectedCertificate}) of the selected
   * SymmetricKeyEncryption certificate. The stored object is replaced wholesale
   * by {@link refresh}, never mutated, so holding the returned reference yields a
   * consistent pem + publicKeyId pair even if a concurrent refresh swaps the cache.
   */
  getSymmetricKeyEncryption(): Readonly<SelectedCertificate> {
    return { ...this.requireSelected(this.symmetricKey) };
  }

  /** Immutable snapshot of the selected KsefTokenEncryption certificate. See {@link getSymmetricKeyEncryption}. */
  getKsefTokenEncryption(): Readonly<SelectedCertificate> {
    return { ...this.requireSelected(this.ksefToken) };
  }

  getSymmetricKeyEncryptionPem(): string {
    return this.requireSelected(this.symmetricKey).pem;
  }

  getKsefTokenEncryptionPem(): string {
    return this.requireSelected(this.ksefToken).pem;
  }

  /** Public key identifier of the selected SymmetricKeyEncryption certificate (KSeF API v2.5.0). */
  getSymmetricKeyPublicKeyId(): string {
    return this.requireSelected(this.symmetricKey).publicKeyId;
  }

  /** Public key identifier of the selected KsefTokenEncryption certificate (KSeF API v2.5.0). */
  getKsefTokenPublicKeyId(): string {
    return this.requireSelected(this.ksefToken).publicKeyId;
  }

  private requireSelected(selected: SelectedCertificate | undefined): SelectedCertificate {
    if (!selected) {
      throw new Error('CertificateFetcher not initialized. Call init() first.');
    }
    return selected;
  }

  private async fetchCertificates(): Promise<void> {
    const request = RestRequest.get(Routes.Security.publicKeyCertificates);
    const response = await this.restClient.execute<PublicKeyCertificate[]>(request);
    const certs = response.body;

    if (!certs || certs.length === 0) {
      throw new Error('No public key certificates returned from KSeF API.');
    }

    this.symmetricKey = this.select(certs, 'SymmetricKeyEncryption');
    this.ksefToken = this.select(certs, 'KsefTokenEncryption');

    this.initialized = true;
  }

  /**
   * Select the certificate to use for a given usage under key rotation:
   * filter to currently-valid certificates (validFrom ≤ now < validTo) and pick
   * the newest by validFrom. If none are currently valid, fall back to the newest
   * overall so the server can reject it with a clear error rather than sending nothing.
   */
  private select(
    certs: PublicKeyCertificate[],
    usage: PublicKeyCertificateUsage,
  ): SelectedCertificate {
    const candidates = certs.filter(c => c.usage.includes(usage));
    if (candidates.length === 0) {
      throw new Error(`No ${usage} certificate found.`);
    }

    const now = Date.now();
    const byNewestValidFrom = (a: PublicKeyCertificate, b: PublicKeyCertificate) =>
      Date.parse(b.validFrom) - Date.parse(a.validFrom);

    const valid = candidates
      .filter(c => Date.parse(c.validFrom) <= now && now < Date.parse(c.validTo))
      .sort(byNewestValidFrom);

    const chosen = valid[0] ?? [...candidates].sort(byNewestValidFrom)[0]!;
    return { pem: this.derBase64ToPem(chosen.certificate), publicKeyId: chosen.publicKeyId };
  }

  private derBase64ToPem(base64Der: string): string {
    // Wrap base64 DER in PEM headers with 64-char line breaks
    const lines: string[] = [];
    for (let i = 0; i < base64Der.length; i += 64) {
      lines.push(base64Der.substring(i, i + 64));
    }
    return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
  }
}
