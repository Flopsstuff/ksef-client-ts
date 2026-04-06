import type { KSeFClient } from '../client.js';
import type { UpoVersion } from '../http/ksef-feature.js';
import type { FormCode } from '../models/common.js';
import type { OnlineSessionState } from '../models/sessions/session-state.js';
import { DEFAULT_FORM_CODE } from '../models/document-structures/index.js';
import type { OnlineSessionHandle, ParsedUpoInfo, PollOptions, UpoInfo } from './types.js';
import { pollUntil } from './polling.js';
import { parseUpoXml } from '../xml/index.js';
import { validate as validateInvoice } from '../validation/invoice-validator.js';
import { KSeFValidationError } from '../errors/ksef-validation-error.js';

export interface OpenOnlineSessionOptions {
  formCode?: FormCode;
  upoVersion?: UpoVersion | string;
  /** Validate invoices against XSD schema before sending. Default: false. */
  validate?: boolean;
}

export interface SendAndCloseOptions extends OpenOnlineSessionOptions {
  pollOptions?: PollOptions;
}

interface SessionHandleParams {
  client: KSeFClient;
  sessionRef: string;
  validUntil: string;
  cipherKey: Uint8Array;
  cipherIv: Uint8Array;
  formCode: FormCode;
  validate?: boolean;
}

function buildSessionHandle(params: SessionHandleParams): OnlineSessionHandle {
  const { client, sessionRef, validUntil, cipherKey, cipherIv, formCode, validate } = params;

  async function fetchUpo(pollOpts?: PollOptions): Promise<UpoInfo> {
    const result = await pollUntil(
      () => client.sessionStatus.getSessionStatus(sessionRef),
      (s) => s.status.code === 200 || s.status.code >= 400,
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
  }

  return {
    sessionRef,
    validUntil,

    async sendInvoice(invoiceXml: string | Uint8Array): Promise<string> {
      if (validate) {
        const xmlStr = typeof invoiceXml === 'string' ? invoiceXml : new TextDecoder().decode(invoiceXml);
        const vResult = await validateInvoice(xmlStr);
        if (!vResult.valid) {
          throw new KSeFValidationError(
            'Invoice validation failed',
            vResult.errors.map(e => ({ field: e.path, message: e.message })),
          );
        }
      }
      const data = typeof invoiceXml === 'string' ? new TextEncoder().encode(invoiceXml) : invoiceXml;
      const plainMeta = client.crypto.getFileMetadata(data);
      const encrypted = client.crypto.encryptAES256(data, cipherKey, cipherIv);
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
      return fetchUpo(pollOpts);
    },

    async waitForUpoParsed(pollOpts?: PollOptions): Promise<ParsedUpoInfo> {
      const upoInfo = await fetchUpo(pollOpts);
      const parsed = [];
      for (const page of upoInfo.pages) {
        const result = await client.sessionStatus.getSessionUpo(sessionRef, page.referenceNumber);
        parsed.push(parseUpoXml(result.upo));
      }
      return { ...upoInfo, parsed };
    },

    getState(): OnlineSessionState {
      return {
        referenceNumber: sessionRef,
        aesKey: Buffer.from(cipherKey).toString('base64'),
        iv: Buffer.from(cipherIv).toString('base64'),
        accessToken: client.authManager.getAccessToken()!,
        formCode,
        validUntil,
      };
    },
  };
}

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

  return buildSessionHandle({
    client,
    sessionRef: openResp.referenceNumber,
    validUntil: openResp.validUntil,
    cipherKey: encData.cipherKey,
    cipherIv: encData.cipherIv,
    formCode,
    validate: options?.validate,
  });
}

export function resumeOnlineSession(
  client: KSeFClient,
  state: OnlineSessionState,
  options?: Pick<OpenOnlineSessionOptions, 'validate'>,
): OnlineSessionHandle {
  client.authManager.setAccessToken(state.accessToken);

  return buildSessionHandle({
    client,
    sessionRef: state.referenceNumber,
    validUntil: state.validUntil,
    cipherKey: new Uint8Array(Buffer.from(state.aesKey, 'base64')),
    cipherIv: new Uint8Array(Buffer.from(state.iv, 'base64')),
    formCode: state.formCode,
    validate: options?.validate,
  });
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
