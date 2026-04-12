import { KSeFError } from './ksef-error.js';
import type { ForbiddenProblemDetails, ForbiddenReasonCode } from './types.js';

export class KSeFForbiddenError extends KSeFError {
  readonly statusCode = 403;
  readonly detail: string;
  readonly reasonCode: ForbiddenReasonCode;
  readonly instance?: string;
  readonly security?: Record<string, unknown>;
  readonly traceId?: string;
  readonly timestamp?: string;

  constructor(problemDetails: ForbiddenProblemDetails) {
    super(problemDetails.detail || 'Forbidden');
    this.name = 'KSeFForbiddenError';
    this.detail = problemDetails.detail;
    this.reasonCode = problemDetails.reasonCode;
    this.instance = problemDetails.instance;
    this.security = problemDetails.security;
    this.traceId = problemDetails.traceId;
    this.timestamp = problemDetails.timestamp;
  }
}
