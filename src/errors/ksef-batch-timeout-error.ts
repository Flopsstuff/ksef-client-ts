import type { ApiErrorResponse } from './types.js';
import { KSeFApiError } from './ksef-api-error.js';
import { KSeFErrorCode } from './error-codes.js';

export class KSeFBatchTimeoutError extends KSeFApiError {
  readonly errorCode = KSeFErrorCode.BatchTimeout;

  constructor(message: string, statusCode: number, errorResponse?: ApiErrorResponse) {
    super(message, statusCode, errorResponse);
    this.name = 'KSeFBatchTimeoutError';
  }

  static fromResponse(statusCode: number, body?: ApiErrorResponse): KSeFBatchTimeoutError {
    const detail = body?.exception?.exceptionDetailList?.find(
      (d) => d.exceptionCode === KSeFErrorCode.BatchTimeout,
    );
    const message =
      detail?.exceptionDescription?.trim() ||
      'Batch session timed out before the server completed processing (KSeF 21208).';
    return new KSeFBatchTimeoutError(message, statusCode, body);
  }
}
