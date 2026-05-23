import type { ApiErrorResponse, BadRequestProblemDetails } from './types.js';
import { KSeFApiError } from './ksef-api-error.js';
import { KSeFErrorCode } from './error-codes.js';

/**
 * KSeF rejected an encryption request because the supplied `publicKeyId` is unknown
 * or points to a revoked key (HTTP 400, error code 21470, KSeF API v2.5.0).
 *
 * Encryption-bearing operations recover by refreshing the certificate cache and
 * retrying once with a freshly selected key.
 */
export class KSeFUnknownPublicKeyError extends KSeFApiError {
  override readonly statusCode: 400 = 400;
  readonly errorCode = KSeFErrorCode.UnknownPublicKeyId;

  constructor(message: string, errorResponse?: ApiErrorResponse) {
    super(message, 400, errorResponse);
    this.name = 'KSeFUnknownPublicKeyError';
  }

  static fromLegacy(body?: ApiErrorResponse): KSeFUnknownPublicKeyError {
    const detail = body?.exception?.exceptionDetailList?.find(
      (d) => d.exceptionCode === KSeFErrorCode.UnknownPublicKeyId,
    );
    return new KSeFUnknownPublicKeyError(messageOf(detail?.exceptionDescription), body);
  }

  static fromProblem(problem: BadRequestProblemDetails): KSeFUnknownPublicKeyError {
    const detail = problem.errors?.find((e) => e.code === KSeFErrorCode.UnknownPublicKeyId);
    return new KSeFUnknownPublicKeyError(messageOf(detail?.description || problem.detail));
  }
}

function messageOf(description?: string | null): string {
  return (
    description?.trim() ||
    'The supplied public key identifier is unknown or revoked (KSeF 21470).'
  );
}
