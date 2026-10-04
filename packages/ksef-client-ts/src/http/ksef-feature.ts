import { KSeFValidationError } from '../errors/ksef-validation-error.js';

/** Header name for KSeF feature negotiation. */
export const KSEF_FEATURE_HEADER = 'X-KSeF-Feature' as const;

/** Known UPO format versions. */
export const UpoVersion = {
  /** UPO v4-2 format (default before 2026-01-05). */
  V4_2: 'upo-v4-2',
  /** UPO v4-3 format (default from 2026-01-05, adds InvoicingMode field). */
  V4_3: 'upo-v4-3',
} as const;

export type UpoVersion = (typeof UpoVersion)[keyof typeof UpoVersion];

/** Feature values for the X-KSeF-Feature header sent when opening a session (KSeF API v2.8.0). */
export const KSeFFeature = {
  /**
   * Validate the NIP numbers and internal identifiers of the parties on each
   * invoice. Available on the TEST environment only. An invoice with an invalid
   * identifier is rejected with status 450 instead of being accepted.
   */
  SubjectIdentifierValidation: 'subject-identifier-validation',
} as const;

export type KSeFFeature = (typeof KSeFFeature)[keyof typeof KSeFFeature];

/** XAdES compliance enforcement value for X-KSeF-Feature header. */
export const ENFORCE_XADES_COMPLIANCE = 'enforce-xades-compliance' as const;

/**
 * Collapse the feature value(s) for a session-open request into the single
 * X-KSeF-Feature value to send, or `undefined` when there is none. Every
 * string is split on commas and trimmed, so `'a, b'` counts as two values;
 * empty entries are dropped and repeats are merged.
 *
 * KSeF honours exactly one feature per request: a comma-separated list or a
 * repeated header is accepted with 201 but silently ignored, so none of the
 * features takes effect (observed on TEST, API 2.8.1). More than one distinct
 * value therefore throws instead of opening a session that quietly lacks them.
 */
export function resolveSessionFeature(
  ...inputs: Array<string | readonly string[] | undefined>
): string | undefined {
  const values = [...new Set(
    inputs
      .flatMap((input) => (input === undefined ? [] : typeof input === 'string' ? [input] : [...input]))
      .flatMap((input) => input.split(','))
      .map((value) => value.trim())
      .filter((value) => value !== ''),
  )];
  if (values.length > 1) {
    throw KSeFValidationError.fromField(
      'features',
      `KSeF applies only one ${KSEF_FEATURE_HEADER} value per session, got ${values.length}: ${values.join(', ')}`,
    );
  }
  return values[0];
}
