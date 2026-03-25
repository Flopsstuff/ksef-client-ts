import { describe, it, expect, beforeAll } from 'vitest';
import { openOnlineSession, openSendAndClose } from '../../src/workflows/online-session-workflow.js';
import { authenticateWithCertWorkflow } from './helpers/auth.js';
import { prepareInvoiceXml, getFormCode } from './helpers/invoices.js';
import type { KSeFClient } from '../../src/client.js';

const POLL_OPTIONS = { intervalMs: 5000, maxAttempts: 30 };

describe('21 - Online Session Workflow', { timeout: 180_000 }, () => {
  let client: KSeFClient;
  let nip: string;

  beforeAll(async () => {
    ({ client, nip } = await authenticateWithCertWorkflow());
  }, 60_000);

  it('should complete handle lifecycle — send, close, waitForUpo', async () => {
    const handle = await openOnlineSession(client, { formCode: getFormCode('FA_2') });

    expect(handle.sessionRef).toBeTruthy();
    expect(handle.validUntil).toBeTruthy();

    const invoiceXml = prepareInvoiceXml('FA_2', { nip });
    const invoiceRef = await handle.sendInvoice(invoiceXml);
    expect(invoiceRef).toBeTruthy();

    await handle.close();

    const upo = await handle.waitForUpo(POLL_OPTIONS);
    expect(upo.pages.length).toBeGreaterThan(0);
    expect(upo.pages[0]!.referenceNumber).toBeTruthy();
    expect(upo.successfulInvoiceCount).toBe(1);
    expect(upo.failedInvoiceCount ?? 0).toBe(0);
  });

  it('should openSendAndClose with single invoice', async () => {
    const invoiceXml = prepareInvoiceXml('FA_2', { nip });

    const upo = await openSendAndClose(client, [invoiceXml], {
      formCode: getFormCode('FA_2'),
      pollOptions: POLL_OPTIONS,
    });

    expect(upo.pages.length).toBeGreaterThan(0);
    expect(upo.successfulInvoiceCount).toBe(1);
    expect(upo.failedInvoiceCount ?? 0).toBe(0);
  });

  it('should openSendAndClose with multiple invoices', async () => {
    const invoices = Array.from({ length: 3 }, () =>
      prepareInvoiceXml('FA_2', { nip }),
    );

    const upo = await openSendAndClose(client, invoices, {
      formCode: getFormCode('FA_2'),
      pollOptions: POLL_OPTIONS,
    });

    expect(upo.successfulInvoiceCount).toBe(3);
    expect(upo.pages.length).toBeGreaterThan(0);
    expect(upo.failedInvoiceCount ?? 0).toBe(0);
  });
});
