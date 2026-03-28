import type { FormCode } from '../common.js';
import { FORM_CODES, SystemCode } from './types.js';

const SYSTEM_CODE_TO_FORM_CODE: Record<SystemCode, FormCode> = {
  [SystemCode.FA_2]:      FORM_CODES.FA_2,
  [SystemCode.FA_3]:      FORM_CODES.FA_3,
  [SystemCode.PEF_3]:     FORM_CODES.PEF_3,
  [SystemCode.PEF_KOR_3]: FORM_CODES.PEF_KOR_3,
  [SystemCode.FA_RR_1]:   FORM_CODES.FA_RR_1,
};

const ALL_FORM_CODES = Object.values(FORM_CODES);

const BATCH_DISALLOWED_SYSTEM_CODES: ReadonlySet<string> = new Set([
  SystemCode.PEF_3,
  SystemCode.PEF_KOR_3,
]);

/**
 * Returns the default FormCode constant for a given SystemCode.
 * For FA_RR_1, returns the current variant (schemaVersion 1-1E, value FA_RR).
 */
export function getFormCode(systemCode: SystemCode): FormCode {
  return SYSTEM_CODE_TO_FORM_CODE[systemCode];
}

/**
 * Matches a raw FormCode from an API response to the closest typed constant.
 * Returns the raw object unchanged if no exact match is found.
 */
export function parseFormCode(raw: FormCode): FormCode {
  const match = ALL_FORM_CODES.find(
    (fc) =>
      fc.systemCode === raw.systemCode &&
      fc.schemaVersion === raw.schemaVersion &&
      fc.value === raw.value,
  );
  return match ?? raw;
}

/**
 * Validates whether a FormCode is valid for the given session type.
 * Batch sessions do not support PEF or PEF_KOR document types.
 */
export function validateFormCodeForSession(
  formCode: FormCode,
  sessionType: 'online' | 'batch',
): boolean {
  if (sessionType === 'online') return true;
  return !BATCH_DISALLOWED_SYSTEM_CODES.has(formCode.systemCode);
}
