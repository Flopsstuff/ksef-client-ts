import { describe, it, expect, beforeAll } from 'vitest';
import { PersonPermissionGrantBuilder } from '../../src/builders/permissions/person-permission.js';
import { authenticateWithCert } from './helpers/auth.js';
import { generateRandomNip, generateRandomPesel } from './helpers/identifiers.js';
import { pollUntil } from './helpers/polling.js';
import type { KSeFClient } from '../../src/client.js';

describe('27 - Enforcement Operations', { timeout: 120_000 }, () => {
  let adminClient: KSeFClient;

  beforeAll(async () => {
    ({ client: adminClient } = await authenticateWithCert());
  });

  it('enforcement authority: grant, query, and revoke EnforcementOperations', async () => {
    const enforcementNip = generateRandomNip();
    const authorizedNip = generateRandomNip();
    const description = `E2E enforcement authority ${Date.now()}`;

    // Setup: create enforcement authority subject
    await adminClient.testData.createSubject({
      subjectNip: enforcementNip,
      subjectType: 'EnforcementAuthority',
      description: `E2E enforcement subject ${Date.now()}`,
    });

    try {
      // Auth as enforcement authority
      const { client } = await authenticateWithCert(enforcementNip);

      // Grant EnforcementOperations
      const grantReq = new PersonPermissionGrantBuilder()
        .withSubjectIdentifier('Nip', authorizedNip)
        .addPermission('EnforcementOperations')
        .withDescription(description)
        .withSubjectDetails({
          subjectDetailsType: 'PersonByIdentifier',
          personById: { firstName: 'Anna', lastName: 'Testowa' },
        })
        .build();
      const grantResp = await client.permissions.grantPersonPermissions(grantReq);
      expect(grantResp.referenceNumber).toBeTruthy();

      // Poll grant completion
      await pollUntil(
        () => client.permissions.getOperationStatus(grantResp.referenceNumber),
        (s) => s.status.code === 200,
        { intervalMs: 2000, maxAttempts: 25, description: 'enforcement grant operation' },
      );

      // Query granted permissions
      const queryResult = await client.permissions.queryPersonsGrants({
        queryType: 'PermissionsGrantedInCurrentContext',
      });
      const matchingGrants = queryResult.permissions.filter(
        (p) => p.description === description,
      );
      expect(matchingGrants).toHaveLength(1);
      expect(matchingGrants[0]!.permissionScope).toBe('EnforcementOperations');

      // Revoke
      const revokeResp = await client.permissions.revokeCommonGrant(matchingGrants[0]!.id);
      expect(revokeResp.referenceNumber).toBeTruthy();
      await pollUntil(
        () => client.permissions.getOperationStatus(revokeResp.referenceNumber),
        (s) => s.status.code === 200,
        { intervalMs: 2000, maxAttempts: 25, description: 'enforcement revoke operation' },
      );

      // Verify revoked
      const afterRevoke = await client.permissions.queryPersonsGrants({
        queryType: 'PermissionsGrantedInCurrentContext',
      });
      const remaining = afterRevoke.permissions.filter(
        (p) => p.description === description,
      );
      expect(remaining).toHaveLength(0);
    } finally {
      await adminClient.testData.removeSubject({ subjectNip: enforcementNip });
    }
  });

  it('court bailiff: grant, query, and revoke EnforcementOperations', async () => {
    const bailiffNip = generateRandomNip();
    const bailiffPesel = generateRandomPesel();
    const authorizedNip = generateRandomNip();
    const description = `E2E court bailiff ${Date.now()}`;

    // Setup: create court bailiff person
    await adminClient.testData.createPerson({
      nip: bailiffNip,
      pesel: bailiffPesel,
      isBailiff: true,
      description: `E2E bailiff person ${Date.now()}`,
    });

    try {
      // Auth as court bailiff
      const { client } = await authenticateWithCert(bailiffNip);

      // Grant EnforcementOperations
      const grantReq = new PersonPermissionGrantBuilder()
        .withSubjectIdentifier('Nip', authorizedNip)
        .addPermission('EnforcementOperations')
        .withDescription(description)
        .withSubjectDetails({
          subjectDetailsType: 'PersonByIdentifier',
          personById: { firstName: 'Jan', lastName: 'Kowalski' },
        })
        .build();
      const grantResp = await client.permissions.grantPersonPermissions(grantReq);
      expect(grantResp.referenceNumber).toBeTruthy();

      // Poll grant completion
      await pollUntil(
        () => client.permissions.getOperationStatus(grantResp.referenceNumber),
        (s) => s.status.code === 200,
        { intervalMs: 2000, maxAttempts: 25, description: 'bailiff grant operation' },
      );

      // Query granted permissions
      const queryResult = await client.permissions.queryPersonsGrants({
        queryType: 'PermissionsGrantedInCurrentContext',
      });
      const matchingGrants = queryResult.permissions.filter(
        (p) => p.description === description,
      );
      expect(matchingGrants).toHaveLength(1);
      expect(matchingGrants[0]!.permissionScope).toBe('EnforcementOperations');

      // Revoke
      const revokeResp = await client.permissions.revokeCommonGrant(matchingGrants[0]!.id);
      expect(revokeResp.referenceNumber).toBeTruthy();
      await pollUntil(
        () => client.permissions.getOperationStatus(revokeResp.referenceNumber),
        (s) => s.status.code === 200,
        { intervalMs: 2000, maxAttempts: 25, description: 'bailiff revoke operation' },
      );

      // Verify revoked
      const afterRevoke = await client.permissions.queryPersonsGrants({
        queryType: 'PermissionsGrantedInCurrentContext',
      });
      const remaining = afterRevoke.permissions.filter(
        (p) => p.description === description,
      );
      expect(remaining).toHaveLength(0);
    } finally {
      await adminClient.testData.removePerson({ nip: bailiffNip });
    }
  });

  it('unauthorized subject cannot grant EnforcementOperations', async () => {
    const authorizedNip = generateRandomNip();
    const description = `E2E unauthorized enforcement ${Date.now()}`;

    // Auth as regular NIP (no enforcement role)
    const { client } = await authenticateWithCert();

    // Attempt to grant EnforcementOperations
    const grantReq = new PersonPermissionGrantBuilder()
      .withSubjectIdentifier('Nip', authorizedNip)
      .addPermission('EnforcementOperations')
      .withDescription(description)
      .withSubjectDetails({
        subjectDetailsType: 'PersonByIdentifier',
        personById: { firstName: 'Test', lastName: 'Unauthorized' },
      })
      .build();
    const grantResp = await client.permissions.grantPersonPermissions(grantReq);
    expect(grantResp.referenceNumber).toBeTruthy();

    // Poll — expect failure (status 430)
    const finalStatus = await pollUntil(
      () => client.permissions.getOperationStatus(grantResp.referenceNumber),
      (s) => s.status.code >= 400 || s.status.code === 200,
      { intervalMs: 2000, maxAttempts: 25, description: 'unauthorized enforcement grant' },
    );
    expect(finalStatus.status.code).toBeGreaterThanOrEqual(400);
  });
});
