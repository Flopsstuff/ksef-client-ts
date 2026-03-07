import { RestClient } from '../http/rest-client.js';
import { RestRequest } from '../http/rest-request.js';
import { Routes } from '../http/routes.js';
import type { PublicKeyCertificateInfo } from '../models/crypto/types.js';

export class CertificateFetcher {
  private readonly restClient: RestClient;
  private symmetricKeyPem: string | undefined;
  private ksefTokenPem: string | undefined;
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

  getSymmetricKeyEncryptionPem(): string {
    if (!this.symmetricKeyPem) {
      throw new Error('CertificateFetcher not initialized. Call init() first.');
    }
    return this.symmetricKeyPem;
  }

  getKsefTokenEncryptionPem(): string {
    if (!this.ksefTokenPem) {
      throw new Error('CertificateFetcher not initialized. Call init() first.');
    }
    return this.ksefTokenPem;
  }

  private async fetchCertificates(): Promise<void> {
    const request = RestRequest.get(Routes.Security.publicKeyCertificates);
    const response = await this.restClient.execute<PublicKeyCertificateInfo[]>(request);
    const certs = response.body;

    if (!certs || certs.length === 0) {
      throw new Error('No public key certificates returned from KSeF API.');
    }

    // Find SymmetricKeyEncryption cert
    const symmetricCert = certs.find(c => c.usage.includes('SymmetricKeyEncryption'));
    if (!symmetricCert) {
      throw new Error('No SymmetricKeyEncryption certificate found.');
    }
    this.symmetricKeyPem = this.derBase64ToPem(symmetricCert.certificate);

    // Find KsefTokenEncryption cert — pick earliest by validFrom (matches Java ref: .min(comparing(validFrom)))
    const tokenCerts = certs
      .filter(c => c.usage.includes('KsefTokenEncryption'))
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    const tokenCert = tokenCerts[0];
    if (!tokenCert) {
      throw new Error('No KsefTokenEncryption certificate found.');
    }
    this.ksefTokenPem = this.derBase64ToPem(tokenCert.certificate);

    this.initialized = true;
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
