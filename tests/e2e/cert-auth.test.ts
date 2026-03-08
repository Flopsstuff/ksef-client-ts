import { describe, it, expect } from 'vitest';
import { KSeFClient } from '../../src/client.js';
import { CertificateService } from '../../src/crypto/certificate-service.js';
import { SignatureService } from '../../src/crypto/signature-service.js';
import { AuthTokenRequestBuilder } from '../../src/builders/auth-token-request.js';
import type { AuthTokenRequest } from '../../src/models/auth/types.js';

const NIP = process.env.KSEF_NIP ?? '9999999999';

function serializeAuthTokenRequest(req: AuthTokenRequest): string {
  const ns = 'http://ksef.mf.gov.pl/auth/token/2.0';
  const ctx = `<${req.contextIdentifier.type}>${req.contextIdentifier.value}</${req.contextIdentifier.type}>`;

  let policy = '';
  if (req.authorizationPolicy?.allowedIps) {
    const ips = req.authorizationPolicy.allowedIps;
    const parts: string[] = [];
    for (const addr of ips.ip4Addresses ?? []) parts.push(`<Ip4Address>${addr}</Ip4Address>`);
    for (const range of ips.ip4Ranges ?? []) parts.push(`<Ip4Range>${range}</Ip4Range>`);
    for (const mask of ips.ip4Masks ?? []) parts.push(`<Ip4Mask>${mask}</Ip4Mask>`);
    if (parts.length > 0) {
      policy = `<AuthorizationPolicy><AllowedIps>${parts.join('')}</AllowedIps></AuthorizationPolicy>`;
    }
  }

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<AuthTokenRequest xmlns="${ns}">`,
    `<Challenge>${req.challenge}</Challenge>`,
    `<ContextIdentifier>${ctx}</ContextIdentifier>`,
    `<SubjectIdentifierType>${req.subjectIdentifierType}</SubjectIdentifierType>`,
    policy,
    `</AuthTokenRequest>`,
  ].filter(Boolean).join('');
}

describe('Certificate auth e2e', { timeout: 60_000 }, () => {
  const client = new KSeFClient({ environment: 'TEST' });

  it('should generate a self-signed certificate', async () => {
    const cert = await CertificateService.generatePersonalCertificate(
      'Jan', 'Kowalski', NIP, `Test KSeF CLI - ${NIP}`, 'RSA',
    );

    expect(cert.certificatePem).toContain('BEGIN CERTIFICATE');
    expect(cert.privateKeyPem).toContain('BEGIN PRIVATE KEY');
    expect(cert.fingerprint).toMatch(/^[a-fA-F0-9]{64}$/);
  });

  it('should get challenge and build a signed XAdES auth request', async () => {
    // 1. Generate certificate
    const cert = await CertificateService.generatePersonalCertificate(
      'Jan', 'Kowalski', NIP, `Test KSeF CLI - ${NIP}`, 'RSA',
    );

    // 2. Get challenge
    const challenge = await client.auth.getChallenge();
    expect(challenge.challenge).toBeTruthy();
    expect(challenge.timestamp).toBeTruthy();

    // 3. Build and sign AuthTokenRequest XML
    const authRequest = new AuthTokenRequestBuilder()
      .withChallenge(challenge.challenge)
      .withContextNip(NIP)
      .withSubjectType('certificateFingerprint')
      .build();

    const xml = serializeAuthTokenRequest(authRequest);
    expect(xml).toContain('<Challenge>');
    expect(xml).toContain(`<Nip>${NIP}</Nip>`);

    const signedXml = SignatureService.sign(xml, cert.certificatePem, cert.privateKeyPem);
    expect(signedXml).toContain('ds:Signature');
    expect(signedXml).toContain('ds:SignatureValue');
    expect(signedXml).toContain('ds:X509Certificate');
  });
});
