import type {
  ApiErrorResponse,
  BadRequestErrorDetail,
  BadRequestProblemDetails,
  ProblemFields,
} from './types.js';
import { KSeFApiError } from './ksef-api-error.js';
import { badRequestProblemFields } from './bad-request-problem-fields.js';
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
  /** RFC 7807 fields, set only when built from a Problem Details body. */
  readonly detail?: string;
  readonly instance?: string;
  readonly errors: BadRequestErrorDetail[];
  readonly traceId?: string;
  readonly timestamp?: string;
  private readonly fromProblemDetails: boolean;

  constructor(message: string, errorResponse?: ApiErrorResponse, problem?: BadRequestProblemDetails) {
    super(message, 400, errorResponse);
    this.name = 'KSeFUnknownPublicKeyError';
    this.detail = problem?.detail;
    this.instance = problem?.instance;
    this.errors = problem?.errors ?? [];
    this.traceId = problem?.traceId;
    this.timestamp = problem?.timestamp;
    this.fromProblemDetails = problem !== undefined;
  }

  static fromLegacy(body?: ApiErrorResponse): KSeFUnknownPublicKeyError {
    const detail = body?.exception?.exceptionDetailList?.find(
      (d) => d.exceptionCode === KSeFErrorCode.UnknownPublicKeyId,
    );
    return new KSeFUnknownPublicKeyError(messageOf(detail?.exceptionDescription), body);
  }

  static fromProblem(problem: BadRequestProblemDetails): KSeFUnknownPublicKeyError {
    const detail = problem.errors?.find((e) => e.code === KSeFErrorCode.UnknownPublicKeyId);
    return new KSeFUnknownPublicKeyError(messageOf(detail?.description || problem.detail), undefined, problem);
  }

  override toProblemFields(): ProblemFields {
    // A legacy body carries no Problem Details; keep the base message-only shape for it.
    return this.fromProblemDetails ? badRequestProblemFields(this) : super.toProblemFields();
  }
}

function messageOf(description?: string | null): string {
  return (
    description?.trim() ||
    'The supplied public key identifier is unknown or revoked (KSeF 21470).'
  );
}
