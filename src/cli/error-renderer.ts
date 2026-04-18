import { consola } from 'consola';
import {
  KSeFApiError,
  KSeFBadRequestError,
  KSeFForbiddenError,
  KSeFGoneError,
  KSeFRateLimitError,
  KSeFUnauthorizedError,
  KSeFValidationError,
} from '../errors/index.js';
import type { ProblemFields } from '../errors/index.js';

export function renderCliError(error: unknown, opts?: { json?: boolean }): void {
  if (opts?.json && error instanceof Error) {
    process.stdout.write(JSON.stringify({ error: serializeError(error) }, null, 2) + '\n');
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

    const hint = hintForStatus(error);
    if (hint) consola.info(hint);
    return;
  }

  if (error instanceof KSeFValidationError) {
    consola.error(error.message);
    for (const d of error.details) {
      consola.error(`  └ ${d.field ? `[${d.field}] ` : ''}${d.message}`);
    }
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
      consola.error(`    • [${err.code}] ${err.description}`);
      for (const d of err.details ?? []) {
        consola.error(`      └ ${d}`);
      }
    }
  }

  if (fields.traceId) consola.error(`  └ Trace ID: ${fields.traceId}`);
  if (fields.instance) consola.error(`  └ Instance: ${fields.instance}`);
  if (fields.timestamp) consola.error(`  └ Timestamp: ${fields.timestamp}`);
}

function serializeError(error: Error): Record<string, unknown> {
  if (error instanceof KSeFApiError) {
    return {
      name: error.name,
      statusCode: error.statusCode,
      message: error.message,
      ...error.toProblemFields(),
    };
  }
  if (error instanceof KSeFValidationError) {
    return {
      name: error.name,
      message: error.message,
      details: error.details,
    };
  }
  return {
    name: error.name,
    message: error.message,
  };
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
