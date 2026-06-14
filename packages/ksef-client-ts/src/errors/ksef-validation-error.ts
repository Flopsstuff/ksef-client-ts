import { KSeFError } from './ksef-error.js';

export interface ValidationDetail {
  field?: string;
  message: string;
}

export class KSeFValidationError extends KSeFError {
  readonly details: ValidationDetail[];

  constructor(message: string, details: ValidationDetail[] = []) {
    super(message);
    this.name = 'KSeFValidationError';
    this.details = details;
  }

  static fromField(field: string, message: string): KSeFValidationError {
    return new KSeFValidationError(message, [{ field, message }]);
  }

  static fromMessages(messages: string[]): KSeFValidationError {
    const details = messages.map((m) => ({ message: m }));
    return new KSeFValidationError(messages.join('; '), details);
  }
}
