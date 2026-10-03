import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { consola } from 'consola';
import { renderCliError } from '../../../src/cli/error-renderer.js';
import {
  KSeFApiError,
  KSeFBadRequestError,
  KSeFBatchTimeoutError,
  KSeFForbiddenError,
  KSeFGoneError,
  KSeFInvoiceRejectedError,
  KSeFPaginationError,
  KSeFRateLimitError,
  KSeFSessionFailedError,
  KSeFSessionUnavailableError,
  KSeFUnauthorizedError,
  KSeFUnknownPublicKeyError,
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

  it('renders a code-only KSeFBadRequestError entry without an "undefined" description', () => {
    const err = new KSeFBadRequestError({
      title: 'Bad Request',
      status: 400,
      errors: [{ code: 21405 }],
    });

    renderCliError(err);

    const errors = errorCalls();
    expect(errors).toContain('    • [21405]');
    expect(errors.join('\n')).not.toContain('undefined');
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

  it.each([
    { name: 'KSeFUnknownPublicKeyError', cls: KSeFUnknownPublicKeyError, code: 21470 },
    { name: 'KSeFSessionUnavailableError', cls: KSeFSessionUnavailableError, code: 21184 },
  ])('renders the Problem Details error list of $name', ({ cls, code }) => {
    const err = cls.fromProblem({
      title: 'Bad Request',
      status: 400,
      errors: [{ code, description: 'Rejected by KSeF', details: ['ref 123'] }],
      traceId: 'trace-400',
    });

    renderCliError(err);

    expect(errorCalls()).toEqual(expect.arrayContaining([
      expect.stringContaining('Errors:'),
      expect.stringContaining(`[${code}] Rejected by KSeF`),
      expect.stringContaining('ref 123'),
      expect.stringContaining('Trace ID: trace-400'),
    ]));
  });

  it('renders KSeFBatchTimeoutError via base toProblemFields (detail only)', () => {
    const err = new KSeFBatchTimeoutError('Batch timed out after 30m', 504);

    renderCliError(err);

    const errors = errorCalls();
    expect(errors[0]).toContain('HTTP 504');
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('Detail: Batch timed out after 30m'),
    ]));
    // The class's own code (21208) drives the hint even without a legacy body.
    expect(infoCalls()).toEqual([expect.stringContaining('Hint [21208]')]);
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

describe('renderCliError — hints by KSeF error code', () => {
  function badRequest(...codes: number[]): KSeFBadRequestError {
    return new KSeFBadRequestError({
      title: 'Bad Request',
      status: 400,
      errors: codes.map((code) => ({ code })),
    });
  }

  it.each([
    { code: 21184, text: 'ksef session open' },
    { code: 21418, text: 'without `--continue`' },
    { code: 71004, text: 'one seller' },
    { code: 71005, text: 'Remove the duplicates' },
    { code: 21470, text: 'public key' },
    { code: 21208, text: 'ksef invoice send' },
    { code: 21405, text: 'error details' },
  ])('gives the $code hint instead of the status hint', ({ code, text }) => {
    renderCliError(badRequest(code));

    const hints = infoCalls();
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatch(new RegExp(`^Hint \\[${code}\\]: `));
    expect(hints[0]).toContain(text);
  });

  it('falls back to the status hint for a code without one', () => {
    renderCliError(badRequest(21105));

    expect(infoCalls()).toEqual([expect.stringContaining('Review the error list')]);
  });

  it('reads codes from the legacy exception list', () => {
    const err = new KSeFApiError('Legacy error', 404, {
      exception: {
        exceptionDetailList: [{ exceptionCode: 21418, exceptionDescription: 'Bad token' }],
      },
    });

    renderCliError(err);

    expect(infoCalls()).toEqual([expect.stringContaining('Hint [21418]')]);
  });

  it('reads the code of a legacy-built typed error', () => {
    renderCliError(KSeFSessionUnavailableError.fromLegacy(undefined));

    expect(infoCalls()).toEqual([expect.stringContaining('Hint [21184]')]);
  });

  it('gives each distinct code its hint once, in order', () => {
    const err = new KSeFBadRequestError({
      title: 'Bad Request',
      status: 400,
      errors: [{ code: 71005 }, { code: 71004 }, { code: 71005 }],
    });

    renderCliError(err);

    expect(infoCalls()).toEqual([
      expect.stringContaining('Hint [71005]'),
      expect.stringContaining('Hint [71004]'),
    ]);
  });

  it('dedupes a code present in both the problem and the class field', () => {
    renderCliError(KSeFUnknownPublicKeyError.fromProblem({
      title: 'Bad Request',
      status: 400,
      errors: [{ code: 21470 }],
    }));

    expect(infoCalls()).toEqual([expect.stringContaining('Hint [21470]')]);
  });

  it('dedupes a code present in both the legacy list and the class field', () => {
    renderCliError(KSeFBatchTimeoutError.fromResponse(400, {
      exception: { exceptionDetailList: [{ exceptionCode: 21208 }] },
    }));

    expect(infoCalls()).toEqual([expect.stringContaining('Hint [21208]')]);
  });

  it('drops the generic 21405 hint when a specific code has one', () => {
    renderCliError(badRequest(21405, 71004));

    expect(infoCalls()).toEqual([expect.stringContaining('Hint [71004]')]);
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

function rejectedInvoice(code: number, description: string, extra: { details?: string[]; extensions?: Record<string, string | null> } = {}) {
  return new KSeFInvoiceRejectedError('sess-ref', {
    ordinalNumber: 1,
    referenceNumber: 'inv-ref',
    invoiceNumber: 'FV/1',
    invoiceHash: 'hash',
    invoicingDate: '2026-10-03T10:00:00Z',
    status: { code, description, ...extra },
  });
}

describe('renderCliError — KSeFInvoiceRejectedError', () => {
  it('renders a duplicate with the original KSeF number and a 440 hint', () => {
    renderCliError(rejectedInvoice(440, 'Duplikat faktury', { extensions: { originalKsefNumber: 'KSEF-ORIG' } }));

    expect(errorCalls()).toEqual([
      'KSeF rejected invoice inv-ref (status 440): Duplikat faktury',
      '  └ Invoice number: FV/1',
      '  └ Original KSeF number: KSEF-ORIG',
    ]);
    const hints = infoCalls();
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatch(/^Hint \[440\]: /);
    expect(hints[0]).toContain('KSEF-ORIG');
  });

  it('gives the 440 hint without the original number when KSeF did not send it', () => {
    renderCliError(rejectedInvoice(440, 'Duplikat faktury'));

    expect(infoCalls()).toEqual([expect.stringMatching(/^Hint \[440\]: An invoice with this number/)]);
  });

  it('renders the details of other rejections without a hint', () => {
    renderCliError(rejectedInvoice(450, 'Błąd weryfikacji semantyki', { details: ['bad P_15'] }));

    expect(errorCalls()).toEqual(expect.arrayContaining([
      'KSeF rejected invoice inv-ref (status 450): Błąd weryfikacji semantyki',
      '  └ bad P_15',
    ]));
    expect(infoCalls()).toEqual([]);
  });
});

describe('renderCliError — KSeFSessionFailedError', () => {
  it('renders the session status with a hint to list failed invoices', () => {
    renderCliError(new KSeFSessionFailedError('Batch session failed: 445 — Brak poprawnych faktur', 'sess-ref', {
      status: { code: 445, description: 'Brak poprawnych faktur', details: ['all invalid'] },
      dateCreated: '2026-10-03T10:00:00Z',
      dateUpdated: '2026-10-03T10:00:00Z',
    }));

    expect(errorCalls()).toEqual([
      'KSeF session sess-ref failed (status 445): Brak poprawnych faktur',
      '  └ all invalid',
    ]);
    expect(infoCalls()).toEqual([expect.stringContaining('ksef session failed sess-ref')]);
  });
});

describe('renderCliError — KSeFPaginationError', () => {
  it('points at --continue with the first unread token when the page cap is reached', () => {
    renderCliError(new KSeFPaginationError('paging exceeded 1000 pages', 'tok-next', 'max-pages'));

    expect(errorCalls()).toEqual(['paging exceeded 1000 pages']);
    expect(infoCalls()).toEqual([expect.stringContaining('`--continue tok-next`')]);
  });

  it('does not suggest resuming from a repeated token', () => {
    renderCliError(new KSeFPaginationError('paging stalled', 'tok-loop', 'repeated-token'));

    expect(infoCalls()).toEqual([expect.stringContaining('Narrow the query')]);
    expect(infoCalls()[0]).not.toContain('--continue');
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

  it('serializes the Problem Details fields of KSeFSessionUnavailableError', () => {
    const err = KSeFSessionUnavailableError.fromProblem({
      title: 'Bad Request',
      status: 400,
      errors: [{ code: 21184, description: 'Sesja tymczasowo niedostępna.' }],
      traceId: 'trace-400',
    });

    renderCliError(err, { json: true });

    // Hints are human-only: --json output stays the bare error payload.
    expect(consola.info).not.toHaveBeenCalled();
    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0]![0]));
    expect(parsed.error).toEqual({
      name: 'KSeFSessionUnavailableError',
      statusCode: 400,
      message: 'Sesja tymczasowo niedostępna.',
      errors: [{ code: 21184, description: 'Sesja tymczasowo niedostępna.' }],
      traceId: 'trace-400',
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

  it('serializes KSeFInvoiceRejectedError with its status and extensions', () => {
    const err = rejectedInvoice(440, 'Duplikat faktury', { extensions: { originalKsefNumber: 'KSEF-ORIG' } });

    renderCliError(err, { json: true });

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0]![0]));
    expect(parsed.error).toEqual({
      name: 'KSeFInvoiceRejectedError',
      message: err.message,
      sessionReferenceNumber: 'sess-ref',
      referenceNumber: 'inv-ref',
      invoiceNumber: 'FV/1',
      code: 440,
      description: 'Duplikat faktury',
      details: [],
      extensions: { originalKsefNumber: 'KSEF-ORIG' },
    });
  });

  it('serializes KSeFSessionFailedError with its status', () => {
    renderCliError(new KSeFSessionFailedError('Session failed: 415 — Błąd odszyfrowania', 'sess-ref', {
      status: { code: 415, description: 'Błąd odszyfrowania' },
      dateCreated: '2026-10-03T10:00:00Z',
      dateUpdated: '2026-10-03T10:00:00Z',
    }), { json: true });

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0]![0]));
    expect(parsed.error).toEqual({
      name: 'KSeFSessionFailedError',
      message: 'Session failed: 415 — Błąd odszyfrowania',
      referenceNumber: 'sess-ref',
      code: 415,
      description: 'Błąd odszyfrowania',
      details: [],
    });
  });

  it('serializes KSeFPaginationError with its reason and continuation token', () => {
    renderCliError(new KSeFPaginationError('paging exceeded 1000 pages', 'tok-next', 'max-pages'), { json: true });

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0]![0]));
    expect(parsed.error).toEqual({
      name: 'KSeFPaginationError',
      message: 'paging exceeded 1000 pages',
      reason: 'max-pages',
      continuationToken: 'tok-next',
    });
  });

  it('serializes generic Error with name + message', () => {
    renderCliError(new Error('network down'), { json: true });

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0]![0]));
    expect(parsed.error).toEqual({ name: 'Error', message: 'network down' });
  });

  it('emits JSON envelope for a thrown string in JSON mode', () => {
    renderCliError('just a string', { json: true });

    expect(consola.error).not.toHaveBeenCalled();
    expect(consola.info).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0]![0]));
    expect(parsed).toEqual({
      error: { name: 'UnknownError', value: 'just a string' },
    });
  });

  it('emits JSON envelope for a thrown plain object in JSON mode', () => {
    renderCliError({ code: 42, detail: 'oops' }, { json: true });

    expect(consola.error).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0]![0]));
    expect(parsed).toEqual({
      error: { name: 'UnknownError', value: { code: 42, detail: 'oops' } },
    });
  });

  it('emits JSON envelope for a thrown null in JSON mode', () => {
    renderCliError(null, { json: true });

    expect(consola.error).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0]![0]));
    expect(parsed).toEqual({
      error: { name: 'UnknownError', value: null },
    });
  });

  it('handles non-serializable values (circular reference) gracefully', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    expect(() => renderCliError(circular, { json: true })).not.toThrow();

    expect(consola.error).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const written = String(stdoutSpy.mock.calls[0]![0]);
    const parsed = JSON.parse(written);
    expect(parsed.error.name).toBe('UnknownError');
    expect(typeof parsed.error.value).toBe('string');
    expect(parsed.error.value).toBe(String(circular));
  });
});
