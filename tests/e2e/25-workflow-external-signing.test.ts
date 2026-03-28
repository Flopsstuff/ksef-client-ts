import { describe, it, expect } from 'vitest';
import { CertificateService } from '../../src/crypto/certificate-service.js';
import { SignatureService } from '../../src/crypto/signature-service.js';
import { authenticateWithExternalSignature } from '../../src/workflows/auth-workflow.js';
import { createTestClient } from './helpers/auth.js';
import { generateRandomNip } from './helpers/identifiers.js';

async function generateCertAndClient() {
  const nip = generateRandomNip();
  const cert = await CertificateService.generateCompanySeal(
    'E2E Test Company', `VATPL-${nip}`, `E2E Test ${nip}`, 'RSA',
  );
  const client = createTestClient();
  return { client, nip, cert };
}

describe('25 - External Signing Workflow', { timeout: 120_000 }, () => {
  it('should authenticate via external signing with sync callback', async () => {
    const { client, nip, cert } = await generateCertAndClient();

    const result = await authenticateWithExternalSignature(client, {
      contextIdentifier: { type: 'Nip', value: nip },
      signXml: (xml) => SignatureService.sign(xml, cert.certificatePem, cert.privateKeyPem),
      verifyCertificateChain: false,
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.accessTokenValidUntil).toBeTruthy();
    expect(result.refreshTokenValidUntil).toBeTruthy();
  });

  it('should authenticate via external signing with async callback', async () => {
    const { client, nip, cert } = await generateCertAndClient();

    const result = await authenticateWithExternalSignature(client, {
      contextIdentifier: { type: 'Nip', value: nip },
      signXml: async (xml) => {
        await new Promise((r) => setTimeout(r, 50));
        return SignatureService.sign(xml, cert.certificatePem, cert.privateKeyPem);
      },
      verifyCertificateChain: false,
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.accessTokenValidUntil).toBeTruthy();
    expect(result.refreshTokenValidUntil).toBeTruthy();
  });

  it('should allow authenticated API calls after external signing auth', async () => {
    const { client, nip, cert } = await generateCertAndClient();

    const result = await authenticateWithExternalSignature(client, {
      contextIdentifier: { type: 'Nip', value: nip },
      signXml: (xml) => SignatureService.sign(xml, cert.certificatePem, cert.privateKeyPem),
      verifyCertificateChain: false,
    });

    client.authManager.setAccessToken(result.accessToken);
    client.authManager.setRefreshToken(result.refreshToken);

    const grants = await client.permissions.queryPersonalGrants();
    expect(grants).toHaveProperty('permissions');
    expect(Array.isArray(grants.permissions)).toBe(true);
  });
});
