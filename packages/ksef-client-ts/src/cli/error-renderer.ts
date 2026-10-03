import { consola } from 'consola';
import {
  KSeFApiError,
  KSeFBadRequestError,
  KSeFErrorCode,
  KSeFForbiddenError,
  KSeFGoneError,
  KSeFInvoiceRejectedError,
  KSeFRateLimitError,
  KSeFSessionFailedError,
  KSeFUnauthorizedError,
  KSeFValidationError,
} from '../errors/index.js';
import type { ProblemFields } from '../errors/index.js';

export function renderCliError(error: unknown, opts?: { json?: boolean }): void {
  if (opts?.json) {
    const payload = error instanceof Error
      ? serializeError(error)
      : { name: 'UnknownError', value: safeValue(error) };
    process.stdout.write(JSON.stringify({ error: payload }, null, 2) + '\n');
    return;
  }

  if (error instanceof KSeFApiError) {
    if (error instanceof KSeFRateLimitError) {
      consola.error('Rate limited by KSeF API.');
    } else {
      consola.error(`KSeF API error (HTTP ${error.statusCode}): ${error.message}`);
    }

    renderProblemDetails(error.toProblemFields());

    // Legacy body path: errorResponse is populated only when Problem Details parsing fell back (pre-v2.4.0 servers / non-400/429 codes).
    const legacyDetails = error.errorResponse?.exception?.exceptionDetailList;
    if (legacyDetails?.length) {
      for (const d of legacyDetails) {
        consola.error(`  └ [${d.exceptionCode}] ${d.exceptionDescription ?? ''}`);
      }
    }

    const codeHints = hintsForCodes(collectErrorCodes(error));
    if (codeHints.length) {
      for (const hint of codeHints) consola.info(hint);
    } else {
      const hint = hintForStatus(error);
      if (hint) consola.info(hint);
    }
    return;
  }

  if (error instanceof KSeFValidationError) {
    consola.error(error.message);
    for (const d of error.details) {
      consola.error(`  └ ${d.field ? `[${d.field}] ` : ''}${d.message}`);
    }
    return;
  }

  if (error instanceof KSeFInvoiceRejectedError) {
    consola.error(`KSeF rejected invoice ${error.referenceNumber} (status ${error.code}): ${error.description}`);
    for (const d of error.details) consola.error(`  └ ${d}`);
    if (error.invoiceNumber) consola.error(`  └ Invoice number: ${error.invoiceNumber}`);
    if (error.originalKsefNumber) consola.error(`  └ Original KSeF number: ${error.originalKsefNumber}`);
    const hint = invoiceRejectedHint(error);
    if (hint) consola.info(hint);
    return;
  }

  if (error instanceof KSeFSessionFailedError) {
    consola.error(`KSeF session ${error.referenceNumber} failed (status ${error.code}): ${error.description}`);
    for (const d of error.details) consola.error(`  └ ${d}`);
    consola.info(`Hint: Run \`ksef session failed ${error.referenceNumber}\` to see which invoices were rejected and why.`);
    return;
  }

  if (error instanceof Error) {
    const msg = error.message;
    if (/fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/.test(msg)) {
      consola.error('Cannot reach KSeF API. Check your network connection and environment.');
      consola.info('Hint: Run `ksef doctor` to diagnose connectivity issues.');
    } else {
      consola.error(msg);
    }
    return;
  }

  consola.error('Unknown error', error);
}

function renderProblemDetails(fields: ProblemFields): void {
  if (fields.detail) consola.error(`  └ Detail: ${fields.detail}`);
  if (fields.reasonCode) consola.error(`  └ Reason: ${fields.reasonCode}`);

  const required = fields.security?.requiredAnyOfPermissions;
  if (required?.length) {
    consola.error(`  └ Required (any of): ${required.join(', ')}`);
  }
  const present = fields.security?.presentPermissions;
  if (present?.length) {
    consola.error(`  └ Present:           ${present.join(', ')}`);
  }

  if (fields.errors?.length) {
    consola.error(`  └ Errors:`);
    for (const err of fields.errors) {
      consola.error(err.description ? `    • [${err.code}] ${err.description}` : `    • [${err.code}]`);
      for (const d of err.details ?? []) {
        consola.error(`      └ ${d}`);
      }
    }
  }

  if (fields.traceId) consola.error(`  └ Trace ID: ${fields.traceId}`);
  if (fields.instance) consola.error(`  └ Instance: ${fields.instance}`);
  if (fields.timestamp) consola.error(`  └ Timestamp: ${fields.timestamp}`);
}

function safeValue(value: unknown): unknown {
  try {
    // Round-trip to verify JSON-serializable.
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function serializeError(error: Error): Record<string, unknown> {
  if (error instanceof KSeFApiError) {
    return {
      ...error.toProblemFields(),
      name: error.name,
      statusCode: error.statusCode,
      message: error.message,
    };
  }
  if (error instanceof KSeFValidationError) {
    return {
      name: error.name,
      message: error.message,
      details: error.details,
    };
  }
  if (error instanceof KSeFInvoiceRejectedError) {
    return {
      name: error.name,
      message: error.message,
      sessionReferenceNumber: error.sessionReferenceNumber,
      referenceNumber: error.referenceNumber,
      invoiceNumber: error.invoiceNumber,
      code: error.code,
      description: error.description,
      details: error.details,
      extensions: error.extensions,
    };
  }
  if (error instanceof KSeFSessionFailedError) {
    return {
      name: error.name,
      message: error.message,
      referenceNumber: error.referenceNumber,
      code: error.code,
      description: error.description,
      details: error.details,
    };
  }
  return {
    name: error.name,
    message: error.message,
  };
}

/** Invoice status codes (e.g. 440) are a separate namespace from the KSeF error codes in `CODE_HINTS`. */
function invoiceRejectedHint(error: KSeFInvoiceRejectedError): string | undefined {
  if (!error.isDuplicate) return undefined;
  const original = error.originalKsefNumber;
  return original
    ? `Hint [440]: This invoice is already in KSeF as ${original}. Use that KSeF number instead of sending it again, or give a new invoice its own number.`
    : 'Hint [440]: An invoice with this number is already in KSeF. Give a new invoice its own number instead of sending it again.';
}

function hintForStatus(error: KSeFApiError): string | undefined {
  if (error instanceof KSeFRateLimitError) return `Hint: Retry after ${error.recommendedDelay}s.`;
  if (error instanceof KSeFUnauthorizedError) return 'Hint: Your session may have expired. Run `ksef auth login` to re-authenticate.';
  if (error instanceof KSeFForbiddenError) return 'Hint: Check your permissions for this operation.';
  if (error instanceof KSeFBadRequestError) return 'Hint: Review the error list above; fix the flagged fields and retry.';
  if (error instanceof KSeFGoneError) return 'Hint: The operation has aged out. Re-submit the request if still relevant.';
  if (error.statusCode === 404) return 'Hint: Check if the resource reference is correct.';
  return undefined;
}

const CODE_HINTS: ReadonlyMap<number, string> = new Map([
  [
    KSeFErrorCode.SessionTemporarilyUnavailable,
    'KSeF temporarily stopped accepting invoices in this session. Run `ksef session open` and send the remaining invoices in the new session.',
  ],
  [
    KSeFErrorCode.InvalidContinuationToken,
    'The continuation token is invalid. Start the listing again without `--continue`.',
  ],
  [
    KSeFErrorCode.CollectiveIdentifierDifferentSellers,
    'A collective identifier groups invoices of one seller only. Remove the invoices of other sellers from the list.',
  ],
  [
    KSeFErrorCode.CollectiveIdentifierDuplicateKsefNumber,
    'The invoice list repeats a KSeF number. Remove the duplicates and retry.',
  ],
  [
    KSeFErrorCode.UnknownPublicKeyId,
    'KSeF no longer accepts the public key used for encryption, likely mid key rotation. Wait a moment and run the command again.',
  ],
  [
    KSeFErrorCode.BatchTimeout,
    'The batch session expired before all parts were uploaded and closed. Send the batch again with `ksef invoice send`.',
  ],
]);

// 21405 accompanies most specific codes, so its generic advice is shown only when nothing more specific applies.
const INVALID_INPUT_HINT = 'KSeF rejected the input. Fix the values named in the error details and retry.';

/** KSeF error codes in order of appearance: Problem Details `errors[]`, the legacy exception list, then the class's own code. */
function collectErrorCodes(error: KSeFApiError): number[] {
  const codes = [
    ...(error.toProblemFields().errors ?? []).map((e) => e.code),
    ...(error.errorResponse?.exception?.exceptionDetailList ?? []).map((d) => d.exceptionCode),
  ];
  const ownCode = (error as { errorCode?: unknown }).errorCode;
  if (typeof ownCode === 'number') codes.push(ownCode);
  return [...new Set(codes.filter((c): c is number => typeof c === 'number'))];
}

/** One hint per distinct code that has one, so each actionable code is answered. */
function hintsForCodes(codes: readonly number[]): string[] {
  const hints = codes.flatMap((code) => {
    const hint = CODE_HINTS.get(code);
    return hint ? [`Hint [${code}]: ${hint}`] : [];
  });
  if (!hints.length && codes.includes(KSeFErrorCode.InvalidInput)) {
    hints.push(`Hint [${KSeFErrorCode.InvalidInput}]: ${INVALID_INPUT_HINT}`);
  }
  return hints;
}
