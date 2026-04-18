import { describe, it, expect } from 'vitest';
import { authenticateWithCertAndCrypto } from './helpers/auth.js';
import { getFormCode, loadInvoiceTemplate } from './helpers/invoices.js';
import { generateUniqueInvoiceNumber } from './helpers/identifiers.js';
import { pollUntil } from './helpers/polling.js';
import {
  buildFakturaXml,
  parseXml,
  serializeInvoiceXml,
  type FakturaInput,
  type XmlObject,
} from '../../src/xml/index.js';
import type { SendInvoiceRequest } from '../../src/models/sessions/online-types.js';
import type { KSeFClient } from '../../src/client.js';
import type { EncryptionData } from '../../src/models/crypto/types.js';

// ── Test fixtures ──────────────────────────────────────────────────────

const BUYER_NIP = '3861610227';

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildSendRequest(
  client: KSeFClient,
  invoiceXml: string,
  cipherKey: Uint8Array,
  cipherIv: Uint8Array,
): SendInvoiceRequest {
  const plainBytes = new TextEncoder().encode(invoiceXml);
  const encryptedBytes = client.crypto.encryptAES256(plainBytes, cipherKey, cipherIv);
  const plainMeta = client.crypto.getFileMetadata(plainBytes);
  const encryptedMeta = client.crypto.getFileMetadata(encryptedBytes);
  return {
    invoiceHash: plainMeta.hashSHA,
    invoiceSize: plainMeta.fileSize,
    encryptedInvoiceHash: encryptedMeta.hashSHA,
    encryptedInvoiceSize: encryptedMeta.fileSize,
    encryptedInvoiceContent: Buffer.from(encryptedBytes).toString('base64'),
  };
}

function buildMinimalFa3(sellerNip: string, overrides?: Partial<XmlObject>): FakturaInput {
  const today = todayDate();
  const date = new Date().toISOString();
  const invoiceNumber = `FA/${generateUniqueInvoiceNumber()}`;
  return {
    Naglowek: {
      KodFormularza: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' },
      WariantFormularza: 3,
      DataWytworzeniaFa: date,
      SystemInfo: 'ksef-client-ts e2e xml serializer',
    },
    Podmiot1: {
      DaneIdentyfikacyjne: { NIP: sellerNip, Nazwa: 'Firma Testowa sp. z o.o.' },
      Adres: {
        KodKraju: 'PL',
        AdresL1: 'ul. Testowa 1',
        AdresL2: '00-001 Warszawa',
      },
    },
    Podmiot2: {
      DaneIdentyfikacyjne: { NIP: BUYER_NIP, Nazwa: 'Kontrahent Testowy' },
      Adres: {
        KodKraju: 'PL',
        AdresL1: 'ul. Kontrahentowa 2',
        AdresL2: '00-002 Warszawa',
      },
      JST: '2',
      GV: '2',
    },
    Fa: {
      KodWaluty: 'PLN',
      P_1: today,
      P_1M: 'Warszawa',
      P_2: invoiceNumber,
      P_6: today,
      P_13_1: '500.00',
      P_14_1: '115.00',
      P_15: '615.00',
      Adnotacje: {
        P_16: '2',
        P_17: '2',
        P_18: '2',
        P_18A: '2',
        Zwolnienie: { P_19N: '1' },
        NoweSrodkiTransportu: { P_22N: '1' },
        P_23: '2',
        PMarzy: { P_PMarzyN: '1' },
      },
      RodzajFaktury: 'VAT',
      FaWiersz: {
        NrWierszaFa: 1,
        P_7: 'Usluga testowa FA3 (serializer)',
        P_8A: 'szt.',
        P_8B: 5,
        P_9A: '100.00',
        P_11: '500.00',
        P_12: '23',
      },
      Platnosc: {
        Zaplacono: '1',
        DataZaplaty: today,
        FormaPlatnosci: '6',
      },
      ...overrides,
    },
  };
}

// ── Session-level helper ───────────────────────────────────────────────

async function openSendCloseVerify(
  client: KSeFClient,
  encryptionData: EncryptionData,
  sendRequest: SendInvoiceRequest,
): Promise<{ ksefNumber: string; invoiceRef: string; sessionRef: string }> {
  // IMPORTANT: reuse the same encryptionData the caller used to encrypt the
  // invoice. `getEncryptionData()` regenerates the AES key on every call, so
  // calling it again here would produce a key/IV mismatch and KSeF would
  // reject the invoice as 445 (cannot decrypt → invalid structure).
  const openResponse = await client.onlineSession.openSession({
    formCode: getFormCode('FA_3'),
    encryption: encryptionData.encryptionInfo,
  });
  const sessionRef = openResponse.referenceNumber;

  const sendResponse = await client.onlineSession.sendInvoice(sessionRef, sendRequest);
  const invoiceRef = sendResponse.referenceNumber;
  expect(invoiceRef).toBeTruthy();

  await pollUntil(
    () => client.sessionStatus.getSessionStatus(sessionRef),
    (s) => (s.successfulInvoiceCount ?? 0) > 0 || (s.failedInvoiceCount ?? 0) > 0,
    { intervalMs: 3000, maxAttempts: 30, description: 'invoice processing' },
  );

  await client.onlineSession.closeSession(sessionRef);

  const finalStatus = await pollUntil(
    () => client.sessionStatus.getSessionStatus(sessionRef),
    (s) => s.status.code === 200 || s.status.code >= 400,
    { intervalMs: 3000, maxAttempts: 30, description: 'session close + UPO' },
  );

  expect(finalStatus.status.code).toBe(200);
  expect(finalStatus.successfulInvoiceCount).toBe(1);
  expect(finalStatus.failedInvoiceCount ?? 0).toBe(0);

  const invoicesResponse = await client.sessionStatus.getSessionInvoices(sessionRef);
  const invoiceStatus = invoicesResponse.invoices[0]!;
  expect(invoiceStatus.status.code).toBe(200);
  expect(invoiceStatus.ksefNumber).toBeTruthy();

  return { ksefNumber: invoiceStatus.ksefNumber!, invoiceRef, sessionRef };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('33 - XML Serialization E2E', { timeout: 180_000 }, () => {
  it('should send an FA3 invoice built via buildFakturaXml and receive UPO', async () => {
    const { client, nip, encryptionData } = await authenticateWithCertAndCrypto();
    const { cipherKey, cipherIv } = encryptionData;

    const faktura = buildMinimalFa3(nip);
    const invoiceXml = buildFakturaXml(faktura, { schema: 'FA3' });

    // Sanity: serializer output should at least be a valid Faktura XML.
    expect(invoiceXml).toContain('<Faktura');
    expect(invoiceXml).toContain('xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"');
    expect(invoiceXml).toContain(`<NIP>${nip}</NIP>`);

    const sendRequest = buildSendRequest(client, invoiceXml, cipherKey, cipherIv);
    const { ksefNumber } = await openSendCloseVerify(client, encryptionData, sendRequest);

    // Round-trip check: KSeF should have stored the same invoice number / content.
    const { xml: storedXml } = await client.invoices.getInvoice(ksefNumber);
    expect(storedXml).toContain(`<NIP>${nip}</NIP>`);
    expect(storedXml).toContain('Faktura');
  });

  it('should send an FA3 invoice with multi-rate VAT interleave and receive UPO', async () => {
    const { client, nip, encryptionData } = await authenticateWithCertAndCrypto();
    const { cipherKey, cipherIv } = encryptionData;

    // Two VAT groups: 23% and 8%. Our ORDER_MAP must interleave P_13_N / P_14_N
    // per group (P_13_1, P_14_1, P_13_2, P_14_2, P_15) — not all P_13_* then P_14_*.
    const faktura = buildMinimalFa3(nip, {
      P_13_1: '500.00',
      P_14_1: '115.00',
      P_13_2: '200.00',
      P_14_2: '16.00',
      P_15: '831.00',
      FaWiersz: [
        {
          NrWierszaFa: 1,
          P_7: 'Usluga 23%',
          P_8A: 'szt.',
          P_8B: 5,
          P_9A: '100.00',
          P_11: '500.00',
          P_12: '23',
        },
        {
          NrWierszaFa: 2,
          P_7: 'Usluga 8%',
          P_8A: 'szt.',
          P_8B: 2,
          P_9A: '100.00',
          P_11: '200.00',
          P_12: '8',
        },
      ],
    });
    const invoiceXml = buildFakturaXml(faktura, { schema: 'FA3' });

    // Interleave assertion on the emitted XML before we ship it to KSeF.
    const p131 = invoiceXml.indexOf('<P_13_1>');
    const p141 = invoiceXml.indexOf('<P_14_1>');
    const p132 = invoiceXml.indexOf('<P_13_2>');
    const p142 = invoiceXml.indexOf('<P_14_2>');
    const p15 = invoiceXml.indexOf('<P_15>');
    expect(p131).toBeGreaterThan(0);
    expect(p141).toBeGreaterThan(p131);
    expect(p132).toBeGreaterThan(p141);
    expect(p142).toBeGreaterThan(p132);
    expect(p15).toBeGreaterThan(p142);

    const sendRequest = buildSendRequest(client, invoiceXml, cipherKey, cipherIv);
    const { ksefNumber } = await openSendCloseVerify(client, encryptionData, sendRequest);
    expect(ksefNumber).toBeTruthy();
  });

  it('should round-trip a canonical fixture through parseXml + serializeInvoiceXml and still be KSeF-accepted', async () => {
    const { client, nip, encryptionData } = await authenticateWithCertAndCrypto();
    const { cipherKey, cipherIv } = encryptionData;

    // Load the canonical FA3 fixture, substitute NIP + a unique invoice number,
    // then run it through parse + serialize. The serializer should emit XML
    // equivalent enough that KSeF still accepts it.
    const raw = loadInvoiceTemplate('FA_3')
      .replace(/#nip#/g, nip)
      .replace(/#invoicing_date#/g, todayDate())
      .replace(/#invoice_number#/g, generateUniqueInvoiceNumber());

    const parsed = parseXml(raw);
    const rebuilt = serializeInvoiceXml(parsed).toString('utf8');

    expect(rebuilt).toContain('<Faktura');
    expect(rebuilt).toContain(`<NIP>${nip}</NIP>`);

    const sendRequest = buildSendRequest(client, rebuilt, cipherKey, cipherIv);
    const { ksefNumber } = await openSendCloseVerify(client, encryptionData, sendRequest);
    expect(ksefNumber).toBeTruthy();
  });
});
