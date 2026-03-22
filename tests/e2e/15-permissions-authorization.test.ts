import { describe, it, expect, beforeAll } from 'vitest';
import { authenticateWithCert } from './helpers/auth.js';
import { generateRandomNip } from './helpers/identifiers.js';
import { pollUntil } from './helpers/polling.js';
import type { KSeFClient } from '../../src/client.js';
import type { EntityAuthorizationPermissionType } from '../../src/models/permissions/types.js';

describe('15 - Permissions: Authorization', { timeout: 120_000 }, () => {
  let client: KSeFClient;

  beforeAll(async () => {
    ({ client } = await authenticateWithCert());
  });

  async function grantAndVerifyAuthorization(
    permissionType: EntityAuthorizationPermissionType,
    label: string,
  ) {
    const targetNip = generateRandomNip();
    const description = `E2E auth ${label} ${Date.now()}`;

    // Step 1: Grant authorization
    const grantResp = await client.permissions.grantAuthorizationPermissions({
      subjectIdentifier: { type: 'Nip', value: targetNip },
      permission: permissionType,
      description,
      subjectDetails: { fullName: `E2E ${label} Entity` },
    });
    expect(grantResp.referenceNumber).toBeTruthy();

    // Step 2: Poll for grant completion
    await pollUntil(
      () => client.permissions.getOperationStatus(grantResp.referenceNumber),
      (s) => s.status.code === 200,
      { intervalMs: 2000, maxAttempts: 30, description: `${label} grant operation` },
    );

    // Step 3: Query to find the grant
    const queryResult = await client.permissions.queryAuthorizationsGrants({
      queryType: 'Granted',
    });
    const matchingGrants = queryResult.authorizationGrants.filter(
      (g) => g.description === description,
    );
    expect(matchingGrants.length).toBe(1);
    expect(matchingGrants[0]!.authorizationScope).toBe(permissionType);

    // Step 4: Revoke (uses revokeAuthorizationGrant, NOT revokeCommonGrant)
    const revokeResp = await client.permissions.revokeAuthorizationGrant(matchingGrants[0]!.id);
    expect(revokeResp.referenceNumber).toBeTruthy();
    await pollUntil(
      () => client.permissions.getOperationStatus(revokeResp.referenceNumber),
      (s) => s.status.code === 200,
      { intervalMs: 2000, maxAttempts: 30, description: `revoke ${label} grant` },
    );

    // Step 5: Verify grant is removed
    const afterRevoke = await client.permissions.queryAuthorizationsGrants({
      queryType: 'Granted',
    });
    const remaining = afterRevoke.authorizationGrants.filter(
      (g) => g.description === description,
    );
    expect(remaining.length).toBe(0);
  }

  it('should grant, query, and revoke SelfInvoicing authorization', async () => {
    await grantAndVerifyAuthorization('SelfInvoicing', 'SelfInvoicing');
  });

  it('should grant, query, and revoke TaxRepresentative authorization', async () => {
    await grantAndVerifyAuthorization('TaxRepresentative', 'TaxRepresentative');
  });
});
