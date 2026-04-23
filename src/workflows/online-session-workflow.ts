import type { KSeFClient } from '../client.js';
import type { UpoVersion } from '../http/ksef-feature.js';
import type { FormCode } from '../models/common.js';
import type { OnlineSessionState } from '../models/sessions/session-state.js';
import { KSeFSessionExpiredError } from '../errors/ksef-session-expired-error.js';
import { DefaultAuthManager } from '../http/auth-manager.js';
import { OnlineSessionService } from '../services/online-session.js';
import { SessionStatusService } from '../services/session-status.js';
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

interface SessionHandleDeps {
  crypto: { getFileMetadata(data: Uint8Array): { hashSHA: string; fileSize: number }; encryptAES256(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array };
  onlineSession: Pick<OnlineSessionService, 'sendInvoice' | 'closeSession'>;
  sessionStatus: Pick<SessionStatusService, 'getSessionStatus' | 'getSessionUpo'>;
  getAccessToken: () => string | undefined;
}

interface SessionHandleParams {
  deps: SessionHandleDeps;
  sessionRef: string;
  validUntil: string;
  cipherKey: Uint8Array;
  cipherIv: Uint8Array;
  formCode: FormCode;
  validate?: boolean;
}

function buildSessionHandle(params: SessionHandleParams): OnlineSessionHandle {
  const { deps, sessionRef, validUntil, cipherKey, cipherIv, formCode, validate } = params;

  async function fetchUpo(pollOpts?: PollOptions): Promise<UpoInfo> {
    const result = await pollUntil(
      () => deps.sessionStatus.getSessionStatus(sessionRef),
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
      const plainMeta = deps.crypto.getFileMetadata(data);
      const encrypted = deps.crypto.encryptAES256(data, cipherKey, cipherIv);
      const encMeta = deps.crypto.getFileMetadata(encrypted);

      const resp = await deps.onlineSession.sendInvoice(sessionRef, {
        invoiceHash: plainMeta.hashSHA,
        invoiceSize: plainMeta.fileSize,
        encryptedInvoiceHash: encMeta.hashSHA,
        encryptedInvoiceSize: encMeta.fileSize,
        encryptedInvoiceContent: Buffer.from(encrypted).toString('base64'),
      });
      return resp.referenceNumber;
    },

    async close(): Promise<void> {
      await deps.onlineSession.closeSession(sessionRef);
    },

    async waitForUpo(pollOpts?: PollOptions): Promise<UpoInfo> {
      return fetchUpo(pollOpts);
    },

    async waitForUpoParsed(pollOpts?: PollOptions): Promise<ParsedUpoInfo> {
      const upoInfo = await fetchUpo(pollOpts);
      const parsed = [];
      for (const page of upoInfo.pages) {
        const result = await deps.sessionStatus.getSessionUpo(sessionRef, page.referenceNumber);
        parsed.push(parseUpoXml(result.upo));
      }
      return { ...upoInfo, parsed };
    },

    getState(): OnlineSessionState {
      const token = deps.getAccessToken();
      if (!token) {
        throw new Error('Cannot serialize session state: no access token available');
      }
      return {
        referenceNumber: sessionRef,
        aesKey: Buffer.from(cipherKey).toString('base64'),
        iv: Buffer.from(cipherIv).toString('base64'),
        accessToken: token,
        formCode,
        validUntil,
        ...(validate ? { validate } : {}),
      };
    },
  };
}

export async function openOnlineSession(
  client: KSeFClient,
  options?: OpenOnlineSessionOptions,
): Promise<OnlineSessionHandle> {
  await client.crypto.init();
  const encData = await client.crypto.getEncryptionData();
  const formCode = options?.formCode ?? DEFAULT_FORM_CODE;

  const openResp = await client.onlineSession.openSession(
    { formCode, encryption: encData.encryptionInfo },
    options?.upoVersion,
  );

  return buildSessionHandle({
    deps: {
      crypto: client.crypto,
      onlineSession: client.onlineSession,
      sessionStatus: client.sessionStatus,
      getAccessToken: () => client.authManager.getAccessToken(),
    },
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
  const expiry = new Date(state.validUntil);
  if (expiry.getTime() <= Date.now()) {
    throw new KSeFSessionExpiredError(
      `Cannot resume session: expired at ${state.validUntil}`,
    );
  }

  const scopedAuth = new DefaultAuthManager(() => Promise.resolve(null), state.accessToken);
  const scopedRestClient = client.createScopedRestClient(scopedAuth);

  return buildSessionHandle({
    deps: {
      crypto: client.crypto,
      onlineSession: new OnlineSessionService(scopedRestClient),
      sessionStatus: new SessionStatusService(scopedRestClient),
      getAccessToken: () => scopedAuth.getAccessToken(),
    },
    sessionRef: state.referenceNumber,
    validUntil: state.validUntil,
    cipherKey: new Uint8Array(Buffer.from(state.aesKey, 'base64')),
    cipherIv: new Uint8Array(Buffer.from(state.iv, 'base64')),
    formCode: state.formCode,
    validate: options?.validate ?? state.validate,
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
