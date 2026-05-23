import type { ApiErrorResponse } from './types.js';

export const KSeFErrorCode = {
  BatchTimeout: 21208,
  DuplicateInvoice: 440,
  /** The supplied public key identifier is unknown or points to a revoked key (KSeF API v2.5.0). */
  UnknownPublicKeyId: 21470,
} as const;

export type KSeFErrorCode = (typeof KSeFErrorCode)[keyof typeof KSeFErrorCode];

export function hasErrorCode(body: ApiErrorResponse | undefined, code: number): boolean {
  return !!body?.exception?.exceptionDetailList?.some((d) => d.exceptionCode === code);
}
