import type { ApiErrorResponse } from './types.js';

export class KSeFApiError extends Error {
  readonly statusCode: number;
  readonly errorResponse?: ApiErrorResponse;

  constructor(message: string, statusCode: number, errorResponse?: ApiErrorResponse) {
    super(message);
    this.name = 'KSeFApiError';
    this.statusCode = statusCode;
    this.errorResponse = errorResponse;
  }

  static fromResponse(statusCode: number, body?: ApiErrorResponse): KSeFApiError {
    const details = body?.exception?.exceptionDetailList;
    const message = details?.length
      ? details.map((d) => d.exceptionDescription).join('; ')
      : `KSeF API error: HTTP ${statusCode}`;
    return new KSeFApiError(message, statusCode, body);
  }
}
