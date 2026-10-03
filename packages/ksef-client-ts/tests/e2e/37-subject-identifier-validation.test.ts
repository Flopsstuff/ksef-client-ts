import { describe, it, expect, beforeAll } from 'vitest';
import JSZip from 'jszip';
import { openOnlineSession, openSendAndClose } from '../../src/workflows/online-session-workflow.js';
import { uploadBatch } from '../../src/workflows/batch-session-workflow.js';
import { KSEF_FEATURE_HEADER, KSeFFeature, UpoVersion } from '../../src/http/ksef-feature.js';
import { RestRequest } from '../../src/http/rest-request.js';
import { Routes } from '../../src/http/routes.js';
import type { OpenOnlineSessionResponse } from '../../src/models/sessions/online-types.js';
import { authenticateWithCertWorkflow } from './helpers/auth.js';
import { getFormCode, prepareInvoiceXml } from './helpers/invoices.js';
import { pollUntil } from './helpers/polling.js';
import type { KSeFClient } from '../../src/client.js';

const POLL_OPTIONS = { intervalMs: 5000, maxAttempts: 30 };

// The FA(3) fixture's buyer NIP is valid; bumping its check digit makes it invalid.
const FIXTURE_BUYER_NIP = '3861610227';
const INVALID_BUYER_NIP = '3861610228';

function invoiceWithInvalidBuyerNip(nip: string): string {
  const xml = prepareInvoiceXml('FA_3', { nip })
    .replace(`<NIP>${FIXTURE_BUYER_NIP}</NIP>`, `<NIP>${INVALID_BUYER_NIP}</NIP>`);
  expect(xml).toContain(`<NIP>${INVALID_BUYER_NIP}</NIP>`);
  return xml;
}

describe('37 - Subject identifier validation feature (X-KSeF-Feature)', { timeout: 300_000 }, () => {
  let client: KSeFClient;
  let nip: string;

  beforeAll(async () => {
    ({ client, nip } = await authenticateWithCertWorkflow());
  }, 60_000);

  it('rejects an invoice with an invalid buyer NIP in an online session opened with the feature', async () => {
    const handle = await openOnlineSession(client, {
      formCode: getFormCode('FA_3'),
      features: KSeFFeature.SubjectIdentifierValidation,
    });
    const badRef = await handle.sendInvoice(invoiceWithInvalidBuyerNip(nip));
    await handle.sendInvoice(prepareInvoiceXml('FA_3', { nip }));
    await handle.close();

    const upo = await handle.waitForUpo(POLL_OPTIONS);
    expect(upo.successfulInvoiceCount).toBe(1);
    expect(upo.failedInvoiceCount).toBe(1);

    const bad = await client.sessionStatus.getSessionInvoice(handle.sessionRef, badRef);
    expect(bad.status.code).toBe(450);
    expect(bad.status.details?.join(' ')).toContain(INVALID_BUYER_NIP);
    expect(bad.ksefNumber).toBeFalsy();
  });

  it('accepts the same invoice in an online session opened without the feature', async () => {
    const upo = await openSendAndClose(client, [invoiceWithInvalidBuyerNip(nip)], {
      formCode: getFormCode('FA_3'),
      pollOptions: POLL_OPTIONS,
    });
    expect(upo.successfulInvoiceCount).toBe(1);
    expect(upo.failedInvoiceCount ?? 0).toBe(0);
  });

  // Why the client refuses more than one feature: KSeF accepts a comma-separated
  // X-KSeF-Feature with 201 but applies none of the listed features. If this test
  // starts failing, KSeF began honouring lists and the guard can be lifted.
  it('ignores the feature when KSeF receives it in a comma-separated list', async () => {
    await client.crypto.init();
    const encData = await client.crypto.getEncryptionData();
    const restClient = client.createScopedRestClient(client.authManager);
    const open = await restClient.execute<OpenOnlineSessionResponse>(
      RestRequest.post(Routes.Sessions.Online.open)
        .body({ formCode: getFormCode('FA_3'), encryption: encData.encryptionInfo })
        .header(KSEF_FEATURE_HEADER, `${UpoVersion.V4_3}, ${KSeFFeature.SubjectIdentifierValidation}`),
    );
    const sessionRef = open.body.referenceNumber;

    const plain = new TextEncoder().encode(invoiceWithInvalidBuyerNip(nip));
    const encrypted = client.crypto.encryptAES256(plain, encData.cipherKey, encData.cipherIv);
    const plainMeta = client.crypto.getFileMetadata(plain);
    const encMeta = client.crypto.getFileMetadata(encrypted);
    await client.onlineSession.sendInvoice(sessionRef, {
      invoiceHash: plainMeta.hashSHA,
      invoiceSize: plainMeta.fileSize,
      encryptedInvoiceHash: encMeta.hashSHA,
      encryptedInvoiceSize: encMeta.fileSize,
      encryptedInvoiceContent: Buffer.from(encrypted).toString('base64'),
    });
    await client.onlineSession.closeSession(sessionRef);

    const status = await pollUntil(
      () => client.sessionStatus.getSessionStatus(sessionRef),
      (s) => s.status.code === 200 || s.status.code >= 400,
      { ...POLL_OPTIONS, description: `session ${sessionRef}` },
    );
    expect(status.status.code).toBe(200);
    expect(status.successfulInvoiceCount).toBe(1);
    expect(status.failedInvoiceCount ?? 0).toBe(0);
  });

  it('rejects an invoice with an invalid buyer NIP in a batch session opened with the feature', async () => {
    const zip = new JSZip();
    zip.file('invalid-buyer.xml', invoiceWithInvalidBuyerNip(nip));
    zip.file('valid.xml', prepareInvoiceXml('FA_3', { nip }));
    const zipData = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

    const result = await uploadBatch(client, zipData, {
      formCode: getFormCode('FA_3'),
      features: [KSeFFeature.SubjectIdentifierValidation],
      pollOptions: { intervalMs: 5000, maxAttempts: 60 },
    });
    expect(result.upo.successfulInvoiceCount).toBe(1);
    expect(result.upo.failedInvoiceCount).toBe(1);

    const failed = await client.sessionStatus.getSessionFailedInvoices(result.sessionRef);
    expect(failed.invoices).toHaveLength(1);
    expect(failed.invoices[0]!.status.code).toBe(450);
    expect(failed.invoices[0]!.status.details?.join(' ')).toContain(INVALID_BUYER_NIP);
  });
});
