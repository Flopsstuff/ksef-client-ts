import type { KSeFClient } from '../client.js';
import type { UpoVersion } from '../http/ksef-feature.js';
import type { FormCode } from '../models/common.js';
import type { OnlineSessionHandle, PollOptions, UpoInfo } from './types.js';
import { pollUntil } from './polling.js';

export interface OpenOnlineSessionOptions {
  formCode?: FormCode;
  upoVersion?: UpoVersion | string;
}

export interface SendAndCloseOptions extends OpenOnlineSessionOptions {
  pollOptions?: PollOptions;
}

const DEFAULT_FORM_CODE: FormCode = { systemCode: 'FA', schemaVersion: '3', value: 'FA (3)' };

export async function openOnlineSession(
  client: KSeFClient,
  options?: OpenOnlineSessionOptions,
): Promise<OnlineSessionHandle> {
  await client.crypto.init();
  const encData = client.crypto.getEncryptionData();
  const formCode = options?.formCode ?? DEFAULT_FORM_CODE;

  const openResp = await client.onlineSession.openSession(
    { formCode, encryption: encData.encryptionInfo },
    options?.upoVersion,
  );

  const sessionRef = openResp.referenceNumber;

  return {
    sessionRef,
    validUntil: openResp.validUntil,

    async sendInvoice(invoiceXml: string | Uint8Array): Promise<string> {
      const data = typeof invoiceXml === 'string' ? new TextEncoder().encode(invoiceXml) : invoiceXml;
      const plainMeta = client.crypto.getFileMetadata(data);
      const encrypted = client.crypto.encryptAES256(data, encData.cipherKey, encData.cipherIv);
      const encMeta = client.crypto.getFileMetadata(encrypted);

      const resp = await client.onlineSession.sendInvoice(sessionRef, {
        invoiceHash: plainMeta.hashSHA,
        invoiceSize: plainMeta.fileSize,
        encryptedInvoiceHash: encMeta.hashSHA,
        encryptedInvoiceSize: encMeta.fileSize,
        encryptedInvoiceContent: Buffer.from(encrypted).toString('base64'),
      });
      return resp.referenceNumber;
    },

    async close(): Promise<void> {
      await client.onlineSession.closeSession(sessionRef);
    },

    async waitForUpo(pollOpts?: PollOptions): Promise<UpoInfo> {
      const result = await pollUntil(
        () => client.sessionStatus.getSessionStatus(sessionRef),
        (s) => s.status.code !== 100,
        { ...pollOpts, description: `UPO for session ${sessionRef}` },
      );
      if (result.status.code !== 200) {
        throw new Error(`Session failed: ${result.status.code} — ${result.status.description}`);
      }
      return {
        pages: result.upo?.pages ?? [],
        invoiceCount: result.invoiceCount,
        successfulInvoiceCount: result.successfulInvoiceCount,
        failedInvoiceCount: result.failedInvoiceCount,
      };
    },
  };
}

export async function openSendAndClose(
  client: KSeFClient,
  invoices: Array<string | Uint8Array>,
  options?: SendAndCloseOptions,
): Promise<UpoInfo> {
  const handle = await openOnlineSession(client, options);
  for (const inv of invoices) {
    await handle.sendInvoice(inv);
  }
  await handle.close();
  return handle.waitForUpo(options?.pollOptions);
}
