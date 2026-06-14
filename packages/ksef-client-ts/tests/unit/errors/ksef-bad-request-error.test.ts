import { describe, it, expect } from 'vitest';
import { KSeFBadRequestError, KSeFApiError, KSeFError } from '../../../src/errors/index.js';

describe('KSeFBadRequestError', () => {
  it('stores all fields from full problem details', () => {
    const err = new KSeFBadRequestError({
      title: 'Bad Request',
      status: 400,
      detail: 'Validation failed',
      instance: '/v2/invoices/query',
      errors: [
        { code: 21200, description: 'Invalid date range', details: ['dateFrom > dateTo'] },
        { code: 21201, description: 'Unknown status', details: [] },
      ],
      traceId: 'trace-400',
      timestamp: '2026-04-18T10:00:00Z',
    });

    expect(err.message).toBe('Validation failed');
    expect(err.statusCode).toBe(400);
    expect(err.detail).toBe('Validation failed');
    expect(err.instance).toBe('/v2/invoices/query');
    expect(err.errors).toHaveLength(2);
    expect(err.errors[0]!.code).toBe(21200);
    expect(err.errors[0]!.description).toBe('Invalid date range');
    expect(err.errors[0]!.details).toEqual(['dateFrom > dateTo']);
    expect(err.traceId).toBe('trace-400');
    expect(err.timestamp).toBe('2026-04-18T10:00:00Z');
  });

  it('falls back to title when detail is missing', () => {
    const err = new KSeFBadRequestError({
      title: 'Bad Request',
      status: 400,
      errors: [],
    });

    expect(err.message).toBe('Bad Request');
    expect(err.detail).toBeUndefined();
  });

  it('falls back to "Bad Request" when both detail and title are empty', () => {
    const err = new KSeFBadRequestError({
      title: '',
      status: 400,
      errors: [],
    });

    expect(err.message).toBe('Bad Request');
  });

  it('defaults errors to empty array when omitted', () => {
    const err = new KSeFBadRequestError({
      title: 'Bad Request',
      status: 400,
      detail: 'x',
    } as never);

    expect(err.errors).toEqual([]);
  });

  it('has correct name and literal statusCode', () => {
    const err = new KSeFBadRequestError({
      title: 'Bad Request',
      status: 400,
      errors: [],
    });

    expect(err.name).toBe('KSeFBadRequestError');
    expect(err.statusCode).toBe(400);
  });

  it('extends KSeFApiError, KSeFError, and Error', () => {
    const err = new KSeFBadRequestError({
      title: 'Bad Request',
      status: 400,
      errors: [],
    });

    expect(err).toBeInstanceOf(KSeFBadRequestError);
    expect(err).toBeInstanceOf(KSeFApiError);
    expect(err).toBeInstanceOf(KSeFError);
    expect(err).toBeInstanceOf(Error);
  });
});
