import { describe, expect, it } from 'vitest';
import { buildAuthTokenRequestXml } from '../../src/client.js';
import { CertificateService } from '../../src/crypto/certificate-service.js';
import { SignatureService } from '../../src/crypto/signature-service.js';
import { createTestClient } from './helpers/auth.js';
import { generateRandomNip } from './helpers/identifiers.js';

describe('39 - Authentication rev2', { timeout: 60_000 }, () => {
  it('returns rev2 authentication status and the current active session', async () => {
    const client = createTestClient();
    const nip = generateRandomNip();
    const cert = await CertificateService.generateCompanySeal(
      'E2E Auth Rev2', `VATPL-${nip}`, `E2E Auth Rev2 ${nip}`, 'RSA',
    );
    const challenge = await client.auth.getChallenge();
    const signedXml = SignatureService.sign(
      buildAuthTokenRequestXml(challenge.challenge, nip),
      cert.certificatePem,
      cert.privateKeyPem,
    );
    const submission = await client.auth.submitXadesAuthRequest(signedXml);
    const authToken = submission.authenticationToken.token;

    let status;
    for (let attempt = 0; attempt < 30; attempt++) {
      status = await client.auth.getAuthStatusRev2(submission.referenceNumber, authToken);
      if (status.status.code !== 100) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    expect(status?.status.code).toBe(200);
    expect(status?.authenticationMethodInfo.category.code).toBe('XadesSignature');
    expect(status).not.toHaveProperty('authenticationMethod');

    const tokens = await client.auth.getAccessToken(authToken);
    client.authManager.setAccessToken(tokens.accessToken.token);
    client.authManager.setRefreshToken(tokens.refreshToken.token);

    const sessions = await client.activeSessions.getActiveSessionsRev2();
    const current = sessions.items.find((session) => session.isCurrent);
    expect(current).toBeDefined();
    expect(current?.referenceNumber).toBeTruthy();
    expect(current?.authenticationMethodInfo.category.code).toBe('XadesSignature');
    expect(current).not.toHaveProperty('authenticationMethod');
  });
});
