import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadBatch, uploadBatchParsed, uploadBatchStream, uploadBatchStreamParsed } from '../../../src/workflows/batch-session-workflow.js';
import type { UpoPotwierdzenie } from '../../../src/xml/index.js';

function createMockClient() {
  return {
    crypto: {
      init: vi.fn(),
      getEncryptionData: vi.fn().mockReturnValue({
        encryptionInfo: { encryptedSymmetricKey: 'enc-key', initializationVector: 'iv' },
        cipherKey: new Uint8Array(32),
        cipherIv: new Uint8Array(16),
      }),
      encryptAES256: vi.fn().mockImplementation((content: Uint8Array) => {
        // Deterministic "encryption" — returns same-length buffer with flipped bits
        const out = new Uint8Array(content.length);
        for (let i = 0; i < content.length; i++) out[i] = content[i]! ^ 0xff;
        return out;
      }),
      encryptAES256Stream: vi.fn().mockImplementation((input: ReadableStream<Uint8Array>) => {
        // Pass-through "encryption" for stream tests
        return input;
      }),
      getFileMetadataFromStream: vi.fn().mockImplementation(async (stream: ReadableStream<Uint8Array>) => {
        const reader = stream.getReader();
        let fileSize = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          fileSize += value.byteLength;
        }
        return { hashSHA: 'stream-hash-base64', fileSize };
      }),
    },
    batchSession: {
      openSession: vi.fn().mockResolvedValue({
        referenceNumber: 'batch-ref-1',
        partUploadRequests: [
          { method: 'PUT', ordinalNumber: 1, url: 'https://upload.example.com/1', headers: {} },
        ],
      }),
      sendParts: vi.fn().mockResolvedValue(undefined),
      sendPartsWithStream: vi.fn().mockResolvedValue(undefined),
      closeSession: vi.fn().mockResolvedValue(undefined),
    },
    sessionStatus: {
      getSessionStatus: vi.fn().mockResolvedValue({
        status: { code: 200, description: 'OK' },
        upo: { pages: [{ referenceNumber: 'upo-batch-1', downloadUrl: 'https://example.com/upo' }] },
        invoiceCount: 5,
        successfulInvoiceCount: 5,
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

describe('uploadBatch', () => {
  const zipData = new Uint8Array(500).fill(0xab);

  it('executes full open -> encrypt -> upload -> close -> poll flow', async () => {
    const result = await uploadBatch(client, zipData, { pollOptions: { intervalMs: 1 } });
    expect(client.crypto.init).toHaveBeenCalled();
    expect(client.crypto.encryptAES256).toHaveBeenCalled();
    expect(client.batchSession.openSession).toHaveBeenCalled();
    expect(client.batchSession.sendParts).toHaveBeenCalled();
    expect(client.batchSession.closeSession).toHaveBeenCalledWith('batch-ref-1');
    expect(result.sessionRef).toBe('batch-ref-1');
    expect(result.upo.pages).toHaveLength(1);
    expect(result.upo.invoiceCount).toBe(5);
  });

  it('passes formCode and upoVersion', async () => {
    const formCode = { systemCode: 'PEF', schemaVersion: '1', value: 'PEF (1)' };
    await uploadBatch(client, zipData, { formCode, upoVersion: 'v4-3', pollOptions: { intervalMs: 1 } });
    expect(client.batchSession.openSession).toHaveBeenCalledWith(
      expect.objectContaining({ formCode }),
      'v4-3',
    );
  });

  it('passes offlineMode to openSession', async () => {
    await uploadBatch(client, zipData, { offlineMode: true, pollOptions: { intervalMs: 1 } });
    expect(client.batchSession.openSession).toHaveBeenCalledWith(
      expect.objectContaining({ offlineMode: true }),
      undefined,
    );
  });

  it('throws on non-200 final status', async () => {
    client.sessionStatus.getSessionStatus.mockResolvedValue({
      status: { code: 400, description: 'Bad request' },
    });
    await expect(
      uploadBatch(client, zipData, { pollOptions: { intervalMs: 1 } }),
    ).rejects.toThrow('Batch session failed: 400');
  });

  it('sends encrypted parts (not raw data)', async () => {
    await uploadBatch(client, zipData, { pollOptions: { intervalMs: 1 } });
    const sentParts = client.batchSession.sendParts.mock.calls[0][1];
    // Verify the data was "encrypted" (XOR 0xff)
    const sentBytes = new Uint8Array(sentParts[0].data);
    expect(sentBytes[0]).toBe(0xab ^ 0xff);
  });

  it('computes batchFile metadata with correct hashes', async () => {
    await uploadBatch(client, zipData, { pollOptions: { intervalMs: 1 } });
    const openCall = client.batchSession.openSession.mock.calls[0][0];
    expect(openCall.batchFile.fileSize).toBe(500);
    expect(openCall.batchFile.fileHash).toBeTruthy();
    expect(openCall.batchFile.fileParts).toHaveLength(1);
    expect(openCall.batchFile.fileParts[0].ordinalNumber).toBe(1);
  });

  it('auto-splits large data with maxPartSize', async () => {
    const largeData = new Uint8Array(10000).fill(0x01);
    client.batchSession.openSession.mockResolvedValue({
      referenceNumber: 'batch-ref-2',
      partUploadRequests: [
        { method: 'PUT', ordinalNumber: 1, url: 'https://upload.example.com/1', headers: {} },
        { method: 'PUT', ordinalNumber: 2, url: 'https://upload.example.com/2', headers: {} },
        { method: 'PUT', ordinalNumber: 3, url: 'https://upload.example.com/3', headers: {} },
      ],
    });
    await uploadBatch(client, largeData, { maxPartSize: 4000, pollOptions: { intervalMs: 1 } });
    const openCall = client.batchSession.openSession.mock.calls[0][0];
    expect(openCall.batchFile.fileParts).toHaveLength(3);
    expect(openCall.batchFile.fileParts[0].ordinalNumber).toBe(1);
    expect(openCall.batchFile.fileParts[2].ordinalNumber).toBe(3);

    const sentParts = client.batchSession.sendParts.mock.calls[0][1];
    expect(sentParts).toHaveLength(3);
  });

  it('uploadBatchParsed fetches and parses UPO pages', async () => {
    const SAMPLE_UPO_XML = `<?xml version="1.0" encoding="utf-8"?>
<Potwierdzenie xmlns="http://upo.schematy.mf.gov.pl/KSeF/v4-3">
  <NazwaPodmiotuPrzyjmujacego>Ministerstwo Finansów</NazwaPodmiotuPrzyjmujacego>
  <NumerReferencyjnySesji>batch-ref-1</NumerReferencyjnySesji>
  <Uwierzytelnienie>
    <IdKontekstu><Nip>1234567890</Nip></IdKontekstu>
    <SkrotDokumentuUwierzytelniajacego>abc123=</SkrotDokumentuUwierzytelniajacego>
  </Uwierzytelnienie>
  <NazwaStrukturyLogicznej>Schemat_FA(3)_v1-0E.xsd</NazwaStrukturyLogicznej>
  <KodFormularza>FA (3)</KodFormularza>
  <Dokument>
    <NipSprzedawcy>1234567890</NipSprzedawcy>
    <NumerKSeFDokumentu>1234567890-20250916-AABB-01</NumerKSeFDokumentu>
    <NumerFaktury>FA/001/2025</NumerFaktury>
    <DataWystawieniaFaktury>2025-09-16</DataWystawieniaFaktury>
    <DataPrzeslaniaDokumentu>2025-09-16T10:00:00.000+02:00</DataPrzeslaniaDokumentu>
    <DataNadaniaNumeruKSeF>2025-09-16T10:00:01.000+02:00</DataNadaniaNumeruKSeF>
    <SkrotDokumentu>hash=</SkrotDokumentu>
    <TrybWysylki>Online</TrybWysylki>
  </Dokument>
</Potwierdzenie>`;

    client.sessionStatus.getSessionUpo = vi.fn().mockResolvedValue({ upo: SAMPLE_UPO_XML });
    const result = await uploadBatchParsed(client, zipData, { pollOptions: { intervalMs: 1 } });

    expect(result.sessionRef).toBe('batch-ref-1');
    expect(result.upo.pages).toHaveLength(1);
    expect(result.upo.parsed).toHaveLength(1);

    const parsed: UpoPotwierdzenie = result.upo.parsed[0];
    expect(parsed.numerReferencyjnySesji).toBe('batch-ref-1');
    expect(parsed.dokumenty[0].numerKSeFDokumentu).toBe('1234567890-20250916-AABB-01');

    expect(client.sessionStatus.getSessionUpo).toHaveBeenCalledWith('batch-ref-1', 'upo-batch-1');
  });

  it('passes parallelism to sendParts', async () => {
    await uploadBatch(client, zipData, { parallelism: 3, pollOptions: { intervalMs: 1 } });
    expect(client.batchSession.sendParts).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      3,
    );
  });

  it('passes undefined parallelism when not specified', async () => {
    await uploadBatch(client, zipData, { pollOptions: { intervalMs: 1 } });
    expect(client.batchSession.sendParts).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
    );
  });

  it('returns empty pages when upo is undefined', async () => {
    client.sessionStatus.getSessionStatus.mockResolvedValue({
      status: { code: 200, description: 'OK' },
    });
    const result = await uploadBatch(client, zipData, { pollOptions: { intervalMs: 1 } });
    expect(result.upo.pages).toEqual([]);
  });
});

describe('uploadBatchStream', () => {
  const zipData = new Uint8Array(500).fill(0xab);
  const zipStreamFactory = () => new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(zipData);
      controller.close();
    },
  });

  it('executes full init → hash → split → open → upload → close → poll flow', async () => {
    const result = await uploadBatchStream(client, zipStreamFactory, zipData.length, { pollOptions: { intervalMs: 1 } });

    expect(client.crypto.init).toHaveBeenCalled();
    expect(client.crypto.getFileMetadataFromStream).toHaveBeenCalled();
    expect(client.crypto.encryptAES256Stream).toHaveBeenCalled();
    expect(client.batchSession.openSession).toHaveBeenCalled();
    expect(client.batchSession.sendPartsWithStream).toHaveBeenCalled();
    expect(client.batchSession.closeSession).toHaveBeenCalledWith('batch-ref-1');
    expect(result.sessionRef).toBe('batch-ref-1');
    expect(result.upo.pages).toHaveLength(1);
    expect(result.upo.invoiceCount).toBe(5);
  });

  it('result structure matches uploadBatch result', async () => {
    const streamResult = await uploadBatchStream(client, zipStreamFactory, zipData.length, { pollOptions: { intervalMs: 1 } });

    expect(streamResult).toHaveProperty('sessionRef');
    expect(streamResult).toHaveProperty('upo');
    expect(streamResult.upo).toHaveProperty('pages');
    expect(streamResult.upo).toHaveProperty('invoiceCount');
    expect(streamResult.upo).toHaveProperty('successfulInvoiceCount');
    expect(streamResult.upo).toHaveProperty('failedInvoiceCount');
  });

  it('passes formCode and upoVersion', async () => {
    const formCode = { systemCode: 'PEF', schemaVersion: '1', value: 'PEF (1)' };
    await uploadBatchStream(client, zipStreamFactory, zipData.length, { formCode, upoVersion: 'v4-3', pollOptions: { intervalMs: 1 } });
    expect(client.batchSession.openSession).toHaveBeenCalledWith(
      expect.objectContaining({ formCode }),
      'v4-3',
    );
  });

  it('throws on non-200 final status', async () => {
    client.sessionStatus.getSessionStatus.mockResolvedValue({
      status: { code: 400, description: 'Bad request' },
    });
    await expect(
      uploadBatchStream(client, zipStreamFactory, zipData.length, { pollOptions: { intervalMs: 1 } }),
    ).rejects.toThrow('Batch session failed: 400');
  });

  it('uses sendPartsWithStream (not sendParts)', async () => {
    await uploadBatchStream(client, zipStreamFactory, zipData.length, { pollOptions: { intervalMs: 1 } });
    expect(client.batchSession.sendPartsWithStream).toHaveBeenCalled();
    expect(client.batchSession.sendParts).not.toHaveBeenCalled();
  });

  it('passes parallelism to sendPartsWithStream', async () => {
    await uploadBatchStream(client, zipStreamFactory, zipData.length, { parallelism: 2, pollOptions: { intervalMs: 1 } });
    expect(client.batchSession.sendPartsWithStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2,
    );
  });

  it('passes undefined parallelism when not specified', async () => {
    await uploadBatchStream(client, zipStreamFactory, zipData.length, { pollOptions: { intervalMs: 1 } });
    expect(client.batchSession.sendPartsWithStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
    );
  });

  it('uploadBatchStreamParsed fetches and parses UPO pages', async () => {
    const SAMPLE_UPO_XML = `<?xml version="1.0" encoding="utf-8"?>
<Potwierdzenie xmlns="http://upo.schematy.mf.gov.pl/KSeF/v4-3">
  <NazwaPodmiotuPrzyjmujacego>Ministerstwo Finansów</NazwaPodmiotuPrzyjmujacego>
  <NumerReferencyjnySesji>batch-ref-1</NumerReferencyjnySesji>
  <Uwierzytelnienie>
    <IdKontekstu><Nip>1234567890</Nip></IdKontekstu>
    <SkrotDokumentuUwierzytelniajacego>abc123=</SkrotDokumentuUwierzytelniajacego>
  </Uwierzytelnienie>
  <NazwaStrukturyLogicznej>Schemat_FA(3)_v1-0E.xsd</NazwaStrukturyLogicznej>
  <KodFormularza>FA (3)</KodFormularza>
  <Dokument>
    <NipSprzedawcy>1234567890</NipSprzedawcy>
    <NumerKSeFDokumentu>1234567890-20250916-AABB-01</NumerKSeFDokumentu>
    <NumerFaktury>FA/001/2025</NumerFaktury>
    <DataWystawieniaFaktury>2025-09-16</DataWystawieniaFaktury>
    <DataPrzeslaniaDokumentu>2025-09-16T10:00:00.000+02:00</DataPrzeslaniaDokumentu>
    <DataNadaniaNumeruKSeF>2025-09-16T10:00:01.000+02:00</DataNadaniaNumeruKSeF>
    <SkrotDokumentu>hash=</SkrotDokumentu>
    <TrybWysylki>Online</TrybWysylki>
  </Dokument>
</Potwierdzenie>`;

    client.sessionStatus.getSessionUpo = vi.fn().mockResolvedValue({ upo: SAMPLE_UPO_XML });
    const result = await uploadBatchStreamParsed(client, zipStreamFactory, zipData.length, { pollOptions: { intervalMs: 1 } });

    expect(result.sessionRef).toBe('batch-ref-1');
    expect(result.upo.parsed).toHaveLength(1);
    expect(result.upo.parsed[0].numerReferencyjnySesji).toBe('batch-ref-1');
  });
});
