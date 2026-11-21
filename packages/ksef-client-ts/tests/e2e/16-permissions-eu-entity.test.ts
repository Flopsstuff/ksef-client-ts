import { describe, it, expect, beforeAll } from 'vitest';
import { authenticateWithCert, createTestClient } from './helpers/auth.js';
import { generateRandomNip, generateFingerprint, generateNipVatUe } from './helpers/identifiers.js';
import { pollUntil } from './helpers/polling.js';
import { CertificateService } from '../../src/crypto/certificate-service.js';
import { SignatureService } from '../../src/crypto/signature-service.js';
import { buildUnsignedAuthTokenRequestXml } from '../../src/crypto/auth-xml-builder.js';
import type { KSeFClient } from '../../src/client.js';

async function loginAsEuEntity(
  certPem: string,
  keyPem: string,
  nipVatUe: string,
): Promise<KSeFClient> {
  const client = createTestClient();
  const challenge = await client.auth.getChallenge();
  const unsigned = buildUnsignedAuthTokenRequestXml({
    challenge: challenge.challenge,
    contextIdentifier: { type: 'NipVatUe', value: nipVatUe },
    subjectIdentifierType: 'certificateFingerprint',
  });
  const signed = SignatureService.sign(unsigned, certPem, keyPem);
  const submit = await client.auth.submitXadesAuthRequest(signed, false, false);
  const authToken = submit.authenticationToken.token;
  await pollUntil(
    () => client.auth.getAuthStatus(submit.referenceNumber, authToken),
    (s) => s.status.code !== 100,
    { intervalMs: 1000, maxAttempts: 30, description: 'NipVatUe auth' },
  );
  const tokens = await client.auth.getAccessToken(authToken);
  client.authManager.setAccessToken(tokens.accessToken.token);
  client.authManager.setRefreshToken(tokens.refreshToken.token);
  return client;
}

describe('16 - Permissions: EU Entity', { timeout: 180_000 }, () => {
  let client: KSeFClient;
  let sessionNip: string;

  beforeAll(async () => {
    ({ client, nip: sessionNip } = await authenticateWithCert());
  });

  it('should submit EU entity admin grant and track operation status', async () => {
    const fingerprint = generateFingerprint();
    const nipVatUe = generateNipVatUe(sessionNip);
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

  it('should grant CollectiveIdentifierManage to an EU entity representative and find it via query', async () => {
    const euCert = await CertificateService.generateCompanySeal(
      'E2E EU Entity CIM',
      `VATPL-${sessionNip}`,
      `E2E EU CIM ${sessionNip}`,
      'RSA',
    );
    const nipVatUe = generateNipVatUe(sessionNip);
    const adminDescription = `E2E eu admin for CIM ${Date.now()}`;
    const repDescription = `E2E eu rep CIM ${Date.now()}`;
    const repFingerprint = generateFingerprint(generateRandomNip());

    const adminResp = await client.permissions.grantEuEntityAdminPermissions({
      subjectIdentifier: { type: 'Fingerprint', value: euCert.fingerprint },
      contextIdentifier: { type: 'NipVatUe', value: nipVatUe },
      description: adminDescription,
      euEntityName: 'E2E Test EU Entity CIM',
      subjectDetails: {
        subjectDetailsType: 'EntityByFingerprint',
        entityByFp: { fullName: 'E2E EU Subject CIM', address: 'Test Address 123' },
      },
      euEntityDetails: { fullName: 'E2E EU Entity Name CIM', address: 'EU Address 456' },
    });
    expect(adminResp.referenceNumber).toBeTruthy();

    const adminOp = await pollUntil(
      () => client.permissions.getOperationStatus(adminResp.referenceNumber),
      (s) => s.status.code >= 200,
      { intervalMs: 2000, maxAttempts: 30, description: 'EU entity admin grant for CIM' },
    );
    expect(adminOp.status.code).toBe(200);

    // Representative grants require a NipVatUe session with VatUeManage.
    const euClient = await loginAsEuEntity(
      euCert.certificatePem,
      euCert.privateKeyPem,
      nipVatUe,
    );

    const repResp = await euClient.permissions.grantEuEntityRepresentativePermissions({
      subjectIdentifier: { type: 'Fingerprint', value: repFingerprint },
      permissions: ['CollectiveIdentifierManage'],
      description: repDescription,
      subjectDetails: {
        subjectDetailsType: 'EntityByFingerprint',
        entityByFp: { fullName: 'E2E EU Rep CIM', address: 'Rep Address 789' },
      },
    });
    expect(repResp.referenceNumber).toBeTruthy();

    const repOp = await pollUntil(
      () => euClient.permissions.getOperationStatus(repResp.referenceNumber),
      (s) => s.status.code >= 200,
      { intervalMs: 2000, maxAttempts: 30, description: 'EU entity CollectiveIdentifierManage grant' },
    );
    expect(repOp.status.code).toBe(200);

    // TEST returns HTTP 503 when permissionTypes includes CollectiveIdentifierManage;
    // filter by fingerprint and assert the scope client-side instead.
    const queryResult = await pollUntil(
      () =>
        euClient.permissions.queryEuEntitiesGrants({
          authorizedFingerprintIdentifier: repFingerprint,
        }),
      (page) =>
        page.permissions.some(
          (p) => p.description === repDescription && p.permissionScope === 'CollectiveIdentifierManage',
        ),
      { intervalMs: 2000, maxAttempts: 15, description: 'query CollectiveIdentifierManage grant' },
    );
    const matchingGrants = queryResult.permissions.filter(
      (p) => p.description === repDescription && p.permissionScope === 'CollectiveIdentifierManage',
    );
    expect(matchingGrants.length).toBeGreaterThanOrEqual(1);

    for (const grant of matchingGrants) {
      const resp = await euClient.permissions.revokeCommonGrant(grant.id);
      await pollUntil(
        () => euClient.permissions.getOperationStatus(resp.referenceNumber),
        (s) => s.status.code >= 200,
        { intervalMs: 2000, maxAttempts: 30, description: `cleanup EU CIM grant ${grant.id}` },
      );
    }
  });
});
