import { describe, it, expect } from 'vitest';
import { KSeFUnauthorizedError, KSeFError, KSeFApiError } from '../../../src/errors/index.js';

describe('KSeFUnauthorizedError', () => {
  it('stores all fields from full problem details', () => {
    const err = new KSeFUnauthorizedError({
      title: 'Unauthorized',
      status: 401,
      detail: 'Token expired',
      traceId: 'trace-1',
      instance: '/api/auth',
    });

    expect(err.message).toBe('Token expired');
    expect(err.statusCode).toBe(401);
    expect(err.detail).toBe('Token expired');
    expect(err.traceId).toBe('trace-1');
    expect(err.instance).toBe('/api/auth');
  });

  it('leaves optional fields undefined when not provided', () => {
    const err = new KSeFUnauthorizedError({
      title: 'Unauthorized',
      status: 401,
      detail: 'Bad token',
    });

    expect(err.message).toBe('Bad token');
    expect(err.traceId).toBeUndefined();
    expect(err.instance).toBeUndefined();
  });

  it('falls back to "Unauthorized" when detail is empty', () => {
    const err = new KSeFUnauthorizedError({
      title: 'Unauthorized',
      status: 401,
      detail: '',
    });

    expect(err.message).toBe('Unauthorized');
  });

  it('has correct name and statusCode', () => {
    const err = new KSeFUnauthorizedError({
      title: 'Unauthorized',
      status: 401,
      detail: 'test',
    });

    expect(err.name).toBe('KSeFUnauthorizedError');
    expect(err.statusCode).toBe(401);
  });

  it('extends KSeFError and Error, but not KSeFApiError', () => {
    const err = new KSeFUnauthorizedError({
      title: 'Unauthorized',
      status: 401,
      detail: 'test',
    });

    expect(err).toBeInstanceOf(KSeFError);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(KSeFApiError);
  });
});
