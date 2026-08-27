import { describe, it, expect, beforeAll } from 'vitest';
import { authenticateWithCert, createTestClient } from './helpers/auth.js';
import { generateRandomNip } from './helpers/identifiers.js';
import { pollUntil } from './helpers/polling.js';
import type { KSeFClient } from '../../src/client.js';

describe('02 - Token Authentication', { timeout: 60_000 }, () => {
  let generatedToken: string;
  let nip: string;

  // Bootstrap: cert auth → generate token → use it in tests below
  beforeAll(async () => {
    const { client, nip: certNip } = await authenticateWithCert();
    nip = certNip;
    const resp = await client.tokens.generateToken({
      description: `E2E bootstrap token ${Date.now()}`,
      permissions: ['InvoiceRead', 'InvoiceWrite'],
    });

    // A freshly minted token starts out Pending, and authenticating with it
    // before KSeF activates it fails with 450 "błędny token". Wait for Active
    // rather than letting whichever test runs first lose that race.
    await pollUntil(
      async () => {
        const status = await client.tokens.getToken(resp.referenceNumber);
        if (status.status === 'Failed' || status.status === 'Revoked') {
          throw new Error(
            `Bootstrap token ${resp.referenceNumber} ended as ${status.status}: ` +
            `${status.statusDetails?.join('; ') ?? 'no details'}`,
          );
        }
        return status;
      },
      (status) => status.status === 'Active',
      { intervalMs: 1000, maxAttempts: 20, description: 'bootstrap token activation' },
    );

    generatedToken = resp.token;
  }, 30_000);

  it('should get auth challenge', async () => {
    const client = createTestClient();
    const challenge = await client.auth.getChallenge();
    expect(challenge.challenge).toBeTruthy();
    expect(challenge.timestamp).toBeTruthy();
    expect(typeof challenge.timestampMs).toBe('number');
    expect(challenge.clientIp).toBeTruthy();
  });

  it('should complete full token auth flow via loginWithToken', async () => {
    const client = createTestClient();
    await client.loginWithToken(generatedToken, nip);

    // Verify auth succeeded by making an authenticated request
    const grants = await client.permissions.queryPersonalGrants();
    expect(grants).toHaveProperty('permissions');
    expect(Array.isArray(grants.permissions)).toBe(true);
  });

  it('should complete manual step-by-step token auth flow', async () => {
    const client = createTestClient();

    // Step 1: Challenge
    const challenge = await client.auth.getChallenge();
    expect(challenge.challenge).toBeTruthy();

    // Step 2: Init crypto
    await client.crypto.init();

    // Step 3: Encrypt token
    const encrypted = await client.crypto.encryptKsefToken(generatedToken, challenge.timestamp);
    const encryptedBase64 = Buffer.from(encrypted).toString('base64');
    expect(encryptedBase64).toBeTruthy();

    // Step 4: Submit
    const submitResult = await client.auth.submitKsefTokenAuthRequest({
      challenge: challenge.challenge,
      contextIdentifier: { type: 'Nip', value: nip },
      encryptedToken: encryptedBase64,
    });
    expect(submitResult.referenceNumber).toBeTruthy();
    expect(submitResult.authenticationToken.token).toBeTruthy();

    // Step 5: Poll until auth is ready
    const authToken = submitResult.authenticationToken.token;
    for (let i = 0; i < 30; i++) {
      const status = await client.auth.getAuthStatus(submitResult.referenceNumber, authToken);
      if (status.status.code === 200) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Step 6: Get access token
    const tokens = await client.auth.getAccessToken(authToken);
    expect(tokens.accessToken.token).toBeTruthy();
    expect(tokens.refreshToken.token).toBeTruthy();
  });

  it('should refresh access token', async () => {
    const client = createTestClient();
    await client.loginWithToken(generatedToken, nip);

    const refreshToken = client.authManager.getRefreshToken()!;
    expect(refreshToken).toBeTruthy();

    const refreshResult = await client.auth.refreshAccessToken(refreshToken);
    expect(refreshResult.accessToken.token).toBeTruthy();
  });
});
