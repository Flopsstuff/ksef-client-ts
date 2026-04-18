import { KSeFApiError } from './ksef-api-error.js';
import type { ForbiddenProblemDetails, ForbiddenReasonCode, ForbiddenSecurityInfo } from './types.js';

export class KSeFForbiddenError extends KSeFApiError {
  override readonly statusCode: 403 = 403;
  readonly detail: string;
  readonly reasonCode: ForbiddenReasonCode;
  readonly instance?: string;
  readonly security?: ForbiddenSecurityInfo & Record<string, unknown>;
  readonly traceId?: string;
  readonly timestamp?: string;

  constructor(problemDetails: ForbiddenProblemDetails) {
    super(problemDetails.detail || 'Forbidden', 403);
    this.name = 'KSeFForbiddenError';
    this.detail = problemDetails.detail;
    this.reasonCode = problemDetails.reasonCode;
    this.instance = problemDetails.instance;
    this.security = problemDetails.security;
    this.traceId = problemDetails.traceId;
    this.timestamp = problemDetails.timestamp;
  }
}
