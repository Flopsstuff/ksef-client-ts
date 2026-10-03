import { KSeFError } from './ksef-error.js';

/**
 * Thrown when a continuation-token paging helper cannot walk a result set to
 * its end: KSeF handed back a token it had already returned, so following it
 * would loop forever, or the walk needed more pages than its `maxPages` cap
 * allows. Raised instead of looping, after every page read so far has been
 * yielded.
 */
export class KSeFPaginationError extends KSeFError {
  /**
   * The token the walk stopped at: the repeated token when paging stalled, or
   * the token of the first unread page when the cap was reached — pass it back
   * as `continuationToken` to resume from there.
   */
  readonly continuationToken: string;

  constructor(message: string, continuationToken: string) {
    super(message);
    this.name = 'KSeFPaginationError';
    this.continuationToken = continuationToken;
  }
}
