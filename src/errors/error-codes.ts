import type { ApiErrorResponse } from './types.js';

export const KSeFErrorCode = {
  BatchTimeout: 21208,
  DuplicateInvoice: 440,
} as const;

export type KSeFErrorCode = (typeof KSeFErrorCode)[keyof typeof KSeFErrorCode];

export function hasErrorCode(body: ApiErrorResponse | undefined, code: number): boolean {
  return !!body?.exception?.exceptionDetailList?.some((d) => d.exceptionCode === code);
}
