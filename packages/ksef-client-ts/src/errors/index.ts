export type { ExceptionDetails, ApiErrorResponse } from './types.js';
export type {
  UnauthorizedProblemDetails,
  ForbiddenProblemDetails,
  ForbiddenReasonCode,
  ForbiddenSecurityInfo,
  GoneProblemDetails,
  BadRequestErrorDetail,
  BadRequestProblemDetails,
  TooManyRequestsProblemDetails,
  ProblemFields,
} from './types.js';
export type { ValidationDetail } from './ksef-validation-error.js';
export { KSeFError } from './ksef-error.js';
export { KSeFApiError } from './ksef-api-error.js';
export { KSeFRateLimitError } from './ksef-rate-limit-error.js';
export { KSeFUnauthorizedError } from './ksef-unauthorized-error.js';
export { KSeFForbiddenError } from './ksef-forbidden-error.js';
export { KSeFGoneError } from './ksef-gone-error.js';
export { KSeFBadRequestError } from './ksef-bad-request-error.js';
export { KSeFAuthStatusError } from './ksef-auth-status-error.js';
export { KSeFSessionExpiredError } from './ksef-session-expired-error.js';
export { KSeFValidationError } from './ksef-validation-error.js';
export { KSeFMetadataPaginationError } from './ksef-metadata-pagination-error.js';
export { KSeFBatchTimeoutError } from './ksef-batch-timeout-error.js';
export { KSeFUnknownPublicKeyError } from './ksef-unknown-public-key-error.js';
export { KSeFCircuitOpenError } from './ksef-circuit-open-error.js';
export { KSeFXsdValidationError } from './ksef-xsd-validation-error.js';
export { KSeFErrorCode } from './error-codes.js';
export { assertNever } from './assert-never.js';

import type { KSeFBadRequestError } from './ksef-bad-request-error.js';
import type { KSeFUnauthorizedError } from './ksef-unauthorized-error.js';
import type { KSeFForbiddenError } from './ksef-forbidden-error.js';
import type { KSeFGoneError } from './ksef-gone-error.js';
import type { KSeFRateLimitError } from './ksef-rate-limit-error.js';

export type KSeFApiProblem =
  | KSeFBadRequestError
  | KSeFUnauthorizedError
  | KSeFForbiddenError
  | KSeFGoneError
  | KSeFRateLimitError;
