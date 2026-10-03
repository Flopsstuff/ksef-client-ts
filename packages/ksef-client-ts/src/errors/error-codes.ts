import type { ApiErrorResponse } from './types.js';

export const KSeFErrorCode = {
  BatchTimeout: 21208,
  DuplicateInvoice: 440,
  /** The online session temporarily stopped accepting invoices; open a new session and continue (KSeF API v2.8.0). */
  SessionTemporarilyUnavailable: 21184,
  /** The supplied continuation token is invalid (KSeF API v2.0.0; collective identifier queries since v2.8.1). */
  InvalidContinuationToken: 21418,
  /** The supplied public key identifier is unknown or points to a revoked key (KSeF API v2.5.0). */
  UnknownPublicKeyId: 21470,
  /** Generic input validation failure; the error details name the rejected values (KSeF API v2.0.0). */
  InvalidInput: 21405,
  /** A collective identifier request lists invoices of different sellers (KSeF API v2.8.1). */
  CollectiveIdentifierDifferentSellers: 71004,
  /** A collective identifier request repeats the same KSeF number (KSeF API v2.8.1). */
  CollectiveIdentifierDuplicateKsefNumber: 71005,
} as const;

export type KSeFErrorCode = (typeof KSeFErrorCode)[keyof typeof KSeFErrorCode];

export function hasErrorCode(body: ApiErrorResponse | undefined, code: number): boolean {
  return !!body?.exception?.exceptionDetailList?.some((d) => d.exceptionCode === code);
}
