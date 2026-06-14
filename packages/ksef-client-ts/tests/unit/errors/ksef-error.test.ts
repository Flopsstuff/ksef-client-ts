import { describe, it, expect } from 'vitest';
import {
  KSeFError,
  KSeFApiError,
  KSeFRateLimitError,
  KSeFValidationError,
  KSeFAuthStatusError,
  KSeFSessionExpiredError,
} from '../../../src/errors/index.js';

describe('KSeFError', () => {
  it('should be an instance of Error', () => {
    const err = new KSeFError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(KSeFError);
    expect(err.name).toBe('KSeFError');
    expect(err.message).toBe('test');
  });
});

describe('Error hierarchy', () => {
  it('KSeFApiError extends KSeFError', () => {
    const err = new KSeFApiError('api', 500);
    expect(err).toBeInstanceOf(KSeFError);
    expect(err).toBeInstanceOf(Error);
  });

  it('KSeFRateLimitError extends KSeFApiError and KSeFError', () => {
    const err = new KSeFRateLimitError('rate', 429);
    expect(err).toBeInstanceOf(KSeFApiError);
    expect(err).toBeInstanceOf(KSeFError);
    expect(err).toBeInstanceOf(Error);
  });

  it('KSeFValidationError extends KSeFError', () => {
    const err = new KSeFValidationError('bad');
    expect(err).toBeInstanceOf(KSeFError);
    expect(err).toBeInstanceOf(Error);
  });

  it('KSeFAuthStatusError extends KSeFError', () => {
    const err = new KSeFAuthStatusError('auth failed');
    expect(err).toBeInstanceOf(KSeFError);
    expect(err).toBeInstanceOf(Error);
  });

  it('KSeFSessionExpiredError extends KSeFError', () => {
    const err = new KSeFSessionExpiredError();
    expect(err).toBeInstanceOf(KSeFError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('KSeFValidationError', () => {
  it('should store details array', () => {
    const details = [
      { field: 'nip', message: 'NIP is required' },
      { field: 'name', message: 'Name is required' },
    ];
    const err = new KSeFValidationError('Validation failed', details);
    expect(err.name).toBe('KSeFValidationError');
    expect(err.details).toEqual(details);
  });

  it('should default to empty details', () => {
    const err = new KSeFValidationError('bad');
    expect(err.details).toEqual([]);
  });

  it('fromField creates error with single detail', () => {
    const err = KSeFValidationError.fromField('nip', 'NIP is required');
    expect(err.message).toBe('NIP is required');
    expect(err.details).toEqual([{ field: 'nip', message: 'NIP is required' }]);
  });

  it('fromMessages creates error with multiple details', () => {
    const err = KSeFValidationError.fromMessages(['A is required', 'B is invalid']);
    expect(err.message).toBe('A is required; B is invalid');
    expect(err.details).toHaveLength(2);
    expect(err.details[0]).toEqual({ message: 'A is required' });
    expect(err.details[1]).toEqual({ message: 'B is invalid' });
  });
});

describe('KSeFAuthStatusError', () => {
  it('should store referenceNumber and statusDescription', () => {
    const err = new KSeFAuthStatusError('auth failed', 'REF-123', 'Certificate suspended');
    expect(err.name).toBe('KSeFAuthStatusError');
    expect(err.message).toBe('auth failed');
    expect(err.referenceNumber).toBe('REF-123');
    expect(err.statusDescription).toBe('Certificate suspended');
  });

  it('should work without optional fields', () => {
    const err = new KSeFAuthStatusError('auth failed');
    expect(err.referenceNumber).toBeUndefined();
    expect(err.statusDescription).toBeUndefined();
  });
});

describe('KSeFSessionExpiredError', () => {
  it('should have default message', () => {
    const err = new KSeFSessionExpiredError();
    expect(err.name).toBe('KSeFSessionExpiredError');
    expect(err.message).toBe('KSeF session has expired');
  });

  it('should accept custom message', () => {
    const err = new KSeFSessionExpiredError('Session timed out after 2h');
    expect(err.message).toBe('Session timed out after 2h');
  });
});
