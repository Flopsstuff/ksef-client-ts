import type { FormCode } from '../common.js';
import type { PartUploadRequest } from './batch-types.js';

/**
 * Serializable state of an online session. All binary data is Base64-encoded.
 *
 * **Security:** contains AES encryption keys in plaintext. Treat serialized
 * state as sensitive data — encrypt at rest or store in a secure vault.
 */
export interface OnlineSessionState {
  referenceNumber: string;
  /** AES-256 cipher key, Base64-encoded. */
  aesKey: string;
  /** AES-256 initialization vector, Base64-encoded. */
  iv: string;
  accessToken: string;
  formCode: FormCode;
  /** Session expiration time, ISO 8601. */
  validUntil: string;
  /** Whether invoices are validated against XSD before sending. */
  validate?: boolean;
}

/** Serializable state of a batch session. */
export interface BatchSessionState {
  referenceNumber: string;
  /** AES-256 cipher key, Base64-encoded. */
  aesKey: string;
  /** AES-256 initialization vector, Base64-encoded. */
  iv: string;
  accessToken: string;
  formCode: FormCode;
  partUploadRequests: PartUploadRequest[];
}
