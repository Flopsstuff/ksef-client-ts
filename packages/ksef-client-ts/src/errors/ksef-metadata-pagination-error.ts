import { KSeFError } from './ksef-error.js';

/**
 * Thrown when the metadata-query paging helper cannot make forward progress
 * across an `isTruncated` boundary — e.g. a capped window whose entire result
 * set shares the same boundary date, so re-narrowing the date range never
 * advances. Raised instead of looping forever.
 */
export class KSeFMetadataPaginationError extends KSeFError {
  /** The boundary date value that failed to advance. */
  readonly boundaryValue: string;

  constructor(message: string, boundaryValue: string) {
    super(message);
    this.name = 'KSeFMetadataPaginationError';
    this.boundaryValue = boundaryValue;
  }
}
