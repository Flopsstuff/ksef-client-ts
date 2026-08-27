import { describe, it, beforeAll } from 'vitest';
import { authenticateWithCert } from './helpers/auth.js';
import { generateRandomNip } from './helpers/identifiers.js';
import type { KSeFClient } from '../../src/client.js';
import type { ApiRateLimitsOverride, ApiRateLimitValuesOverride } from '../../src/models/limits/types.js';

function buildRateLimits(perSecond: number, perMinute: number, perHour: number): ApiRateLimitsOverride {
  const v: ApiRateLimitValuesOverride = { perSecond, perMinute, perHour };
  // KSeF caps this category at 10/60/120 and rejects anything higher, though the spec types it like the rest.
  const collectiveIdentifier: ApiRateLimitValuesOverride = {
    perSecond: Math.min(perSecond, 10),
    perMinute: Math.min(perMinute, 60),
    perHour: Math.min(perHour, 120),
  };
  return {
    onlineSession: v, batchSession: v, invoiceSend: v, invoiceStatus: v,
    sessionList: v, sessionInvoiceList: v, sessionMisc: v, invoiceMetadata: v,
    invoiceExport: v, invoiceExportStatus: v, invoiceDownload: v,
    collectiveIdentifier, other: v,
  };
}

describe('19 - TestData Limits & Attachments', { timeout: 120_000 }, () => {
  let client: KSeFClient;

  beforeAll(async () => {
    ({ client } = await authenticateWithCert());
  });

  it('should change and restore session limits', async () => {
    await client.testData.changeSessionLimits({
      onlineSession: { maxInvoiceSizeInMB: 2, maxInvoiceWithAttachmentSizeInMB: 5, maxInvoices: 500 },
      batchSession: { maxInvoiceSizeInMB: 2, maxInvoiceWithAttachmentSizeInMB: 5, maxInvoices: 5000 },
      collectiveIdentifier: { maxInvoices: 500 },
    });
    await client.testData.restoreDefaultSessionLimits();
  });

  it('should set and restore rate limits', async () => {
    const rateLimits = buildRateLimits(10, 60, 200);
    await client.testData.setRateLimits({ rateLimits });
    await client.testData.restoreDefaultRateLimits();
  });

  it('should set production rate limits', async () => {
    await client.testData.setProductionRateLimits();
    await client.testData.restoreDefaultRateLimits();
  });

  it('should change and restore certificate limits', async () => {
    await client.testData.changeCertificatesLimit({
      enrollment: { maxEnrollments: 10 },
      certificate: { maxCertificates: 5 },
    });
    await client.testData.restoreDefaultCertificatesLimit();
  });

  it('should enable and disable attachment', async () => {
    const nip = generateRandomNip();
    await client.testData.createSubject({
      subjectNip: nip,
      subjectType: 'EnforcementAuthority',
      description: `E2E attachment test ${Date.now()}`,
    });
    try {
      await client.testData.enableAttachment({ nip });
      await client.testData.disableAttachment({ nip });
    } finally {
      await client.testData.removeSubject({ subjectNip: nip });
    }
  });
});
