import { describe, it, expect, beforeAll } from 'vitest';
import { authenticateWithCert } from './helpers/auth.js';
import { generateRandomNip, generateRandomPesel } from './helpers/identifiers.js';
import { pollUntil } from './helpers/polling.js';
import type { KSeFClient } from '../../src/client.js';

describe('18 - Permissions: Indirect', { timeout: 120_000 }, () => {
  let client: KSeFClient;

  beforeAll(async () => {
    ({ client } = await authenticateWithCert());
  });

  it('should grant, query, and revoke indirect permissions with NIP target', async () => {
    const subjectNip = generateRandomNip();
    const targetNip = generateRandomNip();
    const description = `E2E indirect nip ${Date.now()}`;

    // Step 1: Grant indirect permissions
    const grantResp = await client.permissions.grantIndirectPermissions({
      subjectIdentifier: { type: 'Nip', value: subjectNip },
      targetIdentifier: { type: 'Nip', value: targetNip },
      permissions: ['InvoiceWrite'],
      description,
      subjectDetails: {
        subjectDetailsType: 'PersonByIdentifier',
        personById: { firstName: 'Test', lastName: 'Indirect' },
      },
    });
    expect(grantResp.referenceNumber).toBeTruthy();

    // Step 2: Poll for grant completion
    await pollUntil(
      () => client.permissions.getOperationStatus(grantResp.referenceNumber),
      (s) => s.status.code === 200,
      { intervalMs: 2000, maxAttempts: 30, description: 'indirect grant operation' },
    );

    // Step 3: Query grants from current context to find the indirect grant
    const queryResult = await client.permissions.queryPersonsGrants({
      queryType: 'PermissionsGrantedInCurrentContext',
    });
    const matchingGrants = queryResult.permissions.filter(
      (p) => p.description === description,
    );
    expect(matchingGrants.length).toBe(1);

    // Step 4: Revoke
    const revokeResp = await client.permissions.revokeCommonGrant(matchingGrants[0]!.id);
    expect(revokeResp.referenceNumber).toBeTruthy();
    await pollUntil(
      () => client.permissions.getOperationStatus(revokeResp.referenceNumber),
      (s) => s.status.code === 200,
      { intervalMs: 2000, maxAttempts: 30, description: 'revoke indirect grant' },
    );

    // Step 5: Verify removed
    const afterRevoke = await client.permissions.queryPersonsGrants({
      queryType: 'PermissionsGrantedInCurrentContext',
    });
    const remaining = afterRevoke.permissions.filter(
      (p) => p.description === description,
    );
    expect(remaining.length).toBe(0);
  });

  it('should grant indirect permissions with AllPartners target', async () => {
    const subjectPesel = generateRandomPesel();
    const description = `E2E indirect all ${Date.now()}`;

    // Step 1: Grant with AllPartners (no value needed)
    const grantResp = await client.permissions.grantIndirectPermissions({
      subjectIdentifier: { type: 'Pesel', value: subjectPesel },
      targetIdentifier: { type: 'AllPartners' },
      permissions: ['InvoiceRead', 'InvoiceWrite'],
      description,
      subjectDetails: {
        subjectDetailsType: 'PersonByIdentifier',
        personById: { firstName: 'Test', lastName: 'AllPartners' },
      },
    });
    expect(grantResp.referenceNumber).toBeTruthy();

    // Step 2: Poll for completion
    await pollUntil(
      () => client.permissions.getOperationStatus(grantResp.referenceNumber),
      (s) => s.status.code === 200,
      { intervalMs: 2000, maxAttempts: 30, description: 'indirect AllPartners grant' },
    );

    // Step 3: Query and verify
    const queryResult = await client.permissions.queryPersonsGrants({
      queryType: 'PermissionsGrantedInCurrentContext',
    });
    const matchingGrants = queryResult.permissions.filter(
      (p) => p.description === description,
    );
    expect(matchingGrants.length).toBe(2);

    // Cleanup: revoke both
    for (const grant of matchingGrants) {
      const revokeResp = await client.permissions.revokeCommonGrant(grant.id);
      await pollUntil(
        () => client.permissions.getOperationStatus(revokeResp.referenceNumber),
        (s) => s.status.code === 200,
        { intervalMs: 2000, maxAttempts: 30, description: `revoke indirect grant ${grant.id}` },
      );
    }
  });
});
