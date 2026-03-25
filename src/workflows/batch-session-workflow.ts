import type { KSeFClient } from '../client.js';
import type { UpoVersion } from '../http/ksef-feature.js';
import type { FormCode } from '../models/common.js';
import type { BatchPartSendingInfo } from '../models/sessions/batch-types.js';
import type { BatchUploadResult, PollOptions } from './types.js';
import { BatchFileBuilder } from '../builders/batch-file.js';
import { pollUntil } from './polling.js';

export interface BatchUploadOptions {
  formCode?: FormCode;
  upoVersion?: UpoVersion | string;
  pollOptions?: PollOptions;
  /** Max unencrypted part size in bytes. Default: 100 MB. */
  maxPartSize?: number;
  /** Pass-through to KSeF API. */
  offlineMode?: boolean;
}

const DEFAULT_FORM_CODE: FormCode = { systemCode: 'FA', schemaVersion: '3', value: 'FA (3)' };

export async function uploadBatch(
  client: KSeFClient,
  zipData: Uint8Array,
  options?: BatchUploadOptions,
): Promise<BatchUploadResult> {
  await client.crypto.init();
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
