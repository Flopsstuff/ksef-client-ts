import { KSeFError } from '../errors/ksef-error.js';

/**
 * PDF-module runtime error: missing/incompatible `pdfmake`, template/version
 * mismatch, or nesting-depth overflow. Structural DSL validation failures use
 * {@link KSeFValidationError} from core instead.
 */
export class KSeFPdfError extends KSeFError {
  constructor(message: string) {
    super(message);
    this.name = 'KSeFPdfError';
  }
}
