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
  /**
   * KSeF could not read the request body: a field holds a value or type it does not accept, or the JSON is malformed;
   * the error details name the field (documented in KSeF API v2.9.0, returned earlier as well).
   */
  UnreadableContent: 21001,
  /** The token with the given reference number does not exist in the current context (documented in KSeF API v2.10.0). */
  TokenNotFound: 21409,
  /** A token cannot grant permissions its author does not hold (KSeF API v2.10.0). */
  TokenPermissionsNotHeld: 26001,
  /** The token operation is not allowed in the current context type (KSeF API v2.10.0). */
  TokenInvalidContextType: 26002,
  /** The token's status does not allow the operation: revoke, approve or expire-approval (KSeF API v2.10.0). */
  TokenStatusDisallowsOperation: 26004,
  /** The token cannot be approved in a session authenticated with a KSeF token; use XAdES or the National Node (KSeF API v2.10.0). */
  TokenApprovalAuthMethodNotAllowed: 26005,
  /** The context has reached its token limit (KSeF API v2.10.0). */
  TokenLimitReached: 26006,
  /** A collective identifier request lists invoices of different sellers (KSeF API v2.8.1). */
  CollectiveIdentifierDifferentSellers: 71004,
  /** A collective identifier request repeats the same KSeF number (KSeF API v2.8.1). */
  CollectiveIdentifierDuplicateKsefNumber: 71005,
} as const;

export type KSeFErrorCode = (typeof KSeFErrorCode)[keyof typeof KSeFErrorCode];

export function hasErrorCode(body: ApiErrorResponse | undefined, code: number): boolean {
  return !!body?.exception?.exceptionDetailList?.some((d) => d.exceptionCode === code);
}
