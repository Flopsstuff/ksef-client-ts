import { KSeFApiError } from './ksef-api-error.js';
import type { UnauthorizedProblemDetails } from './types.js';

export class KSeFUnauthorizedError extends KSeFApiError {
  override readonly statusCode: 401 = 401;
  readonly detail: string;
  readonly traceId?: string;
  readonly instance?: string;
  readonly timestamp?: string;

  constructor(problemDetails: UnauthorizedProblemDetails) {
    super(problemDetails.detail || 'Unauthorized', 401);
    this.name = 'KSeFUnauthorizedError';
    this.detail = problemDetails.detail;
    this.traceId = problemDetails.traceId;
    this.instance = problemDetails.instance;
    this.timestamp = problemDetails.timestamp;
  }
}
