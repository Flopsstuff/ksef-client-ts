import { KSeFError } from './ksef-error.js';
import type { GoneProblemDetails } from './types.js';

export class KSeFGoneError extends KSeFError {
  readonly statusCode = 410;
  readonly detail: string;
  readonly instance?: string;
  readonly traceId?: string;
  readonly timestamp?: string;

  constructor(problemDetails: GoneProblemDetails) {
    super(problemDetails.detail || 'Operation status no longer available (retention expired)');
    this.name = 'KSeFGoneError';
    this.detail = problemDetails.detail;
    this.instance = problemDetails.instance;
    this.traceId = problemDetails.traceId;
    this.timestamp = problemDetails.timestamp;
  }
}
