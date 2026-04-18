import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { consola } from 'consola';
import { renderCliError } from '../../../src/cli/error-renderer.js';
import {
  KSeFApiError,
  KSeFBadRequestError,
  KSeFBatchTimeoutError,
  KSeFForbiddenError,
  KSeFGoneError,
  KSeFRateLimitError,
  KSeFUnauthorizedError,
  KSeFValidationError,
} from '../../../src/errors/index.js';

vi.mock('consola', () => ({
  consola: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stdoutSpy.mockRestore();
});

function errorCalls(): string[] {
  return (consola.error as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
}

function infoCalls(): string[] {
  return (consola.info as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
}

describe('renderCliError — KSeFApiError dispatch', () => {
  it('renders KSeFRateLimitError with dedicated headline, Problem Details, and retry hint', () => {
    const err = new KSeFRateLimitError('ignored headline', 429, undefined, 12, undefined, {
      title: 'Too Many Requests',
      status: 429,
      detail: 'Token bucket exhausted',
      traceId: 'trace-429',
      timestamp: '2026-04-18T10:00:00Z',
    });

    renderCliError(err);

    const errors = errorCalls();
    expect(errors[0]).toBe('Rate limited by KSeF API.');
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('Detail: Token bucket exhausted'),
      expect.stringContaining('Trace ID: trace-429'),
      expect.stringContaining('Timestamp: 2026-04-18T10:00:00Z'),
    ]));
    expect(infoCalls()).toEqual([expect.stringContaining('Retry after 12s')]);
  });

  it('renders KSeFBadRequestError with errors[], nested details, and bad-request hint', () => {
    const err = new KSeFBadRequestError({
      title: 'Bad Request',
      status: 400,
      detail: 'Invalid query payload',
      errors: [
        { code: 21105, description: 'Invoice number must not be empty', details: [] },
        { code: 21106, description: 'Buyer NIP has invalid checksum', details: ['NIP 1234567890'] },
      ],
      traceId: 'trace-400',
      timestamp: '2026-04-18T10:00:00Z',
    });

    renderCliError(err);

    const errors = errorCalls();
    expect(errors[0]).toContain('HTTP 400');
    expect(errors[0]).toContain('Invalid query payload');
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('Errors:'),
      expect.stringContaining('[21105]'),
      expect.stringContaining('Invoice number must not be empty'),
      expect.stringContaining('[21106]'),
      expect.stringContaining('Buyer NIP has invalid checksum'),
      expect.stringContaining('NIP 1234567890'),
      expect.stringContaining('Trace ID: trace-400'),
    ]));
    expect(infoCalls()).toEqual([expect.stringContaining('Review the error list')]);
  });

  it('renders KSeFUnauthorizedError with detail, traceId, and auth hint', () => {
    const err = new KSeFUnauthorizedError({
      title: 'Unauthorized',
      status: 401,
      detail: 'Token expired',
      traceId: 'trace-401',
    });

    renderCliError(err);

    const errors = errorCalls();
    expect(errors[0]).toContain('HTTP 401');
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('Detail: Token expired'),
      expect.stringContaining('Trace ID: trace-401'),
    ]));
    expect(infoCalls()).toEqual([expect.stringContaining('ksef auth login')]);
  });

  it('renders KSeFForbiddenError with reasonCode, security.* lists, and permissions hint', () => {
    const err = new KSeFForbiddenError({
      title: 'Forbidden',
      status: 403,
      detail: 'Access denied',
      reasonCode: 'missing-permissions',
      security: {
        requiredAnyOfPermissions: ['InvoiceWrite', 'CredentialsManage'],
        presentPermissions: ['InvoiceRead'],
      },
      traceId: 'trace-403',
    });

    renderCliError(err);

    const errors = errorCalls();
    expect(errors[0]).toContain('HTTP 403');
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('Reason: missing-permissions'),
      expect.stringContaining('Required (any of): InvoiceWrite, CredentialsManage'),
      expect.stringContaining('Present:'),
      expect.stringContaining('InvoiceRead'),
      expect.stringContaining('Trace ID: trace-403'),
    ]));
    expect(infoCalls()).toEqual([expect.stringContaining('permissions')]);
  });

  it('renders KSeFGoneError with detail, traceId, and retention hint', () => {
    const err = new KSeFGoneError({
      title: 'Gone',
      status: 410,
      detail: 'Retention window expired',
      traceId: 'trace-410',
    });

    renderCliError(err);

    const errors = errorCalls();
    expect(errors[0]).toContain('HTTP 410');
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('Detail: Retention window expired'),
      expect.stringContaining('Trace ID: trace-410'),
    ]));
    expect(infoCalls()).toEqual([expect.stringContaining('aged out')]);
  });

  it('renders KSeFBatchTimeoutError via base toProblemFields (detail only)', () => {
    const err = new KSeFBatchTimeoutError('Batch timed out after 30m', 504);

    renderCliError(err);

    const errors = errorCalls();
    expect(errors[0]).toContain('HTTP 504');
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('Detail: Batch timed out after 30m'),
    ]));
    // No status-specific hint for batch timeout; no 404 hint
    expect(infoCalls()).toEqual([]);
  });

  it('renders generic KSeFApiError (no Problem Details) via base toProblemFields', () => {
    const err = new KSeFApiError('Internal error', 500);

    renderCliError(err);

    const errors = errorCalls();
    expect(errors[0]).toContain('HTTP 500');
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('Detail: Internal error'),
    ]));
  });

  it('adds 404 hint for generic KSeFApiError with 404 status', () => {
    const err = new KSeFApiError('Not found', 404);

    renderCliError(err);

    expect(infoCalls()).toEqual([expect.stringContaining('resource reference')]);
  });

  it('renders legacy exceptionDetailList fallback alongside Problem Details', () => {
    const err = new KSeFApiError('Legacy error', 400, {
      exception: {
        exceptionDetailList: [
          { exceptionCode: 10100, exceptionDescription: 'Invalid NIP' },
        ],
      },
    });

    renderCliError(err);

    const errors = errorCalls();
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('[10100]'),
      expect.stringContaining('Invalid NIP'),
    ]));
  });
});

describe('renderCliError — KSeFValidationError', () => {
  it('renders message plus details with field prefix', () => {
    const err = new KSeFValidationError('Validation failed', [
      { field: 'nip', message: 'must be 10 digits' },
      { message: 'unknown error' },
    ]);

    renderCliError(err);

    const errors = errorCalls();
    expect(errors).toEqual(expect.arrayContaining([
      'Validation failed',
      expect.stringContaining('[nip]'),
      expect.stringContaining('must be 10 digits'),
      expect.stringContaining('unknown error'),
    ]));
    expect(infoCalls()).toEqual([]);
  });
});

describe('renderCliError — generic Error', () => {
  it('renders "Cannot reach KSeF API" + doctor hint on fetch failure', () => {
    renderCliError(new Error('fetch failed: ECONNREFUSED'));

    expect(errorCalls()).toEqual([expect.stringContaining('Cannot reach KSeF API')]);
    expect(infoCalls()).toEqual([expect.stringContaining('ksef doctor')]);
  });

  it('renders network message for ENOTFOUND', () => {
    renderCliError(new Error('fetch failed due to ENOTFOUND'));

    expect(errorCalls()).toEqual([expect.stringContaining('Cannot reach KSeF API')]);
  });

  it('renders plain message for non-network generic Error', () => {
    renderCliError(new Error('Something went wrong'));

    expect(errorCalls()).toEqual(['Something went wrong']);
    expect(infoCalls()).toEqual([]);
  });

  it('renders "Unknown error" for non-Error values', () => {
    renderCliError('string error');

    expect(consola.error).toHaveBeenCalledWith('Unknown error', 'string error');
  });
});

describe('renderCliError — renderProblemDetails field skipping', () => {
  it('skips empty errors[] section', () => {
    const err = new KSeFBadRequestError({
      title: 'Bad Request',
      status: 400,
      detail: 'x',
      errors: [],
    });

    renderCliError(err);

    const errors = errorCalls();
    expect(errors).not.toEqual(expect.arrayContaining([
      expect.stringContaining('Errors:'),
    ]));
  });

  it('skips Required/Present lines when security arrays are empty', () => {
    const err = new KSeFForbiddenError({
      title: 'Forbidden',
      status: 403,
      detail: 'denied',
      reasonCode: 'missing-permissions',
      security: {
        requiredAnyOfPermissions: [],
        presentPermissions: [],
      },
    });

    renderCliError(err);

    const errors = errorCalls();
    expect(errors).not.toEqual(expect.arrayContaining([
      expect.stringContaining('Required'),
    ]));
    expect(errors).not.toEqual(expect.arrayContaining([
      expect.stringContaining('Present:'),
    ]));
  });

  it('does not truncate full-length trace IDs', () => {
    const fullId = '68f4fa84-5a3d-4a9f-9f0e-a0c1234567ab';
    const err = new KSeFUnauthorizedError({
      title: 'Unauthorized',
      status: 401,
      detail: 'x',
      traceId: fullId,
    });

    renderCliError(err);

    expect(errorCalls()).toEqual(expect.arrayContaining([
      expect.stringContaining(fullId),
    ]));
  });
});

describe('renderCliError — JSON mode', () => {
  it('writes single JSON object to stdout and bypasses consola for KSeFApiError', () => {
    const err = new KSeFBadRequestError({
      title: 'Bad Request',
      status: 400,
      detail: 'Invalid query payload',
      errors: [{ code: 21105, description: 'x', details: [] }],
      traceId: 'trace-400',
    });

    renderCliError(err, { json: true });

    expect(consola.error).not.toHaveBeenCalled();
    expect(consola.info).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const written = String(stdoutSpy.mock.calls[0]![0]);
    const parsed = JSON.parse(written);
    expect(parsed).toEqual({
      error: {
        name: 'KSeFBadRequestError',
        statusCode: 400,
        message: 'Invalid query payload',
        detail: 'Invalid query payload',
        errors: [{ code: 21105, description: 'x', details: [] }],
        traceId: 'trace-400',
      },
    });
  });

  it('serializes KSeFValidationError with details[]', () => {
    const err = new KSeFValidationError('bad', [{ field: 'nip', message: 'short' }]);

    renderCliError(err, { json: true });

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0]![0]));
    expect(parsed.error).toEqual({
      name: 'KSeFValidationError',
      message: 'bad',
      details: [{ field: 'nip', message: 'short' }],
    });
  });

  it('serializes generic Error with name + message', () => {
    renderCliError(new Error('network down'), { json: true });

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0]![0]));
    expect(parsed.error).toEqual({ name: 'Error', message: 'network down' });
  });

  it('falls through to pretty output for non-Error values even with json flag', () => {
    renderCliError('string error', { json: true });

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(consola.error).toHaveBeenCalledWith('Unknown error', 'string error');
  });
});
