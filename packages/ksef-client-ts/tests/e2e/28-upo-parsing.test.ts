import { describe, it, expect, beforeAll } from 'vitest';
import JSZip from 'jszip';
import { openOnlineSession } from '../../src/workflows/online-session-workflow.js';
import { uploadBatchParsed } from '../../src/workflows/batch-session-workflow.js';
import { authenticateWithCertWorkflow } from './helpers/auth.js';
import { prepareInvoiceXml, getFormCode } from './helpers/invoices.js';
import type { KSeFClient } from '../../src/client.js';

const POLL_OPTIONS = { intervalMs: 5000, maxAttempts: 30 };

describe('28 - UPO Parsing', { timeout: 300_000 }, () => {
  let client: KSeFClient;
  let nip: string;

  beforeAll(async () => {
    const auth = await authenticateWithCertWorkflow();
    client = auth.client;
    nip = auth.nip;
  }, 60_000);

  describe('Online session UPO', () => {
    it('should parse UPO with all required fields', async () => {
      const handle = await openOnlineSession(client, { formCode: getFormCode('FA_3') });
      await handle.sendInvoice(prepareInvoiceXml('FA_3', { nip }));
      await handle.close();
      const upo = await handle.waitForUpoParsed(POLL_OPTIONS);

      expect(upo.parsed.length).toBeGreaterThan(0);
      const parsed = upo.parsed[0]!;

      expect(parsed.nazwaPodmiotuPrzyjmujacego).toBeTruthy();
      expect(parsed.numerReferencyjnySesji).toBeTruthy();
      expect(parsed.uwierzytelnienie).toBeDefined();
      expect(parsed.uwierzytelnienie.idKontekstu.kind).toBe('Nip');
      expect(parsed.nazwaStrukturyLogicznej).toBeTruthy();
      expect(parsed.kodFormularza).toBeTruthy();
      expect(parsed.dokumenty.length).toBeGreaterThanOrEqual(1);

      const doc = parsed.dokumenty[0]!;
      expect(doc.nipSprzedawcy).toBeTruthy();
      expect(doc.numerKSeFDokumentu).toBeTruthy();
      expect(doc.numerFaktury).toBeTruthy();
      expect(doc.dataWystawieniaFaktury).toBeTruthy();
      expect(doc.dataPrzeslaniaDokumentu).toBeTruthy();
      expect(doc.dataNadaniaNumeruKSeF).toBeTruthy();
      expect(doc.skrotDokumentu).toBeTruthy();
      expect(doc.trybWysylki).toBeTruthy();
    });

    it('should have document count matching sent invoices', async () => {
      const handle = await openOnlineSession(client, { formCode: getFormCode('FA_3') });
      for (let i = 0; i < 3; i++) {
        await handle.sendInvoice(prepareInvoiceXml('FA_3', { nip }));
      }
      await handle.close();
      const upo = await handle.waitForUpoParsed(POLL_OPTIONS);

      expect(upo.successfulInvoiceCount).toBe(3);

      const totalDocs = upo.parsed.reduce((sum, p) => sum + p.dokumenty.length, 0);
      expect(totalDocs).toBe(3);
    });

    it('should have nipSprzedawcy matching authenticated NIP', async () => {
      const handle = await openOnlineSession(client, { formCode: getFormCode('FA_3') });
      await handle.sendInvoice(prepareInvoiceXml('FA_3', { nip }));
      await handle.close();
      const upo = await handle.waitForUpoParsed(POLL_OPTIONS);

      for (const parsed of upo.parsed) {
        for (const doc of parsed.dokumenty) {
          expect(doc.nipSprzedawcy).toBe(nip);
        }
      }
    });
  });

  describe('Batch session UPO', () => {
    it('should parse UPO via uploadBatchParsed', async () => {
      const zip = new JSZip();
      zip.file('invoice-1.xml', prepareInvoiceXml('FA_3', { nip }));
      zip.file('invoice-2.xml', prepareInvoiceXml('FA_3', { nip }));
      const zipData = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

      const result = await uploadBatchParsed(client, zipData, {
        formCode: getFormCode('FA_3'),
        pollOptions: { intervalMs: 5000, maxAttempts: 60 },
      });

      expect(result.sessionRef).toBeTruthy();
      expect(result.upo.parsed.length).toBeGreaterThanOrEqual(1);
      expect(result.upo.successfulInvoiceCount).toBe(2);

      const totalDocs = result.upo.parsed.reduce((sum, p) => sum + p.dokumenty.length, 0);
      expect(totalDocs).toBe(2);

      for (const parsed of result.upo.parsed) {
        for (const doc of parsed.dokumenty) {
          expect(doc.numerKSeFDokumentu).toBeTruthy();
        }
      }
    });

    it('should have kodFormularza matching the form code', async () => {
      const zip = new JSZip();
      zip.file('invoice-1.xml', prepareInvoiceXml('FA_3', { nip }));
      const zipData = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

      const result = await uploadBatchParsed(client, zipData, {
        formCode: getFormCode('FA_3'),
        pollOptions: { intervalMs: 5000, maxAttempts: 60 },
      });

      expect(result.upo.parsed[0]!.kodFormularza).toContain('FA');
    });
  });
});
