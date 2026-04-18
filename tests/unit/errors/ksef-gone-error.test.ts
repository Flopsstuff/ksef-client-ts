import { describe, it, expect } from 'vitest';
import { KSeFGoneError, KSeFError, KSeFApiError } from '../../../src/errors/index.js';

describe('KSeFGoneError', () => {
  it('stores all fields from full problem details', () => {
    const err = new KSeFGoneError({
      title: 'Gone',
      status: 410,
      detail: 'Retention expired',
      instance: '/v2/auth/ref-123',
      traceId: 'trace-9',
      timestamp: '2026-04-12T10:00:00Z',
    });

    expect(err.message).toBe('Retention expired');
    expect(err.statusCode).toBe(410);
    expect(err.detail).toBe('Retention expired');
    expect(err.instance).toBe('/v2/auth/ref-123');
    expect(err.traceId).toBe('trace-9');
    expect(err.timestamp).toBe('2026-04-12T10:00:00Z');
  });

  it('leaves optional fields undefined when not provided', () => {
    const err = new KSeFGoneError({
      title: 'Gone',
      status: 410,
      detail: 'Retention expired',
    });

    expect(err.instance).toBeUndefined();
    expect(err.traceId).toBeUndefined();
    expect(err.timestamp).toBeUndefined();
  });

  it('falls back to default message when detail is empty', () => {
    const err = new KSeFGoneError({
      title: 'Gone',
      status: 410,
      detail: '',
    });

    expect(err.message).toBe('Operation status no longer available (retention expired)');
  });

  it('has correct name and statusCode', () => {
    const err = new KSeFGoneError({
      title: 'Gone',
      status: 410,
      detail: 'test',
    });

    expect(err.name).toBe('KSeFGoneError');
    expect(err.statusCode).toBe(410);
  });

  it('extends KSeFApiError, KSeFError, and Error', () => {
    const err = new KSeFGoneError({
      title: 'Gone',
      status: 410,
      detail: 'test',
    });

    expect(err).toBeInstanceOf(KSeFApiError);
    expect(err).toBeInstanceOf(KSeFError);
    expect(err).toBeInstanceOf(Error);
  });
});
