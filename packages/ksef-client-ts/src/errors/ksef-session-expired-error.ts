import { KSeFError } from './ksef-error.js';

export class KSeFSessionExpiredError extends KSeFError {
  constructor(message: string = 'KSeF session has expired') {
    super(message);
    this.name = 'KSeFSessionExpiredError';
  }
}
