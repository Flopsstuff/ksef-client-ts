import type { KSeFClient } from '../client.js';
import type { UpoVersion } from '../http/ksef-feature.js';
import type { FormCode } from '../models/common.js';
import { DEFAULT_FORM_CODE } from '../models/document-structures/index.js';
import type { BatchPartSendingInfo } from '../models/sessions/batch-types.js';
import type { BatchUploadResult, ParsedBatchUploadResult, PollOptions } from './types.js';
import { BatchFileBuilder, type BatchStreamBuildResult } from '../builders/batch-file.js';
import { pollUntil } from './polling.js';
import { parseUpoXml } from '../xml/index.js';

export interface BatchUploadOptions {
  formCode?: FormCode;
  upoVersion?: UpoVersion | string;
  pollOptions?: PollOptions;
  /** Max unencrypted part size in bytes. Default: 100 MB. */
  maxPartSize?: number;
  /** Pass-through to KSeF API. */
  offlineMode?: boolean;
  /** Validate each invoice XML in the ZIP before uploading. */
  validate?: boolean;
}

export async function uploadBatch(
  client: KSeFClient,
  zipData: Uint8Array,
  options?: BatchUploadOptions,
): Promise<BatchUploadResult> {
  await client.crypto.init();

  if (options?.validate) {
    const { unzip } = await import('../utils/zip.js');
    const { validateBatch, batchValidationDetails } = await import('../validation/invoice-validator.js');
    const { KSeFValidationError } = await import('../errors/ksef-validation-error.js');
    const zipBuf = Buffer.isBuffer(zipData) ? zipData : Buffer.from(zipData.buffer, zipData.byteOffset, zipData.byteLength);
    const files = await unzip(zipBuf);
    const invoices = [...files.entries()]
      .filter(([name]) => name.endsWith('.xml'))
      .map(([name, data]) => ({ fileName: name, xml: data.toString('utf-8') }));
    if (invoices.length > 0) {
      const result = await validateBatch(invoices);
      if (!result.valid) {
        const invalidCount = result.results.filter(r => !r.result.valid).length;
        throw new KSeFValidationError(
          `Batch validation failed: ${invalidCount} of ${invoices.length} invoices invalid`,
          batchValidationDetails(result),
        );
      }
    }
  }

  const encData = client.crypto.getEncryptionData();
  const formCode = options?.formCode ?? DEFAULT_FORM_CODE;

  // KSeF provides a single (key, IV) pair per session — all parts share it.
  const encryptFn = (part: Uint8Array) =>
    client.crypto.encryptAES256(part, encData.cipherKey, encData.cipherIv);

  const { batchFile, encryptedParts } = BatchFileBuilder.build(zipData, encryptFn, {
    maxPartSize: options?.maxPartSize,
  });

  const openResp = await client.batchSession.openSession(
    {
      formCode,
      encryption: encData.encryptionInfo,
      batchFile,
      offlineMode: options?.offlineMode,
    },
    options?.upoVersion,
  );

  const sendingParts: BatchPartSendingInfo[] = encryptedParts.map((part, i) => ({
    data: part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer,
    metadata: {
      hashSHA: batchFile.fileParts[i]!.fileHash,
      fileSize: batchFile.fileParts[i]!.fileSize,
    },
    ordinalNumber: i + 1,
  }));
  await client.batchSession.sendParts(openResp, sendingParts);

  await client.batchSession.closeSession(openResp.referenceNumber);

  const result = await pollUntil(
    () => client.sessionStatus.getSessionStatus(openResp.referenceNumber),
    (s) => s.status.code === 200 || s.status.code >= 400,
    { ...options?.pollOptions, description: `UPO for batch ${openResp.referenceNumber}` },
  );
  if (result.status.code !== 200) {
    throw new Error(`Batch session failed: ${result.status.code} — ${result.status.description}`);
  }

  return {
    sessionRef: openResp.referenceNumber,
    upo: {
      pages: result.upo?.pages ?? [],
      invoiceCount: result.invoiceCount,
      successfulInvoiceCount: result.successfulInvoiceCount,
      failedInvoiceCount: result.failedInvoiceCount,
    },
  };
}

export { type BatchStreamBuildResult };

export async function uploadBatchStream(
  client: KSeFClient,
  zipStreamFactory: () => ReadableStream<Uint8Array>,
  zipSize: number,
  options?: BatchUploadOptions,
): Promise<BatchUploadResult> {
  await client.crypto.init();
  const encData = client.crypto.getEncryptionData();
  const formCode = options?.formCode ?? DEFAULT_FORM_CODE;

  const encryptStreamFn = (stream: ReadableStream<Uint8Array>) =>
    client.crypto.encryptAES256Stream(stream, encData.cipherKey, encData.cipherIv);

  const hashStreamFn = (stream: ReadableStream<Uint8Array>) =>
    client.crypto.getFileMetadataFromStream(stream);

  const { batchFile, streamParts } = await BatchFileBuilder.buildFromStream(
    zipStreamFactory,
    zipSize,
    encryptStreamFn,
    hashStreamFn,
    { maxPartSize: options?.maxPartSize },
  );

  const openResp = await client.batchSession.openSession(
    {
      formCode,
      encryption: encData.encryptionInfo,
      batchFile,
      offlineMode: options?.offlineMode,
    },
    options?.upoVersion,
  );

  await client.batchSession.sendPartsWithStream(openResp, streamParts);

  await client.batchSession.closeSession(openResp.referenceNumber);

  const result = await pollUntil(
    () => client.sessionStatus.getSessionStatus(openResp.referenceNumber),
    (s) => s.status.code === 200 || s.status.code >= 400,
    { ...options?.pollOptions, description: `UPO for batch ${openResp.referenceNumber}` },
  );
  if (result.status.code !== 200) {
    throw new Error(`Batch session failed: ${result.status.code} — ${result.status.description}`);
  }

  return {
    sessionRef: openResp.referenceNumber,
    upo: {
      pages: result.upo?.pages ?? [],
      invoiceCount: result.invoiceCount,
      successfulInvoiceCount: result.successfulInvoiceCount,
      failedInvoiceCount: result.failedInvoiceCount,
    },
  };
}

export async function uploadBatchStreamParsed(
  client: KSeFClient,
  zipStreamFactory: () => ReadableStream<Uint8Array>,
  zipSize: number,
  options?: BatchUploadOptions,
): Promise<ParsedBatchUploadResult> {
  const result = await uploadBatchStream(client, zipStreamFactory, zipSize, options);
  const parsed = [];
  for (const page of result.upo.pages) {
    const upoResult = await client.sessionStatus.getSessionUpo(result.sessionRef, page.referenceNumber);
    parsed.push(parseUpoXml(upoResult.upo));
  }
  return {
    sessionRef: result.sessionRef,
    upo: { ...result.upo, parsed },
  };
}

export async function uploadBatchParsed(
  client: KSeFClient,
  zipData: Uint8Array,
  options?: BatchUploadOptions,
): Promise<ParsedBatchUploadResult> {
  const result = await uploadBatch(client, zipData, options);
  const parsed = [];
  for (const page of result.upo.pages) {
    const upoResult = await client.sessionStatus.getSessionUpo(result.sessionRef, page.referenceNumber);
    parsed.push(parseUpoXml(upoResult.upo));
  }
  return {
    sessionRef: result.sessionRef,
    upo: { ...result.upo, parsed },
  };
}
