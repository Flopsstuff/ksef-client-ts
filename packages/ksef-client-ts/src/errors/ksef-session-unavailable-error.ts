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
 * KSeF temporarily stopped accepting invoices in an existing online session, e.g. during
 * maintenance (HTTP 400, error code 21184, KSeF API v2.8.0).
 *
 * The session itself cannot be resumed from the client: open a new session and send the
 * remaining invoices there. The library does not reopen the session automatically.
 */
export class KSeFSessionUnavailableError extends KSeFApiError {
  override readonly statusCode: 400 = 400;
  readonly errorCode = KSeFErrorCode.SessionTemporarilyUnavailable;
  /** RFC 7807 fields, set only when built from a Problem Details body. */
  readonly detail?: string;
  readonly instance?: string;
  readonly errors: BadRequestErrorDetail[];
  readonly traceId?: string;
  readonly timestamp?: string;
  private readonly fromProblemDetails: boolean;

  constructor(message: string, errorResponse?: ApiErrorResponse, problem?: BadRequestProblemDetails) {
    super(message, 400, errorResponse);
    this.name = 'KSeFSessionUnavailableError';
    this.detail = problem?.detail;
    this.instance = problem?.instance;
    this.errors = problem?.errors ?? [];
    this.traceId = problem?.traceId;
    this.timestamp = problem?.timestamp;
    this.fromProblemDetails = problem !== undefined;
  }

  static fromLegacy(body?: ApiErrorResponse): KSeFSessionUnavailableError {
    const detail = body?.exception?.exceptionDetailList?.find(
      (d) => d.exceptionCode === KSeFErrorCode.SessionTemporarilyUnavailable,
    );
    return new KSeFSessionUnavailableError(messageOf(detail?.exceptionDescription), body);
  }

  static fromProblem(problem: BadRequestProblemDetails): KSeFSessionUnavailableError {
    const detail = problem.errors?.find((e) => e.code === KSeFErrorCode.SessionTemporarilyUnavailable);
    return new KSeFSessionUnavailableError(messageOf(detail?.description || problem.detail), undefined, problem);
  }

  override toProblemFields(): ProblemFields {
    // A legacy body carries no Problem Details; keep the base message-only shape for it.
    return this.fromProblemDetails ? badRequestProblemFields(this) : super.toProblemFields();
  }
}

function messageOf(description?: string | null): string {
  return (
    description?.trim() ||
    'The session is temporarily unavailable; open a new session and continue sending invoices there (KSeF 21184).'
  );
}
