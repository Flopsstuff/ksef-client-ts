import { describe, it, expect, beforeAll } from 'vitest';
import { authenticateWithCert } from './helpers/auth.js';
import { generateRandomNip } from './helpers/identifiers.js';
import { pollUntil } from './helpers/polling.js';
import type { KSeFClient } from '../../src/client.js';

describe('17 - Permissions: Subunit', { timeout: 120_000 }, () => {
  let client: KSeFClient;

  beforeAll(async () => {
    ({ client } = await authenticateWithCert());
  });

  it('should submit subunit grant and track operation status', async () => {
    const adminNip = generateRandomNip();
    const subunitNip = generateRandomNip();
    const description = `E2E subunit ${Date.now()}`;

    // Submit subunit grant (may not succeed without parent-child relationship)
    const grantResp = await client.permissions.grantSubunitPermissions({
      subjectIdentifier: { type: 'Nip', value: adminNip },
      contextIdentifier: { type: 'Nip', value: subunitNip },
      description,
      subjectDetails: {
        subjectDetailsType: 'PersonByIdentifier',
        personById: { firstName: 'Test', lastName: 'Admin' },
      },
    });
    expect(grantResp.referenceNumber).toBeTruthy();

    // Poll until terminal status (>= 200)
    const opResult = await pollUntil(
      () => client.permissions.getOperationStatus(grantResp.referenceNumber),
      (s) => s.status.code >= 200,
      { intervalMs: 2000, maxAttempts: 30, description: 'subunit grant operation' },
    );
    expect(opResult.status.code).toBeGreaterThanOrEqual(200);
    expect(opResult.status.description).toBeTruthy();
  });

  it('should query subunit grants', async () => {
    const result = await client.permissions.querySubunitsGrants({});
    expect(result).toHaveProperty('permissions');
    expect(Array.isArray(result.permissions)).toBe(true);
    expect(result).toHaveProperty('hasMore');
  });

  it('should query subordinate entities roles', async () => {
    const result = await client.permissions.querySubordinateEntitiesRoles({});
    expect(result).toHaveProperty('roles');
    expect(Array.isArray(result.roles)).toBe(true);
    expect(result).toHaveProperty('hasMore');
  });
});
