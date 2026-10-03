import type { BadRequestErrorDetail, ProblemFields } from './types.js';

/** The RFC 7807 fields a 400 error keeps from `BadRequestProblemDetails`. */
export interface BadRequestProblemSource {
  readonly detail?: string;
  readonly instance?: string;
  readonly errors: readonly BadRequestErrorDetail[];
  readonly traceId?: string;
  readonly timestamp?: string;
}

export function badRequestProblemFields(source: BadRequestProblemSource): ProblemFields {
  return {
    detail: source.detail,
    errors: source.errors.length ? [...source.errors] : undefined,
    traceId: source.traceId,
    instance: source.instance,
    timestamp: source.timestamp,
  };
}
