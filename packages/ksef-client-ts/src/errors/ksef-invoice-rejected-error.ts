import type { SessionInvoiceStatusResponse } from '../models/sessions/status-types.js';
import { KSeFError } from './ksef-error.js';
import { KSeFErrorCode } from './error-codes.js';

/**
 * KSeF finished processing an invoice sent in a session and rejected it.
 *
 * `code` is a KSeF invoice status (e.g. 440 duplicate, 450 semantic error), not an HTTP
 * status. The whole status response is kept on `invoiceStatus`; `details` explains the
 * rejection and `extensions` carries structured data, such as the original KSeF number of
 * a duplicate.
 */
export class KSeFInvoiceRejectedError extends KSeFError {
  readonly sessionReferenceNumber: string;
  /** Invoice reference number returned when the invoice was sent. */
  readonly referenceNumber: string;
  readonly ordinalNumber: number;
  /** Invoice number (`P_2`), when KSeF could read it from the rejected document. */
  readonly invoiceNumber?: string;
  readonly code: number;
  readonly description: string;
  readonly details: string[];
  readonly extensions: Record<string, string | null>;
  readonly invoiceStatus: SessionInvoiceStatusResponse;

  constructor(sessionReferenceNumber: string, invoiceStatus: SessionInvoiceStatusResponse) {
    const { code, description } = invoiceStatus.status;
    const details = invoiceStatus.status.details ?? [];
    const extensions = invoiceStatus.status.extensions ?? {};
    const original = extensions.originalKsefNumber;
    let message = `Invoice ${invoiceStatus.referenceNumber} rejected by KSeF: ${code} — ${description}`;
    if (details.length) message += ` (${details.join('; ')})`;
    if (code === KSeFErrorCode.DuplicateInvoice && original) message += `; original KSeF number: ${original}`;
    super(message);
    this.name = 'KSeFInvoiceRejectedError';
    this.sessionReferenceNumber = sessionReferenceNumber;
    this.referenceNumber = invoiceStatus.referenceNumber;
    this.ordinalNumber = invoiceStatus.ordinalNumber;
    this.invoiceNumber = invoiceStatus.invoiceNumber ?? undefined;
    this.code = code;
    this.description = description;
    this.details = details;
    this.extensions = extensions;
    this.invoiceStatus = invoiceStatus;
  }

  /** True for status 440: an invoice with the same seller, type and number is already in KSeF. */
  get isDuplicate(): boolean {
    return this.code === KSeFErrorCode.DuplicateInvoice;
  }

  /**
   * KSeF number of the invoice this one duplicates (status 440, `originalKsefNumber`).
   * Lets a caller recover after losing the response to the original send.
   */
  get originalKsefNumber(): string | undefined {
    return this.extensions.originalKsefNumber ?? undefined;
  }

  /** Reference number of the session the original invoice was sent in (status 440). */
  get originalSessionReferenceNumber(): string | undefined {
    return this.extensions.originalSessionReferenceNumber ?? undefined;
  }
}
