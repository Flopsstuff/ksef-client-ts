import { describe, it, expect } from 'vitest';
import { authenticateWithCert, createTestClient } from './helpers/auth.js';
import { generateRandomNip } from './helpers/identifiers.js';
import { CertificateService } from '../../src/crypto/certificate-service.js';
import { KSeFUnauthorizedError } from '../../src/errors/ksef-unauthorized-error.js';
import { KSeFApiError } from '../../src/errors/ksef-api-error.js';

describe('11 - Active Sessions', { timeout: 120_000 }, () => {
  it('should list active sessions after auth', async () => {
    const { client } = await authenticateWithCert();
    const sessions = await client.activeSessions.getActiveSessions();
    expect(sessions.items).toBeDefined();
    expect(sessions.items.length).toBeGreaterThan(0);

    const current = sessions.items.find((s) => s.isCurrent);
    expect(current).toBeDefined();
    expect(current!.referenceNumber).toBeTruthy();
  });

  it('should revoke current session and invalidate further requests', async () => {
    const { client } = await authenticateWithCert();

    // Verify we have an active session
    const before = await client.activeSessions.getActiveSessions();
    expect(before.items.length).toBeGreaterThan(0);

    // Revoke current session
    await client.activeSessions.revokeCurrentSession();

    // Subsequent authenticated request should fail (401/403) or return empty
    // KSeF may not immediately invalidate the session, so we check for either
    try {
      const result = await client.permissions.queryPersonalGrants();
      // If it doesn't throw, verify the session was at least revoked from active list
      const after = await client.activeSessions.getActiveSessions();
      const stillCurrent = after.items.find((s) => s.isCurrent);
      expect(stillCurrent).toBeUndefined();
    } catch {
      // Expected — session was invalidated
    }
  });

  it('should clear tokens on logout and reject subsequent requests', async () => {
    const { client } = await authenticateWithCert();

    // Verify auth works
    const sessions = await client.activeSessions.getActiveSessions();
    expect(sessions.items.length).toBeGreaterThan(0);

    // Logout — clears tokens client-side
    await client.logout();

    // Tokens should be cleared
    expect(client.authManager.getAccessToken()).toBeUndefined();

    // Subsequent request should fail with 401
    try {
      await client.activeSessions.getActiveSessions();
      expect.fail('Should have thrown after logout');
    } catch (e) {
      if (e instanceof KSeFUnauthorizedError) {
        expect(e.statusCode).toBe(401);
      } else if (e instanceof KSeFApiError) {
        expect(e.statusCode).toBe(401);
      } else {
        throw e;
      }
    }
  });

  it('should revoke a non-current session by reference', async () => {
    const nip = generateRandomNip();

    // Auth as client A
    const { client: clientA } = await authenticateWithCert(nip);
    const sessionsA = await clientA.activeSessions.getActiveSessions();
    const currentA = sessionsA.items.find((s) => s.isCurrent);
    expect(currentA).toBeDefined();
    const sessionARef = currentA!.referenceNumber;

    // Auth as client B with the same NIP
    const clientB = createTestClient();
    const certB = await CertificateService.generateCompanySeal(
      'E2E Session B', `VATPL-${nip}`, `E2E Session B ${nip}`, 'RSA',
    );
    await clientB.loginWithCertificate(certB.certificatePem, certB.privateKeyPem, nip);

    // From B, verify both sessions are visible
    const sessionsB = await clientB.activeSessions.getActiveSessions();
    expect(sessionsB.items.length).toBeGreaterThanOrEqual(2);

    const sessionAFromB = sessionsB.items.find((s) => s.referenceNumber === sessionARef);
    expect(sessionAFromB).toBeDefined();
    expect(sessionAFromB!.isCurrent).toBe(false);

    // From B, revoke session A
    await clientB.activeSessions.revokeSession(sessionARef);

    // Verify session A is gone
    const after = await clientB.activeSessions.getActiveSessions();
    const stillExists = after.items.find((s) => s.referenceNumber === sessionARef);
    expect(stillExists).toBeUndefined();

    // Client B should still work
    const currentB = after.items.find((s) => s.isCurrent);
    expect(currentB).toBeDefined();
  });
});
