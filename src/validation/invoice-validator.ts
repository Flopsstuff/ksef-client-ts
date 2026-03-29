/**
 * Invoice XML validation service.
 *
 * Three independent validation levels:
 * - Level 1: XML well-formedness (xmldom parse)
 * - Level 2: Schema validation (xml→object→Zod safeParse)
 * - Level 3: Business rules (NIP/PESEL checksum verification)
 */

import type { SchemaType } from './schemas/index.js';
import { type XmlConversionResult, xmlToObject } from './xml-to-object.js';
import { SchemaRegistry } from './schema-registry.js';
import { isValidNip, isValidPesel } from './patterns.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type InvoiceValidationErrorCode =
  | 'MALFORMED_XML'
  | 'MISSING_REQUIRED_ELEMENT'
  | 'INVALID_VALUE'
  | 'INVALID_ENUM_VALUE'
  | 'PATTERN_MISMATCH'
  | 'MAX_OCCURS_EXCEEDED'
  | 'UNKNOWN_SCHEMA'
  | 'SCHEMA_VALIDATION_ERROR'
  | 'INVALID_NIP_CHECKSUM'
  | 'INVALID_PESEL_CHECKSUM';

export interface InvoiceValidationError {
  /** Error classification code. */
  code: InvoiceValidationErrorCode;
  /** Human-readable error message. */
  message: string;
  /** XPath-like path to the invalid element (e.g. "/Faktura/Podmiot1/NIP"). */
  path?: string;
}

export interface InvoiceValidationResult {
  /** Whether the invoice passed all requested validation levels. */
  valid: boolean;
  /** Detected or overridden schema type. */
  schemaType: SchemaType | null;
  /** Validation errors from all levels. */
  errors: InvoiceValidationError[];
}

export interface ValidateOptions {
  /** Explicit schema type override (skip auto-detection). */
  schema?: SchemaType;
}

// ─── Level 1: Well-formedness ───────────────────────────────────────────────

/**
 * Check that the XML string is well-formed (parseable).
 *
 * @param xml - Raw XML string.
 * @param _parsed - Pre-parsed XML result (internal optimisation, avoids re-parsing in `validate()`).
 */
export function validateWellFormedness(
  xml: string,
  _parsed?: XmlConversionResult,
): InvoiceValidationResult {
  if (!xml || !xml.trim()) {
    return {
      valid: false,
      schemaType: null,
      errors: [{ code: 'MALFORMED_XML', message: 'Empty XML input' }],
    };
  }

  const { object, rootElement, namespace, errors } = _parsed ?? xmlToObject(xml);

  if (errors.length > 0 || !object) {
    return {
      valid: false,
      schemaType: null,
      errors: errors.map(msg => ({ code: 'MALFORMED_XML' as const, message: msg })),
    };
  }

  const schemaType = SchemaRegistry.detect(namespace, rootElement);

  return { valid: true, schemaType, errors: [] };
}

// ─── Level 2: Schema validation ─────────────────────────────────────────────

/**
 * Validate XML against its Zod schema (auto-detected or explicit).
 *
 * @param xml - Raw XML string.
 * @param options - Validation options (e.g. explicit schema type override).
 * @param _parsed - Pre-parsed XML result (internal optimisation, avoids re-parsing in `validate()`).
 */
export async function validateSchema(
  xml: string,
  options?: ValidateOptions,
  _parsed?: XmlConversionResult,
): Promise<InvoiceValidationResult> {
  const { object, rootElement, namespace, errors: parseErrors } = _parsed ?? xmlToObject(xml);

  if (parseErrors.length > 0 || !object) {
    return {
      valid: false,
      schemaType: null,
      errors: parseErrors.map(msg => ({ code: 'MALFORMED_XML' as const, message: msg })),
    };
  }

  const schemaType = options?.schema ?? SchemaRegistry.detect(namespace, rootElement);

  if (!schemaType) {
    return {
      valid: false,
      schemaType: null,
      errors: [{
        code: 'UNKNOWN_SCHEMA',
        message: `Cannot detect schema type from namespace "${namespace}" and root element "${rootElement}"`,
      }],
    };
  }

  const schema = await SchemaRegistry.get(schemaType);
  const result = schema.safeParse(object);

  if (result.success) {
    return { valid: true, schemaType, errors: [] };
  }

  const prefix = rootElement ? `/${rootElement}/` : '/';
  const validationErrors: InvoiceValidationError[] = result.error.issues.map(issue => {
    const zodPath = issue.path.join('/');
    const path = zodPath ? `${prefix}${zodPath}` : (rootElement ? `/${rootElement}` : undefined);
    return {
      code: mapZodErrorCode(issue),
      message: issue.message,
      path,
    };
  });

  return { valid: false, schemaType, errors: validationErrors };
}

/** Map Zod error codes to our domain error codes. */
function mapZodErrorCode(issue: { code?: string; input?: unknown }): InvoiceValidationErrorCode {
  switch (issue.code) {
    case 'invalid_type':
      // Zod emits invalid_type both for missing values (input === undefined)
      // and for wrong data types (e.g., string where number expected).
      return issue.input === undefined
        ? 'MISSING_REQUIRED_ELEMENT'
        : 'INVALID_VALUE';
    case 'invalid_enum_value': // Zod v3
    case 'invalid_value':      // Zod v4
      return 'INVALID_ENUM_VALUE';
    case 'invalid_string': // Zod v3
    case 'invalid_format': // Zod v4
      return 'PATTERN_MISMATCH';
    case 'too_big':
      return 'MAX_OCCURS_EXCEEDED';
    default:
      return 'SCHEMA_VALIDATION_ERROR';
  }
}

// ─── Level 3: Business rules ────────────────────────────────────────────────

/**
 * Validate business rules: NIP/PESEL checksum verification on Podmiot elements.
 *
 * @param xml - Raw XML string.
 * @param _parsed - Pre-parsed XML result (internal optimisation, avoids re-parsing in `validate()`).
 */
export function validateBusinessRules(
  xml: string,
  _parsed?: XmlConversionResult,
): InvoiceValidationResult {
  const { object, rootElement, namespace, errors: parseErrors } = _parsed ?? xmlToObject(xml);

  if (parseErrors.length > 0 || !object) {
    return {
      valid: false,
      schemaType: null,
      errors: parseErrors.map(msg => ({ code: 'MALFORMED_XML' as const, message: msg })),
    };
  }

  const schemaType = SchemaRegistry.detect(namespace, rootElement);
  const errors: InvoiceValidationError[] = [];

  // Walk the object looking for NIP and PESEL fields in Podmiot* elements
  collectNipPeselErrors(object, rootElement ? `/${rootElement}` : '', errors);

  return { valid: errors.length === 0, schemaType, errors };
}

/** Recursively check NIP and PESEL values in the object tree. */
function collectNipPeselErrors(
  obj: Record<string, unknown>,
  path: string,
  errors: InvoiceValidationError[],
): void {
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}/${key}` : key;

    if (key === 'NIP' && typeof value === 'string') {
      if (!isValidNip(value)) {
        errors.push({
          code: 'INVALID_NIP_CHECKSUM',
          message: `Invalid NIP checksum: ${value}`,
          path: currentPath,
        });
      }
    } else if (key === 'PESEL' && typeof value === 'string') {
      if (!isValidPesel(value)) {
        errors.push({
          code: 'INVALID_PESEL_CHECKSUM',
          message: `Invalid PESEL checksum: ${value}`,
          path: currentPath,
        });
      }
    } else if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] === 'object' && value[i] !== null) {
            collectNipPeselErrors(value[i] as Record<string, unknown>, `${currentPath}/${i}`, errors);
          }
        }
      } else {
        collectNipPeselErrors(value as Record<string, unknown>, currentPath, errors);
      }
    }
  }
}

// ─── Combined validation ────────────────────────────────────────────────────

/**
 * Run all three validation levels (well-formedness → schema → business rules).
 * Short-circuits on first failing level.
 *
 * XML is parsed once and the result is reused across all three levels.
 */
export async function validate(
  xml: string,
  options?: ValidateOptions,
): Promise<InvoiceValidationResult> {
  // Parse XML once upfront — reused by all three levels.
  // The empty-input guard in validateWellFormedness runs before accessing
  // the parsed result, so passing undefined for empty strings is safe.
  const parsed = (xml && xml.trim()) ? xmlToObject(xml) : undefined;

  // Level 1: Well-formedness
  const l1 = validateWellFormedness(xml, parsed);
  if (!l1.valid) return l1;

  // Level 2: Schema validation
  const l2 = await validateSchema(xml, options, parsed);
  if (!l2.valid) return l2;

  // Level 3: Business rules
  const l3 = validateBusinessRules(xml, parsed);
  // Carry forward schema type from L2 (immutable — don't mutate l3)
  return { ...l3, schemaType: l2.schemaType };
}
