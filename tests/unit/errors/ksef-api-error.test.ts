import { describe, it, expect } from 'vitest';
import { KSeFApiError } from '../../../src/errors/index.js';
import type { ApiErrorResponse } from '../../../src/errors/index.js';

describe('KSeFApiError', () => {
  it('sets all fields from constructor', () => {
    const body: ApiErrorResponse = {
      exception: { serviceCode: 'ERR', exceptionDetailList: [] },
    };
    const err = new KSeFApiError('test message', 400, body);

    expect(err.message).toBe('test message');
    expect(err.statusCode).toBe(400);
    expect(err.errorResponse).toBe(body);
    expect(err.name).toBe('KSeFApiError');
  });

  it('fromResponse() joins exceptionDetailList descriptions', () => {
    const body: ApiErrorResponse = {
      exception: {
        exceptionDetailList: [
          { exceptionDetailCode: 1, exceptionDescription: 'First error' },
        ],
      },
    };
    const err = KSeFApiError.fromResponse(422, body);

    expect(err.message).toBe('First error');
    expect(err.statusCode).toBe(422);
  });

  it('fromResponse() joins multiple detail descriptions with semicolon', () => {
    const body: ApiErrorResponse = {
      exception: {
        exceptionDetailList: [
          { exceptionDetailCode: 1, exceptionDescription: 'Error A' },
          { exceptionDetailCode: 2, exceptionDescription: 'Error B' },
        ],
      },
    };
    const err = KSeFApiError.fromResponse(400, body);

    expect(err.message).toBe('Error A; Error B');
  });

  it('fromResponse() falls back to generic message with empty details', () => {
    const body: ApiErrorResponse = {
      exception: { exceptionDetailList: [] },
    };
    const err = KSeFApiError.fromResponse(500, body);

    expect(err.message).toBe('KSeF API error: HTTP 500');
  });

  it('fromResponse() falls back to generic message without body', () => {
    const err = KSeFApiError.fromResponse(503);

    expect(err.message).toBe('KSeF API error: HTTP 503');
    expect(err.errorResponse).toBeUndefined();
  });

  it('is an instance of Error', () => {
    const err = new KSeFApiError('test', 400);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(KSeFApiError);
  });
});
