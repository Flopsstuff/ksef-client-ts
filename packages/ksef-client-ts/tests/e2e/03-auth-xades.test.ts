import { describe, it, expect } from 'vitest';
import { CertificateService } from '../../src/crypto/certificate-service.js';
import { SignatureService } from '../../src/crypto/signature-service.js';
import { AuthTokenRequestBuilder } from '../../src/builders/auth-token-request.js';
import type { AuthTokenRequest } from '../../src/models/auth/types.js';
import { createTestClient } from './helpers/auth.js';
import { generateRandomNip } from './helpers/identifiers.js';

const NIP = generateRandomNip();

function serializeAuthTokenRequest(req: AuthTokenRequest): string {
  const ns = 'http://ksef.mf.gov.pl/auth/token/2.1';
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

describe('03 - XAdES Certificate Authentication', { timeout: 60_000 }, () => {
  const client = createTestClient();

  it('should generate a self-signed RSA certificate', async () => {
    const cert = await CertificateService.generatePersonalCertificate(
      'Jan', 'Kowalski', NIP, `Test KSeF CLI - ${NIP}`, 'RSA',
    );
    expect(cert.certificatePem).toContain('BEGIN CERTIFICATE');
    expect(cert.privateKeyPem).toContain('BEGIN PRIVATE KEY');
    expect(cert.fingerprint).toMatch(/^[a-fA-F0-9]{64}$/);
  });

  it('should generate a self-signed ECDSA certificate', async () => {
    const cert = await CertificateService.generatePersonalCertificate(
      'Jan', 'Kowalski', NIP, `Test KSeF CLI - ${NIP}`, 'ECDSA',
    );
    expect(cert.certificatePem).toContain('BEGIN CERTIFICATE');
    expect(cert.privateKeyPem).toContain('BEGIN PRIVATE KEY');
  });

  it('should get challenge and build a signed XAdES auth request', async () => {
    const cert = await CertificateService.generatePersonalCertificate(
      'Jan', 'Kowalski', NIP, `Test KSeF CLI - ${NIP}`, 'RSA',
    );

    const challenge = await client.auth.getChallenge();
    expect(challenge.challenge).toBeTruthy();
    expect(challenge.timestamp).toBeTruthy();

    const authRequest = new AuthTokenRequestBuilder()
      .withChallenge(challenge.challenge)
      .withContextNip(NIP)
      .withSubjectType('Fingerprint')
      .build();

    const xml = serializeAuthTokenRequest(authRequest);
    expect(xml).toContain('<Challenge>');
    expect(xml).toContain(`<Nip>${NIP}</Nip>`);

    const signedXml = SignatureService.sign(xml, cert.certificatePem, cert.privateKeyPem);
    expect(signedXml).toContain('ds:Signature');
    expect(signedXml).toContain('ds:SignatureValue');
    expect(signedXml).toContain('ds:X509Certificate');
  });

  it('should generate a company seal certificate', async () => {
    const cert = await CertificateService.generateCompanySeal(
      'Testowa Firma sp. z o.o.',
      `VATPL-${NIP}`,
      'Testowa Firma',
      'RSA',
    );
    expect(cert.certificatePem).toContain('BEGIN CERTIFICATE');
    expect(cert.privateKeyPem).toContain('BEGIN PRIVATE KEY');
  });

  it('should complete full XAdES auth via loginWithCertificate (self-signed, zero secrets)', async () => {
    const freshClient = createTestClient();
    const testNip = generateRandomNip();
    const cert = await CertificateService.generateCompanySeal(
      'E2E Test Company', `VATPL-${testNip}`, `E2E Test ${testNip}`, 'RSA',
    );

    await freshClient.loginWithCertificate(cert.certificatePem, cert.privateKeyPem, testNip);

    // Verify by making an authenticated request
    const grants = await freshClient.permissions.queryPersonalGrants();
    expect(grants).toHaveProperty('permissions');
  });

  it('should complete full XAdES auth via loginWithCertificate with ECDSA key', async () => {
    const freshClient = createTestClient();
    const testNip = generateRandomNip();
    const cert = await CertificateService.generateCompanySeal(
      'E2E ECDSA Company', `VATPL-${testNip}`, `E2E ECDSA Test ${testNip}`, 'ECDSA',
    );

    await freshClient.loginWithCertificate(cert.certificatePem, cert.privateKeyPem, testNip);

    // Verify by making an authenticated request
    const grants = await freshClient.permissions.queryPersonalGrants();
    expect(grants).toHaveProperty('permissions');
  });
});
