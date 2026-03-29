import { describe, it, expect } from 'vitest';
import { AuthorizationPermissionGrantBuilder } from '../../src/builders/permissions/authorization-permission.js';
import { InvoiceQueryFilterBuilder } from '../../src/builders/invoice-query-filter.js';
import { authenticateWithCert, authenticateWithCertAndCrypto } from './helpers/auth.js';
import { generateRandomNip } from './helpers/identifiers.js';
import { getFormCode, prepareAndEncryptInvoice } from './helpers/invoices.js';
import { pollUntil } from './helpers/polling.js';

describe('31 - Self-Invoicing (Full E2E)', { timeout: 180_000 }, () => {
  it('full self-invoicing lifecycle: grant, send as buyer, seller verifies, revoke', async () => {
    const sellerNip = generateRandomNip();
    const buyerNip = generateRandomNip();
    const description = `E2E self-invoicing ${Date.now()}`;

    // Step 1: Auth as seller, grant SelfInvoicing to buyer
    const { client: sellerClient } = await authenticateWithCert(sellerNip);

    const grantReq = new AuthorizationPermissionGrantBuilder()
      .withSubjectIdentifier('Nip', buyerNip)
      .withPermission('SelfInvoicing')
      .withDescription(description)
      .withSubjectDetails({ fullName: 'E2E Self-Invoicing Buyer' })
      .build();
    const grantResp = await sellerClient.permissions.grantAuthorizationPermissions(grantReq);
    expect(grantResp.referenceNumber).toBeTruthy();

    // Step 2: Poll grant completion
    await pollUntil(
      () => sellerClient.permissions.getOperationStatus(grantResp.referenceNumber),
      (s) => s.status.code === 200,
      { intervalMs: 2000, maxAttempts: 30, description: 'SelfInvoicing grant operation' },
    );

    // Step 3: Auth as buyer, open online session
    const { client: buyerClient, encryptionData } =
      await authenticateWithCertAndCrypto(buyerNip);
    const { cipherKey, cipherIv, encryptionInfo } = encryptionData;

    const formCode = getFormCode('FA_3_SELF');
    const openResponse = await buyerClient.onlineSession.openSession({
      formCode,
      encryption: encryptionInfo,
    });
    const sessionRef = openResponse.referenceNumber;
    expect(sessionRef).toBeTruthy();

    // Step 4: Send invoice (Podmiot1=seller, Podmiot2=buyer)
    const { sendRequest } = prepareAndEncryptInvoice(
      buyerClient, 'FA_3_SELF', sellerNip, cipherKey, cipherIv,
      { buyerNip },
    );
    const sendResponse = await buyerClient.onlineSession.sendInvoice(sessionRef, sendRequest);
    expect(sendResponse.referenceNumber).toBeTruthy();

    // Step 5: Poll invoice processing
    await pollUntil(
      () => buyerClient.sessionStatus.getSessionStatus(sessionRef),
      (s) => (s.successfulInvoiceCount ?? 0) > 0,
      { intervalMs: 5000, maxAttempts: 30, description: 'self-invoice processing' },
    );

    // Step 6: Close session and verify
    await buyerClient.onlineSession.closeSession(sessionRef);
    const finalStatus = await pollUntil(
      () => buyerClient.sessionStatus.getSessionStatus(sessionRef),
      (s) => s.status.code === 200,
      { intervalMs: 5000, maxAttempts: 30, description: 'self-invoicing session close + UPO' },
    );
    expect(finalStatus.successfulInvoiceCount).toBe(1);
    expect(finalStatus.failedInvoiceCount ?? 0).toBe(0);

    // Get KSeF number from session invoices
    const sessionInvoices = await buyerClient.sessionStatus.getSessionInvoices(sessionRef);
    expect(sessionInvoices.invoices).toHaveLength(1);
    const ksefNumber = sessionInvoices.invoices[0]!.ksefNumber!;
    expect(ksefNumber).toBeTruthy();

    // Step 7: Auth as seller, verify invoice is visible via Subject1 query
    const { client: sellerClient2 } = await authenticateWithCert(sellerNip);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const filters = new InvoiceQueryFilterBuilder()
      .withSubjectType('Subject1')
      .withDateRange('Invoicing', yesterday)
      .build();

    // Poll for invoice to appear in seller's query (indexing may take a moment)
    const queryResult = await pollUntil(
      () => sellerClient2.invoices.queryInvoiceMetadata(filters, 0, 50),
      (r) => r.invoices.some((inv) => inv.ksefNumber === ksefNumber),
      { intervalMs: 5000, maxAttempts: 20, description: 'seller invoice visibility' },
    );
    const matchedInvoice = queryResult.invoices.find((inv) => inv.ksefNumber === ksefNumber);
    expect(matchedInvoice).toBeDefined();

    // Step 8: Revoke SelfInvoicing authorization
    const queryGrants = await sellerClient2.permissions.queryAuthorizationsGrants({
      queryType: 'Granted',
    });
    const matchingGrants = queryGrants.authorizationGrants.filter(
      (g) => g.description === description,
    );
    expect(matchingGrants).toHaveLength(1);
    expect(matchingGrants[0]!.authorizationScope).toBe('SelfInvoicing');

    const revokeResp = await sellerClient2.permissions.revokeAuthorizationGrant(
      matchingGrants[0]!.id,
    );
    expect(revokeResp.referenceNumber).toBeTruthy();
    await pollUntil(
      () => sellerClient2.permissions.getOperationStatus(revokeResp.referenceNumber),
      (s) => s.status.code === 200,
      { intervalMs: 2000, maxAttempts: 30, description: 'SelfInvoicing revoke operation' },
    );

    // Step 9: Verify grant removed
    const afterRevoke = await sellerClient2.permissions.queryAuthorizationsGrants({
      queryType: 'Granted',
    });
    const remaining = afterRevoke.authorizationGrants.filter(
      (g) => g.description === description,
    );
    expect(remaining).toHaveLength(0);
  });
});
