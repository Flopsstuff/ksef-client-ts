import { describe, it, expect, beforeAll } from 'vitest';
import { AuthorizationPermissionGrantBuilder } from '../../src/builders/permissions/authorization-permission.js';
import { authenticateWithCert, authenticateWithCertAndCrypto } from './helpers/auth.js';
import { generateRandomNip } from './helpers/identifiers.js';
import { getFormCode, prepareAndEncryptInvoice } from './helpers/invoices.js';
import { pollUntil } from './helpers/polling.js';
import type { KSeFClient } from '../../src/client.js';

describe('30 - RR Invoicing (FA-RR)', { timeout: 180_000 }, () => {
  let adminClient: KSeFClient;

  beforeAll(async () => {
    ({ client: adminClient } = await authenticateWithCert());
  });

  it('full RR invoicing lifecycle: grant, session, invoice, revoke', async () => {
    const grantorNip = generateRandomNip();
    const authorizedNip = generateRandomNip();
    const description = `E2E RR invoicing ${Date.now()}`;

    // Setup: create two EnforcementAuthority subjects
    await adminClient.testData.createSubject({
      subjectNip: grantorNip,
      subjectType: 'EnforcementAuthority',
      description: `E2E RR grantor ${Date.now()}`,
    });
    await adminClient.testData.createSubject({
      subjectNip: authorizedNip,
      subjectType: 'EnforcementAuthority',
      description: `E2E RR authorized ${Date.now()}`,
    });

    try {
      // Step 1: Auth as grantor, grant RRInvoicing to authorized
      const { client: grantorClient } = await authenticateWithCert(grantorNip);

      const grantReq = new AuthorizationPermissionGrantBuilder()
        .withSubjectIdentifier('Nip', authorizedNip)
        .withPermission('RRInvoicing')
        .withDescription(description)
        .withSubjectDetails({ fullName: 'E2E RR Authorized Entity' })
        .build();
      const grantResp = await grantorClient.permissions.grantAuthorizationPermissions(grantReq);
      expect(grantResp.referenceNumber).toBeTruthy();

      // Step 2: Poll grant completion
      await pollUntil(
        () => grantorClient.permissions.getOperationStatus(grantResp.referenceNumber),
        (s) => s.status.code === 200,
        { intervalMs: 2000, maxAttempts: 30, description: 'RR grant operation' },
      );

      // Step 3: Auth as authorized, open FA_RR session
      const { client: authorizedClient, nip: authNip, encryptionData } =
        await authenticateWithCertAndCrypto(authorizedNip);
      const { cipherKey, cipherIv, encryptionInfo } = encryptionData;

      const formCode = getFormCode('FA_RR');
      const openResponse = await authorizedClient.onlineSession.openSession({
        formCode,
        encryption: encryptionInfo,
      });
      const sessionRef = openResponse.referenceNumber;
      expect(sessionRef).toBeTruthy();

      // Step 4: Send FA-RR invoice
      const { sendRequest } = prepareAndEncryptInvoice(
        authorizedClient, 'FA_RR', grantorNip, cipherKey, cipherIv,
        { buyerNip: authorizedNip },
      );
      const sendResponse = await authorizedClient.onlineSession.sendInvoice(sessionRef, sendRequest);
      expect(sendResponse.referenceNumber).toBeTruthy();

      // Step 5: Poll invoice processing
      await pollUntil(
        () => authorizedClient.sessionStatus.getSessionStatus(sessionRef),
        (s) => (s.successfulInvoiceCount ?? 0) > 0,
        { intervalMs: 5000, maxAttempts: 30, description: 'RR invoice processing' },
      );

      // Step 6: Close session and verify
      await authorizedClient.onlineSession.closeSession(sessionRef);
      const finalStatus = await pollUntil(
        () => authorizedClient.sessionStatus.getSessionStatus(sessionRef),
        (s) => s.status.code === 200,
        { intervalMs: 5000, maxAttempts: 30, description: 'RR session close + UPO' },
      );
      expect(finalStatus.successfulInvoiceCount).toBe(1);
      expect(finalStatus.failedInvoiceCount ?? 0).toBe(0);

      // Step 7: Auth as grantor, verify authorization grant exists
      const { client: grantorClient2 } = await authenticateWithCert(grantorNip);
      const queryResult = await grantorClient2.permissions.queryAuthorizationsGrants({
        queryType: 'Granted',
      });
      const matchingGrants = queryResult.authorizationGrants.filter(
        (g) => g.description === description,
      );
      expect(matchingGrants).toHaveLength(1);
      expect(matchingGrants[0]!.authorizationScope).toBe('RRInvoicing');

      // Step 8: Revoke authorization
      const revokeResp = await grantorClient2.permissions.revokeAuthorizationGrant(
        matchingGrants[0]!.id,
      );
      expect(revokeResp.referenceNumber).toBeTruthy();
      await pollUntil(
        () => grantorClient2.permissions.getOperationStatus(revokeResp.referenceNumber),
        (s) => s.status.code === 200,
        { intervalMs: 2000, maxAttempts: 30, description: 'RR revoke operation' },
      );

      // Step 9: Verify grant removed
      const afterRevoke = await grantorClient2.permissions.queryAuthorizationsGrants({
        queryType: 'Granted',
      });
      const remaining = afterRevoke.authorizationGrants.filter(
        (g) => g.description === description,
      );
      expect(remaining).toHaveLength(0);
    } finally {
      await adminClient.testData.removeSubject({ subjectNip: authorizedNip }).catch(() => {});
      await adminClient.testData.removeSubject({ subjectNip: grantorNip }).catch(() => {});
    }
  });
});
