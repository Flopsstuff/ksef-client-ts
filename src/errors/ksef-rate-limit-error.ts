import type { ApiErrorResponse } from './types.js';
import { KSeFApiError } from './ksef-api-error.js';

export class KSeFRateLimitError extends KSeFApiError {
  readonly retryAfterSeconds?: number;
  readonly retryAfterDate?: Date;
  readonly recommendedDelay: number;

  constructor(
    message: string,
    statusCode: number,
    errorResponse?: ApiErrorResponse,
    retryAfterSeconds?: number,
    retryAfterDate?: Date,
  ) {
    super(message, statusCode, errorResponse);
    this.name = 'KSeFRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
    this.retryAfterDate = retryAfterDate;
    this.recommendedDelay = retryAfterSeconds ?? 60;
  }

  static fromRetryAfterHeader(
    statusCode: number,
    retryAfterHeader?: string | null,
    body?: ApiErrorResponse,
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
      : 'Rate limited by KSeF API';

    return new KSeFRateLimitError(message, statusCode, body, retryAfterSeconds, retryAfterDate);
  }
}
