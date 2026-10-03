import type { SessionStatusResponse } from '../models/sessions/status-types.js';
import { KSeFError } from './ksef-error.js';

/**
 * An online or batch session ended in a failed status while waiting for its UPO
 * (e.g. 415 key decryption error, 440 session cancelled, 445 no valid invoices).
 *
 * `code` is a KSeF session status, not an HTTP status. The whole status response is kept
 * on `sessionStatus`, including the invoice counts.
 */
export class KSeFSessionFailedError extends KSeFError {
  readonly referenceNumber: string;
  readonly code: number;
  readonly description: string;
  readonly details: string[];
  readonly sessionStatus: SessionStatusResponse;

  constructor(message: string, referenceNumber: string, sessionStatus: SessionStatusResponse) {
    const details = sessionStatus.status.details ?? [];
    super(details.length ? `${message} (${details.join('; ')})` : message);
    this.name = 'KSeFSessionFailedError';
    this.referenceNumber = referenceNumber;
    this.code = sessionStatus.status.code;
    this.description = sessionStatus.status.description;
    this.details = details;
    this.sessionStatus = sessionStatus;
  }
}
