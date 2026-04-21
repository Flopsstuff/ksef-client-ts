import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { authenticateWithCertAndCrypto } from './helpers/auth.js';
import { getFormCode } from './helpers/invoices.js';
import { pollUntil } from './helpers/polling.js';
import { serializeInvoiceXml } from '../../src/xml/invoice-serializer.js';
import type { FakturaInput, XmlObject } from '../../src/xml/types.js';

// Network E2E: build an FA3 invoice from the shipped CLI template JSON, send it
// to KSeF TEST, and verify the server accepts it. Proves the build pipeline
// (the same code path `ksef invoice build` wraps) produces server-acceptable
// XML using a template we actually ship.

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), '..', '..');
const fa3TemplatePath = join(
  repoRoot,
  'src',
  'cli',
  'commands',
  'invoice-build-templates',
  'fa3.json',
);

function loadTemplate(): FakturaInput {
  return JSON.parse(readFileSync(fa3TemplatePath, 'utf-8')) as FakturaInput;
}

function patchForSession(template: FakturaInput, sellerNip: string, invoiceNumber: string): FakturaInput {
  const today = new Date().toISOString().slice(0, 10);
  const podmiot1 = { ...(template.Podmiot1 ?? {}) } as XmlObject;
  const daneId = { ...((podmiot1.DaneIdentyfikacyjne as XmlObject | undefined) ?? {}) } as XmlObject;
  daneId.NIP = sellerNip;
  podmiot1.DaneIdentyfikacyjne = daneId;

  const fa = { ...(template.Fa ?? {}) } as XmlObject;
  fa.P_1 = today;
  fa.P_2 = invoiceNumber;

  return { ...template, Podmiot1: podmiot1, Fa: fa };
}

describe('32 - `ksef invoice build` sends to KSeF TEST', { timeout: 180_000 }, () => {
  it('build → send round-trip produces a server-accepted invoice', async () => {
    const { client, nip, encryptionData } = await authenticateWithCertAndCrypto();
    const { cipherKey, cipherIv, encryptionInfo } = encryptionData;

    const invoiceNumber = `E2E/BUILD/${randomUUID()}`;
    const patched = patchForSession(loadTemplate(), nip, invoiceNumber);
    const xml = serializeInvoiceXml(patched, { schema: 'FA3' });
    expect(xml.toString('utf-8')).toContain(`<P_2>${invoiceNumber}</P_2>`);
    expect(xml.toString('utf-8')).toContain(`<NIP>${nip}</NIP>`);

    const openResp = await client.onlineSession.openSession({
      formCode: getFormCode('FA_3'),
      encryption: encryptionInfo,
    });
    const sessionRef = openResp.referenceNumber;

    try {
      const encryptedBytes = client.crypto.encryptAES256(xml, cipherKey, cipherIv);
      const plainMeta = client.crypto.getFileMetadata(xml);
      const encryptedMeta = client.crypto.getFileMetadata(encryptedBytes);

      await client.onlineSession.sendInvoice(sessionRef, {
        invoiceHash: plainMeta.hashSHA,
        invoiceSize: plainMeta.fileSize,
        encryptedInvoiceHash: encryptedMeta.hashSHA,
        encryptedInvoiceSize: encryptedMeta.fileSize,
        encryptedInvoiceContent: Buffer.from(encryptedBytes).toString('base64'),
      });

      const status = await pollUntil(
        () => client.sessionStatus.getSessionStatus(sessionRef),
        (s) => (s.successfulInvoiceCount ?? 0) + (s.failedInvoiceCount ?? 0) > 0,
        { intervalMs: 5000, maxAttempts: 30, description: 'build-e2e invoice processing' },
      );

      expect(status.failedInvoiceCount ?? 0).toBe(0);
      expect(status.successfulInvoiceCount).toBe(1);

      const invoices = await client.sessionStatus.getSessionInvoices(sessionRef);
      expect(invoices.invoices).toHaveLength(1);
      const accepted = invoices.invoices[0]!;
      expect(accepted.status.code).toBe(200);
      expect(accepted.ksefNumber).toBeTruthy();
      expect(accepted.invoiceNumber).toBe(invoiceNumber);
    } finally {
      await client.onlineSession.closeSession(sessionRef).catch(() => { /* ignore close errors */ });
    }
  });
});
