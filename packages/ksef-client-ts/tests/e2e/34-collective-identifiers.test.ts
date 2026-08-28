import { describe, it, expect, beforeAll } from 'vitest';
import { authenticateWithCertAndCrypto } from './helpers/auth.js';
import { getFormCode, prepareAndEncryptInvoice } from './helpers/invoices.js';
import { pollUntil } from './helpers/polling.js';
import { KSeFBadRequestError } from '../../src/errors/ksef-bad-request-error.js';
import type { KSeFClient } from '../../src/client.js';
import type { GenerateCollectiveIdentifierResponse } from '../../src/models/collective-identifiers/types.js';

const COLLECTIVE_IDENTIFIER_FORMAT = /^\d{10}-IZ\d{6}-[0-9A-F]{12}-[0-9A-F]{2}$/;

/** KSeF: "Faktura nie moze zostac przypisana do Identyfikatora Zbiorczego." */
const INVOICE_NOT_ASSIGNABLE = 71001;

/**
 * A freshly issued invoice is not immediately eligible for a collective
 * identifier: the session reporting it as processed and the invoice becoming
 * assignable are separate server-side states, with no status field exposing the
 * second one. KSeF rejects the early call with error 71001, so retry on exactly
 * that code and let every other failure surface untouched.
 */
async function generateWhenAssignable(
  attempt: () => Promise<GenerateCollectiveIdentifierResponse>,
  { intervalMs = 5000, deadlineMs = 60_000 } = {},
): Promise<GenerateCollectiveIdentifierResponse> {
  // Bound the wall clock rather than the attempt count: the time spent inside a
  // slow call counts too, so a fixed number of attempts could outlast the spec's
  // own timeout and report a timeout instead of the real rejection.
  const giveUpAt = Date.now() + deadlineMs;
  for (;;) {
    try {
      return await attempt();
    } catch (err) {
      const notAssignable =
        err instanceof KSeFBadRequestError &&
        err.errors.some((e) => e.code === INVOICE_NOT_ASSIGNABLE);
      if (!notAssignable || Date.now() + intervalMs >= giveUpAt) throw err;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

describe('34 - Collective Identifiers', { timeout: 300_000 }, () => {
  let client: KSeFClient;
  let nip: string;
  let ksefNumbers: string[];
  let collectiveIdentifierNumber: string;

  beforeAll(async () => {
    const setup = await authenticateWithCertAndCrypto();
    client = setup.client;
    nip = setup.nip;
    const { cipherKey, cipherIv, encryptionInfo } = setup.encryptionData;

    const openResp = await client.onlineSession.openSession({
      formCode: getFormCode('FA_3'),
      encryption: encryptionInfo,
    });
    const sessionRef = openResp.referenceNumber;

    for (let i = 0; i < 2; i += 1) {
      const { sendRequest } = prepareAndEncryptInvoice(client, 'FA_3', nip, cipherKey, cipherIv);
      await client.onlineSession.sendInvoice(sessionRef, sendRequest);
    }

    await pollUntil(
      () => client.sessionStatus.getSessionStatus(sessionRef),
      (s) => (s.successfulInvoiceCount ?? 0) >= 2,
      { intervalMs: 5000, maxAttempts: 30, description: 'invoice processing (collective identifier setup)' },
    );
    await client.onlineSession.closeSession(sessionRef);
    await pollUntil(
      () => client.sessionStatus.getSessionStatus(sessionRef),
      (s) => s.status.code === 200,
      { intervalMs: 5000, maxAttempts: 30, description: 'session close (collective identifier setup)' },
    );

    const sessionInvoices = await client.sessionStatus.getSessionInvoices(sessionRef);
    ksefNumbers = sessionInvoices.invoices
      .map((i) => i.ksefNumber)
      .filter((n): n is string => Boolean(n));
    expect(ksefNumbers.length).toBeGreaterThanOrEqual(2);
  }, 180_000);

  it('should generate a collective identifier for invoices from the same seller', async () => {
    const result = await generateWhenAssignable(() =>
      client.collectiveIdentifiers.generate({
        invoices: [
          { ksefNumber: ksefNumbers[0]!, payment: { amount: 123.45, currency: 'PLN' }, description: 'E2E first' },
          { ksefNumber: ksefNumbers[1]! },
        ],
      }),
    );

    expect(result.collectiveIdentifierNumber).toMatch(COLLECTIVE_IDENTIFIER_FORMAT);
    expect(result.collectiveIdentifierNumber.startsWith(`${nip}-IZ`)).toBe(true);

    collectiveIdentifierNumber = result.collectiveIdentifierNumber;
  });

  it('should list the generated identifier in the current context', async () => {
    const now = Date.now();
    const result = await client.collectiveIdentifiers.query({
      dateCreatedFrom: new Date(now - 86_400_000).toISOString(),
      dateCreatedTo: new Date(now + 60_000).toISOString(),
    });

    expect(Array.isArray(result.collectiveIdentifiers)).toBe(true);
    const match = result.collectiveIdentifiers.find(
      (c) => c.collectiveIdentifierNumber === collectiveIdentifierNumber,
    );
    expect(match).toBeDefined();
    expect(match!.invoiceCount).toBe(2);
    expect(match!.createdInCurrentContext).toBe(true);
  });

  it('should find the identifier by the KSeF number of a member invoice', async () => {
    const result = await client.collectiveIdentifiers.getByKsefNumber(ksefNumbers[0]!);

    expect(
      result.collectiveIdentifiers.map((c) => c.collectiveIdentifierNumber),
    ).toContain(collectiveIdentifierNumber);
  });

  it('should list the invoices inside the identifier with payment details disclosed to the creator', async () => {
    const result = await client.collectiveIdentifiers.queryInvoices({
      collectiveIdentifierNumbers: [collectiveIdentifierNumber],
    });

    const returned = result.invoices.map((i) => i.ksefNumber);
    expect(returned).toContain(ksefNumbers[0]);
    expect(returned).toContain(ksefNumbers[1]);

    // The caller created this identifier, so nothing may be withheld.
    for (const invoice of result.invoices) {
      expect(invoice.detailsHidden).toBe(false);
      expect(invoice.collectiveIdentifierNumber).toBe(collectiveIdentifierNumber);
    }

    const withPayment = result.invoices.find((i) => i.ksefNumber === ksefNumbers[0]);
    expect(withPayment!.payment).toEqual({ amount: 123.45, currency: 'PLN' });
    expect(withPayment!.description).toBe('E2E first');
  });
});
