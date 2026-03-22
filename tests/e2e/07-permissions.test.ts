import { describe, it, expect, beforeAll } from 'vitest';
import { authenticateWithCert } from './helpers/auth.js';
import { generateRandomPesel } from './helpers/identifiers.js';
import { pollUntil } from './helpers/polling.js';
import type { KSeFClient } from '../../src/client.js';

describe('07 - Permissions', { timeout: 120_000 }, () => {
  let client: KSeFClient;

  beforeAll(async () => {
    ({ client } = await authenticateWithCert());
  });

  it('should query personal grants', async () => {
    const result = await client.permissions.queryPersonalGrants();
    expect(result).toHaveProperty('permissions');
    expect(Array.isArray(result.permissions)).toBe(true);
    expect(result).toHaveProperty('hasMore');
  });

  it('should grant, query, and revoke person permissions', async () => {
    const targetPesel = generateRandomPesel();
    const description = `E2E test ${Date.now()}`;

    // Step 1: Grant permissions
    const grantResp = await client.permissions.grantPersonPermissions({
      subjectIdentifier: { type: 'Pesel', value: targetPesel },
      permissions: ['InvoiceRead', 'InvoiceWrite'],
      description,
      subjectDetails: {
        subjectDetailsType: 'PersonByIdentifier',
        personById: { firstName: 'Test', lastName: 'Person' },
      },
    });
    expect(grantResp.referenceNumber).toBeTruthy();

    // Step 2: Poll for grant completion
    await pollUntil(
      () => client.permissions.getOperationStatus(grantResp.referenceNumber),
      (s) => s.status.code === 200,
      { intervalMs: 2000, maxAttempts: 30, description: 'grant operation' },
    );

    // Step 3: Query to find the grants
    const queryResult = await client.permissions.queryPersonsGrants({
      queryType: 'PermissionsGrantedInCurrentContext',
    });
    const matchingGrants = queryResult.permissions.filter(
      (p) => p.description === description,
    );
    expect(matchingGrants.length).toBe(2); // InvoiceRead + InvoiceWrite

    // Step 4: Revoke each grant
    for (const grant of matchingGrants) {
      const revokeResp = await client.permissions.revokeCommonGrant(grant.id);
      expect(revokeResp.referenceNumber).toBeTruthy();
      await pollUntil(
        () => client.permissions.getOperationStatus(revokeResp.referenceNumber),
        (s) => s.status.code === 200,
        { intervalMs: 2000, maxAttempts: 30, description: `revoke grant ${grant.id}` },
      );
    }

    // Step 5: Verify grants are removed
    const afterRevoke = await client.permissions.queryPersonsGrants({
      queryType: 'PermissionsGrantedInCurrentContext',
    });
    const remaining = afterRevoke.permissions.filter(
      (p) => p.description === description,
    );
    expect(remaining.length).toBe(0);
  });

  it('should query entities roles', async () => {
    const result = await client.permissions.queryEntitiesRoles();
    expect(result).toHaveProperty('roles');
    expect(Array.isArray(result.roles)).toBe(true);
    expect(result).toHaveProperty('hasMore');
  });

  it('should get attachment status', async () => {
    const result = await client.permissions.getAttachmentStatus();
    expect(result).toHaveProperty('isAttachmentAllowed');
  });
});
