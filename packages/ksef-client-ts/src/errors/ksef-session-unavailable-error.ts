import type { ApiErrorResponse, BadRequestProblemDetails } from './types.js';
import { KSeFApiError } from './ksef-api-error.js';
import { KSeFErrorCode } from './error-codes.js';

/**
 * KSeF temporarily stopped accepting invoices in an existing online session, e.g. during
 * maintenance (HTTP 400, error code 21184, KSeF API v2.8.0).
 *
 * The session itself cannot be resumed from the client: open a new session and send the
 * remaining invoices there. The library does not reopen the session automatically.
 */
export class KSeFSessionUnavailableError extends KSeFApiError {
  override readonly statusCode: 400 = 400;
  readonly errorCode = KSeFErrorCode.SessionTemporarilyUnavailable;

  constructor(message: string, errorResponse?: ApiErrorResponse) {
    super(message, 400, errorResponse);
    this.name = 'KSeFSessionUnavailableError';
  }

  static fromLegacy(body?: ApiErrorResponse): KSeFSessionUnavailableError {
    const detail = body?.exception?.exceptionDetailList?.find(
      (d) => d.exceptionCode === KSeFErrorCode.SessionTemporarilyUnavailable,
    );
    return new KSeFSessionUnavailableError(messageOf(detail?.exceptionDescription), body);
  }

  static fromProblem(problem: BadRequestProblemDetails): KSeFSessionUnavailableError {
    const detail = problem.errors?.find((e) => e.code === KSeFErrorCode.SessionTemporarilyUnavailable);
    return new KSeFSessionUnavailableError(messageOf(detail?.description || problem.detail));
  }
}

function messageOf(description?: string | null): string {
  return (
    description?.trim() ||
    'The session is temporarily unavailable; open a new session and continue sending invoices there (KSeF 21184).'
  );
}
