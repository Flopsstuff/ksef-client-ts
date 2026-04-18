import { KSeFApiError } from './ksef-api-error.js';
import type { BadRequestErrorDetail, BadRequestProblemDetails } from './types.js';

export class KSeFBadRequestError extends KSeFApiError {
  override readonly statusCode: 400 = 400;
  readonly detail?: string;
  readonly instance?: string;
  readonly errors: BadRequestErrorDetail[];
  readonly traceId?: string;
  readonly timestamp?: string;

  constructor(problemDetails: BadRequestProblemDetails) {
    super(problemDetails.detail || problemDetails.title || 'Bad Request', 400);
    this.name = 'KSeFBadRequestError';
    this.detail = problemDetails.detail;
    this.instance = problemDetails.instance;
    this.errors = problemDetails.errors ?? [];
    this.traceId = problemDetails.traceId;
    this.timestamp = problemDetails.timestamp;
  }
}
