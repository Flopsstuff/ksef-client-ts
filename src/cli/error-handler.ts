import { consola } from 'consola';
import { KSeFRateLimitError } from '../errors/ksef-rate-limit-error.js';
import { KSeFUnauthorizedError } from '../errors/ksef-unauthorized-error.js';
import { KSeFForbiddenError } from '../errors/ksef-forbidden-error.js';
import { KSeFApiError } from '../errors/ksef-api-error.js';

export async function withErrorHandler(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof KSeFRateLimitError) {
      consola.error('Rate limited by KSeF API.');
      consola.info(`Hint: Retry after ${error.recommendedDelay}s.`);
      process.exit(1);
    }

    if (error instanceof KSeFUnauthorizedError) {
      consola.error(`KSeF API error (HTTP 401): ${error.detail}`);
      if (error.traceId) consola.error(`  Trace ID: ${error.traceId}`);
      consola.info('Hint: Your session may have expired. Run `ksef auth login` to re-authenticate.');
      process.exit(1);
    }

    if (error instanceof KSeFForbiddenError) {
      consola.error(`KSeF API error (HTTP 403): ${error.detail}`);
      consola.error(`  Reason: ${error.reasonCode}`);
      if (error.traceId) consola.error(`  Trace ID: ${error.traceId}`);
      consola.info('Hint: Check your permissions for this operation.');
      process.exit(1);
    }

    if (error instanceof KSeFApiError) {
      consola.error(`KSeF API error (HTTP ${error.statusCode}): ${error.message}`);
      if (error.errorResponse?.exception?.exceptionDetailList) {
        for (const detail of error.errorResponse.exception.exceptionDetailList) {
          consola.error(`  - [${detail.exceptionCode}] ${detail.exceptionDescription}`);
        }
      }
      if (error.statusCode === 401 || error.statusCode === 403) {
        consola.info('Hint: Run `ksef auth login` to authenticate.');
      } else if (error.statusCode === 404) {
        consola.info('Hint: Check if the resource reference is correct.');
      }
      process.exit(1);
    }

    if (error instanceof Error) {
      const msg = error.message;
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) {
        consola.error('Cannot reach KSeF API. Check your network connection and environment.');
        consola.info('Hint: Run `ksef doctor` to diagnose connectivity issues.');
        process.exit(1);
      }
      consola.error(msg);
      process.exit(1);
    }

    consola.error('Unknown error', error);
    process.exit(1);
  }
}
