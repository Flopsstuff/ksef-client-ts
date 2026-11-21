import { KSeFError } from './ksef-error.js';

export class KSeFAuthStatusError extends KSeFError {
  readonly referenceNumber?: string;
  readonly statusDescription?: string;
  readonly statusCode?: number;
  readonly details?: string[];

  constructor(
    message: string,
    referenceNumber?: string,
    statusDescription?: string,
    statusCode?: number,
    details?: string[],
  ) {
    super(message);
    this.name = 'KSeFAuthStatusError';
    this.referenceNumber = referenceNumber;
    this.statusDescription = statusDescription;
    this.statusCode = statusCode;
    this.details = details;
  }
}
