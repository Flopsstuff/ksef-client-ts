import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consola } from 'consola';
import { withErrorHandler } from '../../../src/cli/error-handler.js';
import { KSeFRateLimitError } from '../../../src/errors/ksef-rate-limit-error.js';
import { KSeFUnauthorizedError } from '../../../src/errors/ksef-unauthorized-error.js';
import { KSeFForbiddenError } from '../../../src/errors/ksef-forbidden-error.js';
import { KSeFApiError } from '../../../src/errors/ksef-api-error.js';

vi.mock('consola', () => ({
  consola: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

beforeEach(() => {
  vi.clearAllMocks();
});

function throwingFn(error: unknown): () => Promise<void> {
  return async () => { throw error; };
}

describe('withErrorHandler', () => {
  it('handles KSeFRateLimitError', async () => {
    const error = new KSeFRateLimitError('rate limited', 429, undefined, 60);

    await withErrorHandler(throwingFn(error));

    expect(consola.error).toHaveBeenCalledWith('Rate limited by KSeF API.');
    expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('60'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('handles KSeFUnauthorizedError', async () => {
    const error = new KSeFUnauthorizedError({ detail: 'unauthorized' });

    await withErrorHandler(throwingFn(error));

    expect(consola.error).toHaveBeenCalledWith(expect.stringContaining('401'));
    expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('ksef auth login'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('handles KSeFUnauthorizedError with traceId', async () => {
    const error = new KSeFUnauthorizedError({ detail: 'unauthorized', traceId: 'trace-abc' });

    await withErrorHandler(throwingFn(error));

    expect(consola.error).toHaveBeenCalledWith(expect.stringContaining('trace-abc'));
  });

  it('handles KSeFForbiddenError', async () => {
    const error = new KSeFForbiddenError({ detail: 'forbidden', reasonCode: 'InsufficientPermissions' });

    await withErrorHandler(throwingFn(error));

    expect(consola.error).toHaveBeenCalledWith(expect.stringContaining('403'));
    expect(consola.error).toHaveBeenCalledWith(expect.stringContaining('InsufficientPermissions'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('handles generic KSeFApiError', async () => {
    const error = new KSeFApiError('Internal error', 500);

    await withErrorHandler(throwingFn(error));

    expect(consola.error).toHaveBeenCalledWith(expect.stringContaining('500'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('handles KSeFApiError with exceptionDetailList', async () => {
    const errorResponse = {
      exception: {
        exceptionDetailList: [
          { exceptionCode: 10100, exceptionDescription: 'Invalid NIP' },
        ],
      },
    };
    const error = new KSeFApiError('Bad request', 400, errorResponse);

    await withErrorHandler(throwingFn(error));

    expect(consola.error).toHaveBeenCalledWith(expect.stringContaining('10100'));
    expect(consola.error).toHaveBeenCalledWith(expect.stringContaining('Invalid NIP'));
  });

  it('handles network errors (ECONNREFUSED)', async () => {
    const error = new Error('fetch failed: ECONNREFUSED');

    await withErrorHandler(throwingFn(error));

    expect(consola.error).toHaveBeenCalledWith(expect.stringContaining('Cannot reach KSeF API'));
    expect(consola.info).toHaveBeenCalledWith(expect.stringContaining('ksef doctor'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('handles generic Error', async () => {
    const error = new Error('Something went wrong');

    await withErrorHandler(throwingFn(error));

    expect(consola.error).toHaveBeenCalledWith('Something went wrong');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('handles non-Error values', async () => {
    await withErrorHandler(throwingFn('string error'));

    expect(consola.error).toHaveBeenCalledWith('Unknown error', 'string error');
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
