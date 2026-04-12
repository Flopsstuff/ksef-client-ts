import { describe, it, expect } from 'vitest';
import {
  KSeFBatchTimeoutError,
  KSeFApiError,
  KSeFError,
  KSeFErrorCode,
} from '../../../src/errors/index.js';

describe('KSeFBatchTimeoutError', () => {
  it('extends KSeFApiError, KSeFError, Error', () => {
    const err = KSeFBatchTimeoutError.fromResponse(408);

    expect(err).toBeInstanceOf(KSeFApiError);
    expect(err).toBeInstanceOf(KSeFError);
    expect(err).toBeInstanceOf(Error);
  });

  it('has stable name', () => {
    const err = KSeFBatchTimeoutError.fromResponse(408);

    expect(err.name).toBe('KSeFBatchTimeoutError');
  });

  it('exposes errorCode 21208', () => {
    const err = KSeFBatchTimeoutError.fromResponse(408);

    expect(err.errorCode).toBe(21208);
    expect(err.errorCode).toBe(KSeFErrorCode.BatchTimeout);
  });

  it('fromResponse() picks exceptionDescription for code 21208', () => {
    const err = KSeFBatchTimeoutError.fromResponse(408, {
      exception: {
        exceptionDetailList: [
          { exceptionCode: 21208, exceptionDescription: 'Timeout on batch finish' },
        ],
      },
    });

    expect(err.message).toBe('Timeout on batch finish');
    expect(err.statusCode).toBe(408);
  });

  it('fromResponse() ignores unrelated exceptionCodes when picking message', () => {
    const err = KSeFBatchTimeoutError.fromResponse(500, {
      exception: {
        exceptionDetailList: [
          { exceptionCode: 9999, exceptionDescription: 'Other error' },
          { exceptionCode: 21208, exceptionDescription: 'Real batch timeout' },
        ],
      },
    });

    expect(err.message).toBe('Real batch timeout');
  });

  it('fromResponse() falls back to default message when description is missing', () => {
    const err = KSeFBatchTimeoutError.fromResponse(408, {
      exception: { exceptionDetailList: [{ exceptionCode: 21208 }] },
    });

    expect(err.message).toContain('21208');
    expect(err.message).toContain('timed out');
  });

  it('fromResponse() falls back to default message when body is undefined', () => {
    const err = KSeFBatchTimeoutError.fromResponse(408);

    expect(err.message).toContain('21208');
    expect(err.errorResponse).toBeUndefined();
  });

  it('preserves the original errorResponse for debugging', () => {
    const body = {
      exception: {
        exceptionDetailList: [{ exceptionCode: 21208, exceptionDescription: 'boom' }],
      },
    };
    const err = KSeFBatchTimeoutError.fromResponse(408, body);

    expect(err.errorResponse).toBe(body);
  });
});
