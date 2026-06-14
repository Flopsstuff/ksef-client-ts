import { describe, it, expect, beforeAll } from 'vitest';
import { EntityPermissionGrantBuilder } from '../../src/builders/permissions/entity-permission.js';
import { authenticateWithCert } from './helpers/auth.js';
import { generateRandomNip } from './helpers/identifiers.js';
import { pollUntil } from './helpers/polling.js';
import type { KSeFClient } from '../../src/client.js';

describe('14 - Permissions: Entity', { timeout: 120_000 }, () => {
  let client: KSeFClient;

  beforeAll(async () => {
    ({ client } = await authenticateWithCert());
  });

  it('should grant, query, and revoke entity permissions', async () => {
    const targetNip = generateRandomNip();
    const description = `E2E entity perm ${Date.now()}`;

    // Step 1: Grant entity permissions (using builder)
    const grantReq = new EntityPermissionGrantBuilder()
      .withNip(targetNip)
      .addPermission('InvoiceRead')
      .addPermission('InvoiceWrite')
      .withDescription(description)
      .withSubjectDetails({ fullName: 'E2E Test Entity' })
      .build();
    const grantResp = await client.permissions.grantEntityPermissions(grantReq);
    expect(grantResp.referenceNumber).toBeTruthy();

    // Step 2: Poll for grant completion
    await pollUntil(
      () => client.permissions.getOperationStatus(grantResp.referenceNumber),
      (s) => s.status.code === 200,
      { intervalMs: 2000, maxAttempts: 30, description: 'entity grant operation' },
    );

    // Step 3: Query to find the grants (PermissionsGrantedInCurrentContext returns all grants FROM us)
    const queryResult = await client.permissions.queryPersonsGrants({
      queryType: 'PermissionsGrantedInCurrentContext',
    });
    const matchingGrants = queryResult.permissions.filter(
      (p) => p.description === description,
    );
    expect(matchingGrants.length).toBe(2);
    const scopes = matchingGrants.map((g) => g.permissionScope).sort();
    expect(scopes).toEqual(['InvoiceRead', 'InvoiceWrite']);

    // Step 4: Revoke each grant
    for (const grant of matchingGrants) {
      const revokeResp = await client.permissions.revokeCommonGrant(grant.id);
      expect(revokeResp.referenceNumber).toBeTruthy();
      await pollUntil(
        () => client.permissions.getOperationStatus(revokeResp.referenceNumber),
        (s) => s.status.code === 200,
        { intervalMs: 2000, maxAttempts: 30, description: `revoke entity grant ${grant.id}` },
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
});
