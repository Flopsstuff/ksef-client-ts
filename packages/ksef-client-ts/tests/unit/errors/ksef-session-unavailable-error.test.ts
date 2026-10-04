import { describe, it, expect } from 'vitest';
import {
  KSeFSessionUnavailableError,
  KSeFApiError,
  KSeFError,
  KSeFErrorCode,
} from '../../../src/errors/index.js';
import * as publicApi from '../../../src/index.js';

describe('KSeFSessionUnavailableError', () => {
  it('extends KSeFApiError, KSeFError, Error', () => {
    const err = KSeFSessionUnavailableError.fromLegacy();

    expect(err).toBeInstanceOf(KSeFApiError);
    expect(err).toBeInstanceOf(KSeFError);
    expect(err).toBeInstanceOf(Error);
  });

  it('has a stable name, status 400 and errorCode 21184', () => {
    const err = KSeFSessionUnavailableError.fromLegacy();

    expect(err.name).toBe('KSeFSessionUnavailableError');
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBe(21184);
    expect(err.errorCode).toBe(KSeFErrorCode.SessionTemporarilyUnavailable);
  });

  it('is exported from the public entry point', () => {
    expect(publicApi.KSeFSessionUnavailableError).toBe(KSeFSessionUnavailableError);
  });

  it('fromLegacy() picks the 21184 exceptionDescription and keeps the body', () => {
    const body = {
      exception: {
        exceptionDetailList: [
          { exceptionCode: 21405, exceptionDescription: 'Other' },
          { exceptionCode: 21184, exceptionDescription: 'Sesja tymczasowo niedostępna.' },
        ],
      },
    };
    const err = KSeFSessionUnavailableError.fromLegacy(body);

    expect(err.message).toBe('Sesja tymczasowo niedostępna.');
    expect(err.errorResponse).toBe(body);
  });

  it('fromLegacy() falls back to a default message recommending a new session', () => {
    const err = KSeFSessionUnavailableError.fromLegacy({
      exception: { exceptionDetailList: [{ exceptionCode: 21184, exceptionDescription: '   ' }] },
    });

    expect(err.message).toContain('open a new session');
    expect(err.message).toContain('KSeF 21184');
  });

  it('fromProblem() prefers the 21184 item description, then problem.detail, then the default', () => {
    expect(
      KSeFSessionUnavailableError.fromProblem({
        title: 'Bad Request',
        status: 400,
        detail: 'Request rejected',
        errors: [{ code: 21184, description: 'Session paused' }],
      }).message,
    ).toBe('Session paused');

    expect(
      KSeFSessionUnavailableError.fromProblem({
        title: 'Bad Request',
        status: 400,
        detail: 'Request rejected',
        errors: [{ code: 21184 }],
      }).message,
    ).toBe('Request rejected');

    expect(
      KSeFSessionUnavailableError.fromProblem({
        title: 'Bad Request',
        status: 400,
        errors: [{ code: 21184 }],
      }).message,
    ).toContain('KSeF 21184');
  });
});
