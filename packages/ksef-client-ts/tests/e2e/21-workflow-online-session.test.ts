import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { openOnlineSession, openSendAndClose } from '../../src/workflows/online-session-workflow.js';
import { authenticateWithCertWorkflow } from './helpers/auth.js';
import { prepareInvoiceXml, getFormCode } from './helpers/invoices.js';
import { KSeFInvoiceRejectedError } from '../../src/errors/ksef-invoice-rejected-error.js';
import type { KSeFClient } from '../../src/client.js';

const POLL_OPTIONS = { intervalMs: 5000, maxAttempts: 30 };

describe('21 - Online Session Workflow', { timeout: 180_000 }, () => {
  let client: KSeFClient;
  let nip: string;

  beforeAll(async () => {
    ({ client, nip } = await authenticateWithCertWorkflow());
  }, 60_000);

  it('should complete handle lifecycle — send, close, waitForUpo', async () => {
    const handle = await openOnlineSession(client, { formCode: getFormCode('FA_3') });

    expect(handle.sessionRef).toBeTruthy();
    expect(handle.validUntil).toBeTruthy();

    const invoiceXml = prepareInvoiceXml('FA_3', { nip });
    const invoiceRef = await handle.sendInvoice(invoiceXml);
    expect(invoiceRef).toBeTruthy();

    await handle.close();

    const upo = await handle.waitForUpo(POLL_OPTIONS);
    expect(upo.pages.length).toBeGreaterThan(0);
    expect(upo.pages[0]!.referenceNumber).toBeTruthy();
    expect(upo.successfulInvoiceCount).toBe(1);
    expect(upo.failedInvoiceCount ?? 0).toBe(0);
  });

  it('should waitForInvoice for a KSeF number, then reject a resend as a duplicate', async () => {
    const handle = await openOnlineSession(client, { formCode: getFormCode('FA_3') });
    const invoiceXml = prepareInvoiceXml('FA_3', { nip, invoiceNumber: randomUUID() });

    const invoiceRef = await handle.sendInvoice(invoiceXml);
    const accepted = await handle.waitForInvoice(invoiceRef, POLL_OPTIONS);
    expect(accepted.status.code).toBe(200);
    expect(accepted.ksefNumber).toBeTruthy();

    // Same document again, as after a lost send response: KSeF rejects it as 440 and names the original.
    const resendRef = await handle.sendInvoice(invoiceXml);
    const err = await handle.waitForInvoice(resendRef, POLL_OPTIONS).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KSeFInvoiceRejectedError);
    const rejected = err as KSeFInvoiceRejectedError;
    expect(rejected.code).toBe(440);
    expect(rejected.isDuplicate).toBe(true);
    expect(rejected.referenceNumber).toBe(resendRef);
    expect(rejected.originalKsefNumber).toBe(accepted.ksefNumber);

    await handle.close();
  });

  it('should openSendAndClose with single invoice', async () => {
    const invoiceXml = prepareInvoiceXml('FA_3', { nip });

    const upo = await openSendAndClose(client, [invoiceXml], {
      formCode: getFormCode('FA_3'),
      pollOptions: POLL_OPTIONS,
    });

    expect(upo.pages.length).toBeGreaterThan(0);
    expect(upo.successfulInvoiceCount).toBe(1);
    expect(upo.failedInvoiceCount ?? 0).toBe(0);
  });

  it('should openSendAndClose with multiple invoices', async () => {
    const invoices = Array.from({ length: 3 }, () =>
      prepareInvoiceXml('FA_3', { nip }),
    );

    const upo = await openSendAndClose(client, invoices, {
      formCode: getFormCode('FA_3'),
      pollOptions: POLL_OPTIONS,
    });

    expect(upo.successfulInvoiceCount).toBe(3);
    expect(upo.pages.length).toBeGreaterThan(0);
    expect(upo.failedInvoiceCount ?? 0).toBe(0);
  });
});
