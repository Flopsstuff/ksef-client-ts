import type { ApiErrorResponse, ProblemFields, TooManyRequestsProblemDetails } from './types.js';
import { KSeFApiError } from './ksef-api-error.js';

export class KSeFRateLimitError extends KSeFApiError {
  override readonly statusCode: 429 = 429;
  readonly retryAfterSeconds?: number;
  readonly retryAfterDate?: Date;
  readonly recommendedDelay: number;
  readonly problem?: TooManyRequestsProblemDetails;

  constructor(
    message: string,
    statusCode: number,
    errorResponse?: ApiErrorResponse,
    retryAfterSeconds?: number,
    retryAfterDate?: Date,
    problem?: TooManyRequestsProblemDetails,
  ) {
    super(message, statusCode, errorResponse);
    this.name = 'KSeFRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
    this.retryAfterDate = retryAfterDate;
    this.recommendedDelay = retryAfterSeconds ?? 60;
    this.problem = problem;
  }

  static fromRetryAfterHeader(
    statusCode: number,
    retryAfterHeader?: string | null,
    body?: ApiErrorResponse,
    problem?: TooManyRequestsProblemDetails,
  ): KSeFRateLimitError {
    let retryAfterSeconds: number | undefined;
    let retryAfterDate: Date | undefined;

    if (retryAfterHeader) {
      const seconds = Number(retryAfterHeader);
      if (!Number.isNaN(seconds)) {
        retryAfterSeconds = seconds;
      } else {
        const date = new Date(retryAfterHeader);
        if (!Number.isNaN(date.getTime())) {
          retryAfterDate = date;
          retryAfterSeconds = Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
        }
      }
    }

    const message = retryAfterSeconds != null
      ? `Rate limited. Retry after ${retryAfterSeconds}s`
      : problem?.detail ?? 'Rate limited by KSeF API';

    return new KSeFRateLimitError(message, statusCode, body, retryAfterSeconds, retryAfterDate, problem);
  }

  override toProblemFields(): ProblemFields {
    return {
      detail: this.problem?.detail,
      traceId: this.problem?.traceId,
      instance: this.problem?.instance,
      timestamp: this.problem?.timestamp,
    };
  }
}
