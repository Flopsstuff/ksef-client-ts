import { describe, it, expect, beforeAll } from 'vitest';
import { authenticateWithCert } from './helpers/auth.js';
import { generateRandomNip, generateFingerprint, generateNipVatUe } from './helpers/identifiers.js';
import { pollUntil } from './helpers/polling.js';
import type { KSeFClient } from '../../src/client.js';

describe('16 - Permissions: EU Entity', { timeout: 120_000 }, () => {
  let client: KSeFClient;

  beforeAll(async () => {
    ({ client } = await authenticateWithCert());
  });

  it('should submit EU entity admin grant and track operation status', async () => {
    const nip = generateRandomNip();
    const fingerprint = generateFingerprint(nip);
    const nipVatUe = generateNipVatUe(nip);
    const description = `E2E eu admin ${Date.now()}`;

    // Submit grant (may be rejected for random NIP without EU entity setup)
    const grantResp = await client.permissions.grantEuEntityAdminPermissions({
      subjectIdentifier: { type: 'Fingerprint', value: fingerprint },
      contextIdentifier: { type: 'NipVatUe', value: nipVatUe },
      description,
      euEntityName: 'E2E Test EU Entity',
      subjectDetails: {
        subjectDetailsType: 'EntityByFingerprint',
        entityByFp: { fullName: 'E2E EU Subject', address: 'Test Address 123' },
      },
      euEntityDetails: { fullName: 'E2E EU Entity Name', address: 'EU Address 456' },
    });
    expect(grantResp.referenceNumber).toBeTruthy();

    // Poll until terminal status (>= 200)
    const opResult = await pollUntil(
      () => client.permissions.getOperationStatus(grantResp.referenceNumber),
      (s) => s.status.code >= 200,
      { intervalMs: 2000, maxAttempts: 30, description: 'EU entity admin grant' },
    );
    expect(opResult.status.code).toBeGreaterThanOrEqual(200);
    expect(opResult.status.description).toBeTruthy();

    // If grant succeeded, query and cleanup
    if (opResult.status.code === 200) {
      const queryResult = await client.permissions.queryEuEntitiesGrants({
        authorizedFingerprintIdentifier: fingerprint,
      });
      const matchingGrants = queryResult.permissions.filter(
        (p) => p.description === description,
      );
      expect(matchingGrants.length).toBeGreaterThanOrEqual(1);

      // Cleanup
      for (const grant of matchingGrants) {
        const resp = await client.permissions.revokeCommonGrant(grant.id);
        await pollUntil(
          () => client.permissions.getOperationStatus(resp.referenceNumber),
          (s) => s.status.code >= 200,
          { intervalMs: 2000, maxAttempts: 30, description: `cleanup EU grant ${grant.id}` },
        );
      }
    }
  });

  it('should query EU entity grants', async () => {
    const result = await client.permissions.queryEuEntitiesGrants({});
    expect(result).toHaveProperty('permissions');
    expect(Array.isArray(result.permissions)).toBe(true);
    expect(result).toHaveProperty('hasMore');
  });
});
