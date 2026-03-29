import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openOnlineSession, openSendAndClose } from '../../../src/workflows/online-session-workflow.js';
import { KSeFValidationError } from '../../../src/errors/ksef-validation-error.js';
import { validate as validateInvoice } from '../../../src/validation/invoice-validator.js';
import type { UpoPotwierdzenie } from '../../../src/xml/index.js';

vi.mock('../../../src/validation/invoice-validator.js', () => ({
  validate: vi.fn(),
}));

const mockValidateInvoice = vi.mocked(validateInvoice);

function createMockClient() {
  return {
    crypto: {
      init: vi.fn(),
      getEncryptionData: vi.fn().mockReturnValue({
        encryptionInfo: { encryptedSymmetricKey: 'enc-key', initializationVector: 'iv' },
        cipherKey: new Uint8Array(32),
        cipherIv: new Uint8Array(16),
      }),
      getFileMetadata: vi.fn().mockReturnValue({ hashSHA: 'hash-abc', fileSize: 100 }),
      encryptAES256: vi.fn().mockReturnValue(new Uint8Array(128)),
    },
    onlineSession: {
      openSession: vi.fn().mockResolvedValue({ referenceNumber: 'sess-ref-1', validUntil: '2099-01-01T00:00:00Z' }),
      sendInvoice: vi.fn().mockResolvedValue({ referenceNumber: 'inv-ref-1' }),
      closeSession: vi.fn().mockResolvedValue(undefined),
    },
    sessionStatus: {
      getSessionStatus: vi.fn().mockResolvedValue({
        status: { code: 200, description: 'OK' },
        upo: { pages: [{ referenceNumber: 'upo-ref-1', downloadUrl: 'https://example.com/upo' }] },
        invoiceCount: 1,
        successfulInvoiceCount: 1,
        failedInvoiceCount: 0,
      }),
    },
  } as any;
}

let client: ReturnType<typeof createMockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  client = createMockClient();
});

describe('openOnlineSession', () => {
  it('initializes crypto and opens session', async () => {
    const handle = await openOnlineSession(client);
    expect(client.crypto.init).toHaveBeenCalled();
    expect(client.crypto.getEncryptionData).toHaveBeenCalled();
    expect(client.onlineSession.openSession).toHaveBeenCalledWith(
      expect.objectContaining({
        formCode: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' },
        encryption: expect.any(Object),
      }),
      undefined,
    );
    expect(handle.sessionRef).toBe('sess-ref-1');
    expect(handle.validUntil).toBe('2099-01-01T00:00:00Z');
  });

  it('passes custom formCode and upoVersion', async () => {
    const formCode = { systemCode: 'PEF', schemaVersion: '1', value: 'PEF (1)' };
    await openOnlineSession(client, { formCode, upoVersion: 'v4-3' });
    expect(client.onlineSession.openSession).toHaveBeenCalledWith(
      expect.objectContaining({ formCode }),
      'v4-3',
    );
  });

  it('handle.sendInvoice encrypts and sends', async () => {
    const handle = await openOnlineSession(client);
    const ref = await handle.sendInvoice('<invoice>test</invoice>');
    expect(ref).toBe('inv-ref-1');
    expect(client.crypto.getFileMetadata).toHaveBeenCalledTimes(2); // plain + encrypted
    expect(client.crypto.encryptAES256).toHaveBeenCalled();
    expect(client.onlineSession.sendInvoice).toHaveBeenCalledWith('sess-ref-1', expect.objectContaining({
      invoiceHash: 'hash-abc',
      invoiceSize: 100,
      encryptedInvoiceHash: 'hash-abc',
      encryptedInvoiceSize: 100,
      encryptedInvoiceContent: expect.any(String),
    }));
  });

  it('handle.sendInvoice accepts Uint8Array', async () => {
    const handle = await openOnlineSession(client);
    await handle.sendInvoice(new Uint8Array([1, 2, 3]));
    expect(client.crypto.getFileMetadata).toHaveBeenCalled();
    expect(client.onlineSession.sendInvoice).toHaveBeenCalled();
  });

  it('handle.close calls closeSession', async () => {
    const handle = await openOnlineSession(client);
    await handle.close();
    expect(client.onlineSession.closeSession).toHaveBeenCalledWith('sess-ref-1');
  });

  it('handle.waitForUpo polls and returns UpoInfo', async () => {
    const handle = await openOnlineSession(client);
    const upo = await handle.waitForUpo({ intervalMs: 1, maxAttempts: 5 });
    expect(upo.pages).toHaveLength(1);
    expect(upo.pages[0].referenceNumber).toBe('upo-ref-1');
    expect(upo.invoiceCount).toBe(1);
    expect(upo.successfulInvoiceCount).toBe(1);
    expect(upo.failedInvoiceCount).toBe(0);
  });

  it('handle.waitForUpo throws on non-200 status', async () => {
    client.sessionStatus.getSessionStatus.mockResolvedValue({
      status: { code: 500, description: 'Internal error' },
    });
    const handle = await openOnlineSession(client);
    await expect(handle.waitForUpo({ intervalMs: 1 })).rejects.toThrow('Session failed: 500');
  });

  it('handle.waitForUpo polls past code 100', async () => {
    let call = 0;
    client.sessionStatus.getSessionStatus.mockImplementation(async () => {
      call++;
      if (call < 3) return { status: { code: 100, description: 'Pending' } };
      return {
        status: { code: 200, description: 'OK' },
        upo: { pages: [] },
      };
    });
    const handle = await openOnlineSession(client);
    const upo = await handle.waitForUpo({ intervalMs: 1, maxAttempts: 10 });
    expect(upo.pages).toEqual([]);
    expect(client.sessionStatus.getSessionStatus).toHaveBeenCalledTimes(3);
  });
});

const SAMPLE_UPO_XML = `<?xml version="1.0" encoding="utf-8"?>
<Potwierdzenie xmlns="http://upo.schematy.mf.gov.pl/KSeF/v4-3">
  <NazwaPodmiotuPrzyjmujacego>Ministerstwo Finansów</NazwaPodmiotuPrzyjmujacego>
  <NumerReferencyjnySesji>sess-ref-1</NumerReferencyjnySesji>
  <Uwierzytelnienie>
    <IdKontekstu><Nip>1234567890</Nip></IdKontekstu>
    <SkrotDokumentuUwierzytelniajacego>abc123hash=</SkrotDokumentuUwierzytelniajacego>
  </Uwierzytelnienie>
  <NazwaStrukturyLogicznej>Schemat_FA(3)_v1-0E.xsd</NazwaStrukturyLogicznej>
  <KodFormularza>FA (3)</KodFormularza>
  <Dokument>
    <NipSprzedawcy>1234567890</NipSprzedawcy>
    <NumerKSeFDokumentu>1234567890-20250916-AABBCCDDEE-01</NumerKSeFDokumentu>
    <NumerFaktury>FA/001/2025</NumerFaktury>
    <DataWystawieniaFaktury>2025-09-16</DataWystawieniaFaktury>
    <DataPrzeslaniaDokumentu>2025-09-16T10:00:00.000+02:00</DataPrzeslaniaDokumentu>
    <DataNadaniaNumeruKSeF>2025-09-16T10:00:01.000+02:00</DataNadaniaNumeruKSeF>
    <SkrotDokumentu>docHash123=</SkrotDokumentu>
    <TrybWysylki>Online</TrybWysylki>
  </Dokument>
</Potwierdzenie>`;

describe('waitForUpoParsed', () => {
  it('fetches and parses UPO for each page', async () => {
    client.sessionStatus.getSessionUpo = vi.fn().mockResolvedValue({ upo: SAMPLE_UPO_XML, hash: 'h1' });
    const handle = await openOnlineSession(client);
    const result = await handle.waitForUpoParsed({ intervalMs: 1 });

    expect(result.pages).toHaveLength(1);
    expect(result.invoiceCount).toBe(1);
    expect(result.parsed).toHaveLength(1);

    const parsed: UpoPotwierdzenie = result.parsed[0];
    expect(parsed.numerReferencyjnySesji).toBe('sess-ref-1');
    expect(parsed.uwierzytelnienie.idKontekstu).toEqual({ kind: 'Nip', nip: '1234567890' });
    expect(parsed.dokumenty).toHaveLength(1);
    expect(parsed.dokumenty[0].numerKSeFDokumentu).toBe('1234567890-20250916-AABBCCDDEE-01');

    expect(client.sessionStatus.getSessionUpo).toHaveBeenCalledWith('sess-ref-1', 'upo-ref-1');
  });

  it('parses multiple UPO pages', async () => {
    client.sessionStatus.getSessionStatus.mockResolvedValue({
      status: { code: 200, description: 'OK' },
      upo: {
        pages: [
          { referenceNumber: 'upo-page-1', downloadUrl: 'https://example.com/upo/1' },
          { referenceNumber: 'upo-page-2', downloadUrl: 'https://example.com/upo/2' },
        ],
      },
      invoiceCount: 2,
      successfulInvoiceCount: 2,
      failedInvoiceCount: 0,
    });
    client.sessionStatus.getSessionUpo = vi.fn().mockResolvedValue({ upo: SAMPLE_UPO_XML });
    const handle = await openOnlineSession(client);
    const result = await handle.waitForUpoParsed({ intervalMs: 1 });

    expect(result.parsed).toHaveLength(2);
    expect(client.sessionStatus.getSessionUpo).toHaveBeenCalledTimes(2);
    expect(client.sessionStatus.getSessionUpo).toHaveBeenCalledWith('sess-ref-1', 'upo-page-1');
    expect(client.sessionStatus.getSessionUpo).toHaveBeenCalledWith('sess-ref-1', 'upo-page-2');
  });

  it('does not affect existing waitForUpo behavior', async () => {
    const handle = await openOnlineSession(client);
    const upo = await handle.waitForUpo({ intervalMs: 1 });
    expect(upo.pages).toHaveLength(1);
    expect((upo as any).parsed).toBeUndefined();
  });
});

describe('openSendAndClose', () => {
  it('sends all invoices, closes, and returns UPO', async () => {
    const upo = await openSendAndClose(client, ['<inv1/>', '<inv2/>'], { pollOptions: { intervalMs: 1 } });
    expect(client.onlineSession.sendInvoice).toHaveBeenCalledTimes(2);
    expect(client.onlineSession.closeSession).toHaveBeenCalledWith('sess-ref-1');
    expect(upo.pages).toHaveLength(1);
  });
});

describe('validate-before-send', () => {
  it('validates invoice when validate option is true', async () => {
    mockValidateInvoice.mockResolvedValue({ valid: true, schemaType: 'FA3', errors: [] });
    const handle = await openOnlineSession(client, { validate: true });
    await handle.sendInvoice('<invoice>valid</invoice>');
    expect(mockValidateInvoice).toHaveBeenCalledWith('<invoice>valid</invoice>');
    expect(client.onlineSession.sendInvoice).toHaveBeenCalled();
  });

  it('throws KSeFValidationError when invoice is invalid', async () => {
    mockValidateInvoice.mockResolvedValue({
      valid: false,
      schemaType: null,
      errors: [{ code: 'MALFORMED_XML', message: 'Bad XML' }],
    });
    const handle = await openOnlineSession(client, { validate: true });
    await expect(handle.sendInvoice('<bad/>')).rejects.toThrow(KSeFValidationError);
    expect(client.onlineSession.sendInvoice).not.toHaveBeenCalled();
  });

  it('skips validation when validate option is not set', async () => {
    const handle = await openOnlineSession(client);
    await handle.sendInvoice('<invoice>test</invoice>');
    expect(mockValidateInvoice).not.toHaveBeenCalled();
    expect(client.onlineSession.sendInvoice).toHaveBeenCalled();
  });

  it('validates Uint8Array input by decoding to string', async () => {
    mockValidateInvoice.mockResolvedValue({ valid: true, schemaType: 'FA3', errors: [] });
    const handle = await openOnlineSession(client, { validate: true });
    const bytes = new TextEncoder().encode('<invoice>bytes</invoice>');
    await handle.sendInvoice(bytes);
    expect(mockValidateInvoice).toHaveBeenCalledWith('<invoice>bytes</invoice>');
  });
});
