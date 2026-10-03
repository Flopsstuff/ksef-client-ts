import { describe, it, expect } from 'vitest';
import {
  KSeFApiError,
  KSeFBadRequestError,
  KSeFBatchTimeoutError,
  KSeFForbiddenError,
  KSeFGoneError,
  KSeFRateLimitError,
  KSeFSessionUnavailableError,
  KSeFUnauthorizedError,
  KSeFUnknownPublicKeyError,
} from '../../../src/errors/index.js';

describe('toProblemFields()', () => {
  describe('KSeFApiError (base)', () => {
    it('returns { detail: message } fallback', () => {
      const err = new KSeFApiError('Boom', 500);
      expect(err.toProblemFields()).toEqual({ detail: 'Boom' });
    });
  });

  describe('KSeFBadRequestError', () => {
    it('returns detail, errors, traceId, instance, timestamp', () => {
      const err = new KSeFBadRequestError({
        title: 'Bad Request',
        status: 400,
        detail: 'Validation failed',
        instance: '/v2/invoices/query',
        errors: [{ code: 21200, description: 'X', details: ['y'] }],
        traceId: 'trace-400',
        timestamp: '2026-04-18T10:00:00Z',
      });

      expect(err.toProblemFields()).toEqual({
        detail: 'Validation failed',
        errors: [{ code: 21200, description: 'X', details: ['y'] }],
        traceId: 'trace-400',
        instance: '/v2/invoices/query',
        timestamp: '2026-04-18T10:00:00Z',
      });
    });

    it('omits errors when list is empty', () => {
      const err = new KSeFBadRequestError({
        title: 'Bad Request',
        status: 400,
        detail: 'x',
        errors: [],
      });
      expect(err.toProblemFields().errors).toBeUndefined();
    });
  });

  describe('KSeFUnauthorizedError', () => {
    it('returns detail, traceId, instance, timestamp', () => {
      const err = new KSeFUnauthorizedError({
        title: 'Unauthorized',
        status: 401,
        detail: 'Token expired',
        traceId: 'trace-401',
        instance: '/v2/auth/ping',
        timestamp: '2026-04-18T10:00:00Z',
      });

      expect(err.toProblemFields()).toEqual({
        detail: 'Token expired',
        traceId: 'trace-401',
        instance: '/v2/auth/ping',
        timestamp: '2026-04-18T10:00:00Z',
      });
    });
  });

  describe('KSeFForbiddenError', () => {
    it('returns detail, reasonCode, security, traceId, instance, timestamp', () => {
      const err = new KSeFForbiddenError({
        title: 'Forbidden',
        status: 403,
        detail: 'Access denied',
        reasonCode: 'missing-permissions',
        security: {
          requiredAnyOfPermissions: ['InvoiceWrite'],
          presentPermissions: ['InvoiceRead'],
        },
        traceId: 'trace-403',
        instance: '/v2/invoices',
        timestamp: '2026-04-18T10:00:00Z',
      });

      expect(err.toProblemFields()).toEqual({
        detail: 'Access denied',
        reasonCode: 'missing-permissions',
        security: {
          requiredAnyOfPermissions: ['InvoiceWrite'],
          presentPermissions: ['InvoiceRead'],
        },
        traceId: 'trace-403',
        instance: '/v2/invoices',
        timestamp: '2026-04-18T10:00:00Z',
      });
    });

    it('passes security through as undefined when missing', () => {
      const err = new KSeFForbiddenError({
        title: 'Forbidden',
        status: 403,
        detail: 'x',
        reasonCode: 'ip-not-allowed',
      });
      expect(err.toProblemFields().security).toBeUndefined();
    });
  });

  describe('KSeFGoneError', () => {
    it('returns detail, traceId, instance, timestamp', () => {
      const err = new KSeFGoneError({
        title: 'Gone',
        status: 410,
        detail: 'Retention expired',
        traceId: 'trace-410',
        instance: '/v2/operations/abc',
        timestamp: '2026-04-18T10:00:00Z',
      });

      expect(err.toProblemFields()).toEqual({
        detail: 'Retention expired',
        traceId: 'trace-410',
        instance: '/v2/operations/abc',
        timestamp: '2026-04-18T10:00:00Z',
      });
    });
  });

  describe('KSeFRateLimitError', () => {
    it('reads Problem Details fields from nested .problem', () => {
      const err = new KSeFRateLimitError(
        'Rate limited',
        429,
        undefined,
        12,
        undefined,
        {
          title: 'Too Many Requests',
          status: 429,
          detail: 'Token bucket exhausted',
          traceId: 'trace-429',
          instance: '/v2/invoices/send',
          timestamp: '2026-04-18T10:00:00Z',
        },
      );

      expect(err.toProblemFields()).toEqual({
        detail: 'Token bucket exhausted',
        traceId: 'trace-429',
        instance: '/v2/invoices/send',
        timestamp: '2026-04-18T10:00:00Z',
      });
    });

    it('returns undefined fields when .problem is absent', () => {
      const err = new KSeFRateLimitError('Rate limited', 429, undefined, 30);
      expect(err.toProblemFields()).toEqual({
        detail: undefined,
        traceId: undefined,
        instance: undefined,
        timestamp: undefined,
      });
    });
  });

  describe('KSeFBatchTimeoutError', () => {
    it('inherits base toProblemFields and returns message as detail', () => {
      const err = new KSeFBatchTimeoutError('Batch timed out', 504);
      expect(err.toProblemFields()).toEqual({ detail: 'Batch timed out' });
    });
  });

  describe.each([
    { name: 'KSeFUnknownPublicKeyError', cls: KSeFUnknownPublicKeyError, code: 21470 },
    { name: 'KSeFSessionUnavailableError', cls: KSeFSessionUnavailableError, code: 21184 },
  ])('$name', ({ cls, code }) => {
    const problem = {
      title: 'Bad Request',
      status: 400,
      detail: 'Request rejected',
      instance: '/v2/sessions/online/ref/invoices',
      errors: [{ code: 21405, description: 'Invalid field', details: ['P_1'] }, { code }],
      traceId: 'trace-400',
      timestamp: '2026-10-03T10:00:00Z',
    };

    it('fromProblem() keeps the Problem Details fields', () => {
      const err = cls.fromProblem(problem);

      expect(err.detail).toBe('Request rejected');
      expect(err.instance).toBe('/v2/sessions/online/ref/invoices');
      expect(err.errors).toEqual(problem.errors);
      expect(err.traceId).toBe('trace-400');
      expect(err.timestamp).toBe('2026-10-03T10:00:00Z');
      expect(err.errorResponse).toBeUndefined();
    });

    it('toProblemFields() surfaces them like KSeFBadRequestError', () => {
      expect(cls.fromProblem(problem).toProblemFields()).toEqual({
        detail: 'Request rejected',
        errors: problem.errors,
        traceId: 'trace-400',
        instance: '/v2/sessions/online/ref/invoices',
        timestamp: '2026-10-03T10:00:00Z',
      });
    });

    it('toProblemFields() keeps the base message-only shape for a legacy body', () => {
      const err = cls.fromLegacy({
        exception: { exceptionDetailList: [{ exceptionCode: code, exceptionDescription: 'Legacy' }] },
      });

      expect(err.errors).toEqual([]);
      expect(err.toProblemFields()).toEqual({ detail: 'Legacy' });
    });
  });
});
