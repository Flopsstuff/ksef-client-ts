import { describe, it, expect } from 'vitest';
import { KSeFForbiddenError, KSeFError, KSeFApiError } from '../../../src/errors/index.js';
import type { ForbiddenReasonCode } from '../../../src/errors/index.js';

describe('KSeFForbiddenError', () => {
  it('stores all fields from full problem details', () => {
    const err = new KSeFForbiddenError({
      title: 'Forbidden',
      status: 403,
      detail: 'No permission',
      reasonCode: 'missing-permissions',
      instance: '/api/invoices',
      security: { scope: 'read' },
      traceId: 'trace-2',
      timestamp: '2026-04-12T10:15:30Z',
    });

    expect(err.message).toBe('No permission');
    expect(err.statusCode).toBe(403);
    expect(err.detail).toBe('No permission');
    expect(err.reasonCode).toBe('missing-permissions');
    expect(err.instance).toBe('/api/invoices');
    expect(err.security).toEqual({ scope: 'read' });
    expect(err.traceId).toBe('trace-2');
    expect(err.timestamp).toBe('2026-04-12T10:15:30Z');
  });

  it('leaves optional fields undefined when not provided', () => {
    const err = new KSeFForbiddenError({
      title: 'Forbidden',
      status: 403,
      detail: 'Blocked',
      reasonCode: 'security-service-blocked',
    });

    expect(err.message).toBe('Blocked');
    expect(err.instance).toBeUndefined();
    expect(err.security).toBeUndefined();
    expect(err.traceId).toBeUndefined();
    expect(err.timestamp).toBeUndefined();
  });

  it('falls back to "Forbidden" when detail is empty', () => {
    const err = new KSeFForbiddenError({
      title: 'Forbidden',
      status: 403,
      detail: '',
      reasonCode: 'ip-not-allowed',
    });

    expect(err.message).toBe('Forbidden');
  });

  it.each<ForbiddenReasonCode>([
    'missing-permissions',
    'ip-not-allowed',
    'insufficient-resource-access',
    'auth-method-not-allowed',
    'security-service-blocked',
  ])('accepts reasonCode "%s"', (reasonCode) => {
    const err = new KSeFForbiddenError({
      title: 'Forbidden',
      status: 403,
      detail: 'test',
      reasonCode,
    });

    expect(err.reasonCode).toBe(reasonCode);
  });

  it('has correct name and statusCode', () => {
    const err = new KSeFForbiddenError({
      title: 'Forbidden',
      status: 403,
      detail: 'test',
      reasonCode: 'missing-permissions',
    });

    expect(err.name).toBe('KSeFForbiddenError');
    expect(err.statusCode).toBe(403);
  });

  it('extends KSeFApiError, KSeFError, and Error', () => {
    const err = new KSeFForbiddenError({
      title: 'Forbidden',
      status: 403,
      detail: 'test',
      reasonCode: 'missing-permissions',
    });

    expect(err).toBeInstanceOf(KSeFApiError);
    expect(err).toBeInstanceOf(KSeFError);
    expect(err).toBeInstanceOf(Error);
  });

  it('exposes typed security info (requiredAnyOfPermissions, presentPermissions)', () => {
    const err = new KSeFForbiddenError({
      title: 'Forbidden',
      status: 403,
      detail: 'Missing perms',
      reasonCode: 'missing-permissions',
      security: {
        requiredAnyOfPermissions: ['InvoiceRead', 'InvoiceWrite'],
        presentPermissions: ['SessionOwn'],
      },
    });

    expect(err.security?.requiredAnyOfPermissions).toEqual(['InvoiceRead', 'InvoiceWrite']);
    expect(err.security?.presentPermissions).toEqual(['SessionOwn']);
  });
});
