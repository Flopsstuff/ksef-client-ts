import { describe, it, expect } from 'vitest';
import { CertificateService } from '../../src/crypto/certificate-service.js';
import { authenticateWithCertificate } from '../../src/workflows/auth-workflow.js';
import { createTestClient } from './helpers/auth.js';
import { generateRandomNip } from './helpers/identifiers.js';

describe('20 - Auth Workflow', { timeout: 60_000 }, () => {
  it('should return AuthResult with tokens and expiration dates', async () => {
    const client = createTestClient();
    const nip = generateRandomNip();
    const cert = await CertificateService.generateCompanySeal(
      'E2E Test Company', `VATPL-${nip}`, `E2E Test ${nip}`, 'RSA',
    );

    const result = await authenticateWithCertificate(client, {
      nip,
      certPem: cert.certificatePem,
      keyPem: cert.privateKeyPem,
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.accessTokenValidUntil).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.refreshTokenValidUntil).toBeTruthy();

    // Verify client is authenticated
    const grants = await client.permissions.queryPersonalGrants();
    expect(grants).toHaveProperty('permissions');
    expect(Array.isArray(grants.permissions)).toBe(true);
  });

  it('should accept custom pollOptions', async () => {
    const client = createTestClient();
    const nip = generateRandomNip();
    const cert = await CertificateService.generateCompanySeal(
      'E2E Test Company', `VATPL-${nip}`, `E2E Test ${nip}`, 'RSA',
    );

    const result = await authenticateWithCertificate(client, {
      nip,
      certPem: cert.certificatePem,
      keyPem: cert.privateKeyPem,
      pollOptions: { intervalMs: 3000, maxAttempts: 20 },
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });
});
