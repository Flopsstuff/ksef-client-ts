import { KSeFError } from './ksef-error.js';

export class KSeFCircuitOpenError extends KSeFError {
  readonly endpoint: string;
  readonly openedAt: number;
  readonly retryAfterMs: number;

  constructor(endpoint: string, openedAt: number, retryAfterMs: number) {
    super(
      `Circuit breaker is open for '${endpoint}'. Retry after ${Math.round(retryAfterMs)}ms.`,
    );
    this.name = 'KSeFCircuitOpenError';
    this.endpoint = endpoint;
    this.openedAt = openedAt;
    this.retryAfterMs = retryAfterMs;
  }
}
