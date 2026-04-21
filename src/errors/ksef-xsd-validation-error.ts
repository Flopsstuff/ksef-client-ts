import { KSeFError } from './ksef-error.js';

export class KSeFXsdValidationError extends KSeFError {
  readonly schemaFile: string;
  readonly errors: string[];

  constructor(schemaFile: string, errors: string[]) {
    const preview = errors.slice(0, 3).join('; ');
    const extra = errors.length > 3 ? ` (+${errors.length - 3} more)` : '';
    super(`XSD validation failed against ${schemaFile}: ${preview}${extra}`);
    this.name = 'KSeFXsdValidationError';
    this.schemaFile = schemaFile;
    this.errors = errors;
  }
}
