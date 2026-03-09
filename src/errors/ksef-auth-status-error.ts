import { KSeFError } from './ksef-error.js';

export class KSeFAuthStatusError extends KSeFError {
  readonly referenceNumber?: string;
  readonly statusDescription?: string;

  constructor(message: string, referenceNumber?: string, statusDescription?: string) {
    super(message);
    this.name = 'KSeFAuthStatusError';
    this.referenceNumber = referenceNumber;
    this.statusDescription = statusDescription;
  }
}
