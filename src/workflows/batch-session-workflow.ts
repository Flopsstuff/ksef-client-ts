import type { KSeFClient } from '../client.js';
import type { FormCode } from '../models/common.js';
import type { BatchPartSendingInfo } from '../models/sessions/batch-types.js';
import type { BatchUploadResult, PollOptions } from './types.js';
import { pollUntil } from './polling.js';

export interface BatchUploadOptions {
  formCode?: FormCode;
  upoVersion?: string;
  pollOptions?: PollOptions;
}

export interface BatchPart {
  data: ArrayBuffer;
}

const DEFAULT_FORM_CODE: FormCode = { systemCode: 'FA', schemaVersion: '3', value: 'FA (3)' };

export async function uploadBatch(
  client: KSeFClient,
  zipParts: BatchPart[],
  totalFileSize: number,
  totalFileHash: string,
  options?: BatchUploadOptions,
): Promise<BatchUploadResult> {
  await client.crypto.init();
  const encData = client.crypto.getEncryptionData();
  const formCode = options?.formCode ?? DEFAULT_FORM_CODE;

  const fileParts = zipParts.map((part, i) => {
    const meta = client.crypto.getFileMetadata(new Uint8Array(part.data));
    return { ordinalNumber: i + 1, fileSize: meta.fileSize, fileHash: meta.hashSHA };
  });

  const openResp = await client.batchSession.openSession(
    {
      formCode,
      encryption: encData.encryptionInfo,
      batchFile: { fileSize: totalFileSize, fileHash: totalFileHash, fileParts },
    },
    options?.upoVersion,
  );

  const sendingParts: BatchPartSendingInfo[] = zipParts.map((part, i) => {
    const meta = client.crypto.getFileMetadata(new Uint8Array(part.data));
    return { data: part.data, metadata: meta, ordinalNumber: i + 1 };
  });
  await client.batchSession.sendParts(openResp, sendingParts);

  await client.batchSession.closeSession(openResp.referenceNumber);

  const result = await pollUntil(
    () => client.sessionStatus.getSessionStatus(openResp.referenceNumber),
    (s) => s.status.code !== 100,
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
