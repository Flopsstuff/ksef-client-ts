import crypto from 'node:crypto';
import type { KSeFClient } from '../client.js';
import type { VerificationLinkService } from '../qr/verification-link-service.js';
import type { OfflineInvoiceStorage } from '../offline/storage.js';
import type {
  OfflineBatchResult,
  OfflineInvoiceInputData,
  OfflineInvoiceMetadata,
  OfflineInvoiceOptions,
  OfflineSubmissionResult,
} from '../offline/types.js';
import { calculateOfflineDeadline, getDefaultReason, isExpired } from '../offline/deadline.js';
import { DEFAULT_FORM_CODE } from '../models/document-structures/index.js';
import type { FormCode } from '../models/common.js';

export interface SubmitOfflineInvoicesOptions {
  storage: OfflineInvoiceStorage;
  invoiceIds?: string[];
  checkExpiry?: boolean;
  formCode?: FormCode;
}

export interface TechnicalCorrectionOptions {
  rejectedInvoiceId: string;
  correctedInvoiceXml: string;
  storage: OfflineInvoiceStorage;
  formCode?: FormCode;
}

export class OfflineInvoiceWorkflow {
  constructor(
    private readonly qrService: VerificationLinkService,
  ) {}

  async generate(
    input: OfflineInvoiceInputData,
    options?: OfflineInvoiceOptions,
  ): Promise<OfflineInvoiceMetadata> {
    if (!input.invoiceXml || input.invoiceXml.trim().length === 0) {
      throw new Error('invoiceXml must not be empty');
    }
    if (!input.invoiceNumber) {
      throw new Error('invoiceNumber is required');
    }
    if (!input.sellerNip) {
      throw new Error('sellerNip is required');
    }

    const mode = options?.mode ?? 'offline24';
    const reason = getDefaultReason(mode);

    const invoiceHashBase64 = crypto
      .createHash('sha256')
      .update(input.invoiceXml)
      .digest('base64');

    const kod1Url = this.qrService.buildInvoiceVerificationUrl(
      input.sellerNip,
      input.invoiceDate,
      invoiceHashBase64,
    );

    let kod2Url: string | undefined;
    if (options?.certificate) {
      kod2Url = this.qrService.buildCertificateVerificationUrl(
        input.sellerIdentifier.type,
        input.sellerIdentifier.value,
        input.sellerNip,
        options.certificate.certificateSerial,
        invoiceHashBase64,
        options.certificate.privateKeyPem,
      );
    }

    const submitBy = options?.customDeadline
      ? (typeof options.customDeadline === 'string'
        ? options.customDeadline
        : options.customDeadline.toISOString())
      : calculateOfflineDeadline(mode, input.invoiceDate, options?.maintenanceWindow).toISOString();

    const metadata: OfflineInvoiceMetadata = {
      id: crypto.randomUUID(),
      mode,
      reason,
      status: 'GENERATED',
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      invoiceXml: input.invoiceXml,
      sellerNip: input.sellerNip,
      sellerIdentifier: input.sellerIdentifier,
      buyerIdentifier: input.buyerIdentifier,
      totalAmount: input.totalAmount,
      currency: input.currency,
      kod1Url,
      kod2Url,
      generatedAt: new Date().toISOString(),
      submitBy,
      maintenanceWindowId: options?.maintenanceWindow?.id,
    };

    if (options?.storage) {
      await options.storage.save(metadata);
    }

    return metadata;
  }

  async submit(
    client: KSeFClient,
    options: SubmitOfflineInvoicesOptions,
  ): Promise<OfflineBatchResult> {
    const { storage, checkExpiry = true } = options;

    let invoices: OfflineInvoiceMetadata[];
    if (options.invoiceIds) {
      invoices = [];
      for (const id of options.invoiceIds) {
        const inv = await storage.get(id);
        if (inv) invoices.push(inv);
      }
    } else {
      invoices = await storage.list({ status: ['GENERATED', 'QUEUED', 'SUBMITTED'] });
    }

    const result: OfflineBatchResult = {
      total: invoices.length,
      submitted: 0,
      accepted: 0,
      rejected: 0,
      failed: 0,
      expired: 0,
      results: [],
    };

    if (invoices.length === 0) return result;

    // Mark expired
    const pending: OfflineInvoiceMetadata[] = [];
    for (const inv of invoices) {
      if (checkExpiry && isExpired(inv.submitBy)) {
        await storage.update(inv.id, { status: 'EXPIRED' });
        result.expired++;
        result.results.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          status: 'EXPIRED',
        });
      } else {
        pending.push(inv);
      }
    }

    if (pending.length === 0) return result;

    // Open session
    await client.crypto.init();
    // KSeF provides a single (key, IV) pair per session — all invoices share it.
    // This is by API design: EncryptionInfo is sent at openSession(), sendInvoice()
    // does not accept per-invoice encryption. Consistent with all official reference
    // implementations (Java, C#, TypeScript).
    const encData = client.crypto.getEncryptionData();
    const formCode = options.formCode ?? DEFAULT_FORM_CODE;

    const openResp = await client.onlineSession.openSession(
      { formCode, encryption: encData.encryptionInfo },
    );
    const sessionRef = openResp.referenceNumber;

    try {
      for (const inv of pending) {
        await storage.update(inv.id, { status: 'QUEUED' });

        try {
          const data = new TextEncoder().encode(inv.invoiceXml);
          const plainMeta = client.crypto.getFileMetadata(data);
          const encrypted = client.crypto.encryptAES256(data, encData.cipherKey, encData.cipherIv);
          const encMeta = client.crypto.getFileMetadata(encrypted);

          await storage.update(inv.id, { status: 'SUBMITTED', submittedAt: new Date().toISOString() });

          const resp = await client.onlineSession.sendInvoice(sessionRef, {
            invoiceHash: plainMeta.hashSHA,
            invoiceSize: plainMeta.fileSize,
            encryptedInvoiceHash: encMeta.hashSHA,
            encryptedInvoiceSize: encMeta.fileSize,
            encryptedInvoiceContent: Buffer.from(encrypted).toString('base64'),
            offlineMode: true,
          });

          await storage.update(inv.id, {
            status: 'ACCEPTED',
            acceptedAt: new Date().toISOString(),
            ksefReferenceNumber: resp.referenceNumber,
          });

          result.submitted++;
          result.accepted++;
          result.results.push({
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            status: 'ACCEPTED',
            ksefReferenceNumber: resp.referenceNumber,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          await storage.update(inv.id, {
            status: 'REJECTED',
            error: { code: 0, message },
          });

          result.submitted++;
          result.rejected++;
          result.results.push({
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            status: 'REJECTED',
            error: { code: 0, message },
          });
        }
      }
    } finally {
      try {
        await client.onlineSession.closeSession(sessionRef);
      } catch {
        // Best effort close
      }
    }

    return result;
  }

  async correct(
    client: KSeFClient,
    options: TechnicalCorrectionOptions,
  ): Promise<OfflineSubmissionResult> {
    const { storage, rejectedInvoiceId, correctedInvoiceXml } = options;

    const original = await storage.get(rejectedInvoiceId);
    if (!original) {
      throw new Error(`Offline invoice not found: ${rejectedInvoiceId}`);
    }
    if (original.status !== 'REJECTED') {
      throw new Error(`Only rejected invoices can be corrected (current status: ${original.status})`);
    }

    const originalHash = crypto
      .createHash('sha256')
      .update(original.invoiceXml)
      .digest('base64');

    await client.crypto.init();
    const encData = client.crypto.getEncryptionData();
    const formCode = options.formCode ?? DEFAULT_FORM_CODE;

    const openResp = await client.onlineSession.openSession(
      { formCode, encryption: encData.encryptionInfo },
    );
    const sessionRef = openResp.referenceNumber;

    try {
      const data = new TextEncoder().encode(correctedInvoiceXml);
      const plainMeta = client.crypto.getFileMetadata(data);
      const encrypted = client.crypto.encryptAES256(data, encData.cipherKey, encData.cipherIv);
      const encMeta = client.crypto.getFileMetadata(encrypted);

      const correctionId = crypto.randomUUID();
      const submittedAt = new Date().toISOString();
      const correctionMetadata: OfflineInvoiceMetadata = {
        id: correctionId,
        mode: original.mode,
        reason: original.reason,
        status: 'SUBMITTED',
        invoiceNumber: original.invoiceNumber,
        invoiceDate: original.invoiceDate,
        invoiceXml: correctedInvoiceXml,
        sellerNip: original.sellerNip,
        sellerIdentifier: original.sellerIdentifier,
        buyerIdentifier: original.buyerIdentifier,
        kod1Url: original.kod1Url,
        kod2Url: original.kod2Url,
        generatedAt: submittedAt,
        submitBy: original.submitBy,
        submittedAt,
        correctedInvoiceId: rejectedInvoiceId,
      };
      await storage.save(correctionMetadata);

      const resp = await client.onlineSession.sendInvoice(sessionRef, {
        invoiceHash: plainMeta.hashSHA,
        invoiceSize: plainMeta.fileSize,
        encryptedInvoiceHash: encMeta.hashSHA,
        encryptedInvoiceSize: encMeta.fileSize,
        encryptedInvoiceContent: Buffer.from(encrypted).toString('base64'),
        offlineMode: true,
        hashOfCorrectedInvoice: originalHash,
      });

      await storage.update(correctionId, {
        status: 'ACCEPTED',
        acceptedAt: new Date().toISOString(),
        ksefReferenceNumber: resp.referenceNumber,
      });

      return {
        invoiceId: correctionId,
        invoiceNumber: correctionMetadata.invoiceNumber,
        status: 'ACCEPTED',
        ksefReferenceNumber: resp.referenceNumber,
      };
    } finally {
      try {
        await client.onlineSession.closeSession(sessionRef);
      } catch {
        // Best effort close
      }
    }
  }
}
