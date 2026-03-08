import { consola } from 'consola';
import { KSeFRateLimitError } from '../errors/ksef-rate-limit-error.js';
import { KSeFApiError } from '../errors/ksef-api-error.js';

export async function withErrorHandler(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof KSeFRateLimitError) {
      consola.error(`Rate limited. Retry after ${error.recommendedDelay}s.`);
      process.exit(1);
    }

    if (error instanceof KSeFApiError) {
      consola.error(`KSeF API error (HTTP ${error.statusCode}): ${error.message}`);
      if (error.errorResponse?.exception?.exceptionDetailList) {
        for (const detail of error.errorResponse.exception.exceptionDetailList) {
          consola.error(`  - [${detail.exceptionDetailCode}] ${detail.exceptionDescription}`);
        }
      }
      process.exit(1);
    }

    if (error instanceof Error) {
      if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
        consola.error('Cannot reach KSeF API. Check your network connection and environment.');
        process.exit(1);
      }
      consola.error(error.message);
      process.exit(1);
    }

    consola.error('Unknown error', error);
    process.exit(1);
  }
}
