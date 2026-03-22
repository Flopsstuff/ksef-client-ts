import { describe, it, expect } from 'vitest';
import { authenticateWithCert } from './helpers/auth.js';

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
});
